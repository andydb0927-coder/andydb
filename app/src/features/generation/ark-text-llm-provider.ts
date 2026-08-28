import type {
  GenerationRequest,
  GenerationResult,
  GenerationUsage,
} from './generation-adapter'
import type { ModelProvider } from './model-provider-registry'
import { assertProviderResponse, fetchProviderResponse, readProviderJson } from './generation-errors'
import {
  resolveModelParameterManifest,
  type ModelParameterManifest,
} from './model-parameter-semantics'

const missingConfiguration = '火山方舟文本开发验证配置未完成'
const disabledMode = '火山方舟文本开发验证未启用'
const defaultApiBase = 'https://ark.cn-beijing.volces.com/api/v3'
const defaultModelId = 'doubao-seed-2-1-pro-260628'
const inputPricePerMillionCny = 6
const outputPricePerMillionCny = 30

const arkTextParameterManifest: ModelParameterManifest = {
  maxTokens: {
    type: 'number',
    defaultValue: 1200,
    min: 1,
    max: 4096,
    step: 1,
  },
  temperature: {
    type: 'number',
    defaultValue: 0.7,
    min: 0,
    max: 2,
    step: 0.1,
  },
  thinking: {
    type: 'enum',
    defaultValue: 'disabled',
    options: ['disabled', 'enabled'],
  },
  stream: { type: 'boolean', defaultValue: false },
}

export interface ArkTextLlmProviderOptions {
  mode?: string
  apiKey?: string
  apiBase?: string
  modelId?: string
  fetchFn?: typeof fetch
}

interface ArkUsage {
  prompt_tokens?: unknown
  completion_tokens?: unknown
  total_tokens?: unknown
}

interface ArkMessage {
  content?: unknown
}

interface ArkChatResponse {
  choices?: Array<{ message?: ArkMessage }>
  usage?: ArkUsage
}

interface ArkStreamChunk {
  choices?: Array<{ delta?: ArkMessage }>
  usage?: ArkUsage
}

export interface ArkChatMessage {
  role: 'system' | 'user'
  content: string | Array<{ type: 'video_url'; video_url: { url: string; fps: number } } | { type: 'image_url'; image_url: { url: string } } | { type: 'text'; text: string }>
}

function envValue(name: string) {
  const env = import.meta.env as Record<string, string | undefined>
  const value = env[name]
  return typeof value === 'string' ? value.trim() : ''
}

function generationModeEnabled(mode: string) {
  const values = new Set(mode.split(',').map((value) => value.trim()))
  return values.has('ark-text-dev') || values.has('seedream-direct-dev')
}

function normalizedBaseUrl(apiBase: string) {
  return apiBase.replace(/\/+$/u, '')
}

function numberParameter(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const candidate = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(candidate)) return fallback
  return Math.min(max, Math.max(min, candidate))
}

function booleanParameter(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function safeInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : undefined
}

function normalizedUsage(usage: ArkUsage | undefined) {
  const inputTokens = safeInteger(usage?.prompt_tokens) ?? 0
  const outputTokens = safeInteger(usage?.completion_tokens) ?? 0
  const totalTokens = safeInteger(usage?.total_tokens) ?? inputTokens + outputTokens
  return { inputTokens, outputTokens, totalTokens }
}

function estimatedCostCny(usage: ReturnType<typeof normalizedUsage>) {
  return (
    usage.inputTokens * inputPricePerMillionCny +
    usage.outputTokens * outputPricePerMillionCny
  ) / 1_000_000
}

function systemPrompt(request: GenerationRequest) {
  if (request.parameters?.outputKind !== 'script') {
    return '你是中文创作助手。直接输出可用成稿，不要解释推理过程。'
  }
  const sceneCount = Math.round(
    numberParameter(request.parameters?.sceneCount, 3, 1, 20),
  )
  return [
    '你是中文分场剧本助手。',
    `请把大纲拆成 ${sceneCount} 个场次。`,
    '仅输出严格 JSON：{"chapters":[{"title":"场次 01","summary":"情节摘要"}]}。',
    '不要输出 Markdown 代码块或推理过程。',
  ].join('')
}

function requestBody(request: GenerationRequest, modelId: string, messages?: ArkChatMessage[]) {
  const stream = booleanParameter(request.parameters?.stream, false)
  const thinking = request.parameters?.thinking === 'enabled'
    ? 'enabled'
    : 'disabled'
  return {
    model: modelId,
    messages: (messages ?? [
      { role: 'system', content: systemPrompt(request) },
      { role: 'user', content: request.prompt.trim() },
    ]).map(message => request.systemPromptPrefix && message.role === 'system' && typeof message.content === 'string'
      ? { ...message, content: `${request.systemPromptPrefix}\n\n${message.content}` }
      : message),
    max_tokens: Math.round(
      numberParameter(request.parameters?.maxTokens, 1200, 1, 4096),
    ),
    temperature: numberParameter(
      request.parameters?.temperature,
      0.7,
      0,
      2,
    ),
    thinking: { type: thinking },
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  }
}

function textContent(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function readJsonResult(response: Response) {
  const body = await readProviderJson(response, '火山方舟豆包响应格式异常') as ArkChatResponse
  const content = textContent(body.choices?.[0]?.message?.content)
  if (!content) throw new Error('豆包未返回可用文本')
  return { content, usage: normalizedUsage(body.usage) }
}

function parseSseEvent(
  block: string,
  state: { content: string; usage: ReturnType<typeof normalizedUsage> },
) {
  for (const line of block.split(/\r?\n/u)) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    let chunk: ArkStreamChunk
    try {
      chunk = JSON.parse(payload) as ArkStreamChunk
    } catch {
      throw new Error('火山方舟豆包流式响应格式异常')
    }
    const delta = chunk.choices?.[0]?.delta?.content
    if (typeof delta === 'string') state.content += delta
    if (chunk.usage) state.usage = normalizedUsage(chunk.usage)
  }
}

async function readSseResult(response: Response) {
  if (!response.body) throw new Error('火山方舟豆包流式响应为空')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const state = {
    content: '',
    usage: normalizedUsage(undefined),
  }
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const blocks = buffer.split(/\r?\n\r?\n/u)
    buffer = blocks.pop() ?? ''
    for (const block of blocks) parseSseEvent(block, state)
    if (done) break
  }
  if (buffer.trim()) parseSseEvent(buffer, state)
  state.content = state.content.trim()
  if (!state.content) throw new Error('豆包未返回可用文本')
  return state
}

function dataUrl(content: string) {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`
}

function generationResult(
  request: GenerationRequest,
  content: string,
  usage: ReturnType<typeof normalizedUsage>,
): GenerationResult {
  const assetId = crypto.randomUUID()
  const providerUsage: GenerationUsage = {
    providerId: 'ark-text-llm',
    providerName: '火山方舟',
    modelName: '豆包 Seed 2.1 Pro',
    cost: 1,
    currency: 'credits',
    ...usage,
    estimatedCostCny: estimatedCostCny(usage),
  }
  return {
    persistence: 'project',
    asset: {
      id: assetId,
      kind: 'text',
      url: dataUrl(content),
      mimeType: 'text/plain',
    },
    version: {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      prompt: request.prompt,
      assetId,
      textContent: content,
    },
    usage: providerUsage,
  }
}

export function createArkTextLlmProvider(
  options: ArkTextLlmProviderOptions = {},
  buildMessages?: (request: GenerationRequest) => ArkChatMessage[],
): ModelProvider {
  const mode = options.mode ?? envValue('VITE_GENERATION_MODE')
  const apiKey = options.apiKey ?? envValue('VITE_SEEDREAM_API_KEY')
  const apiBase = options.apiBase ?? envValue('VITE_SEEDREAM_API_BASE')
  const modelId = options.modelId ?? envValue('VITE_ARK_TEXT_MODEL_ID')
  const modeEnabled = generationModeEnabled(mode)
  const enabled = modeEnabled && Boolean(apiKey)
  const disabledReason = modeEnabled ? missingConfiguration : disabledMode
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
  const createUrl = `${normalizedBaseUrl(apiBase || defaultApiBase)}/chat/completions`
  const resolvedModelId = modelId || defaultModelId

  return {
    id: 'ark-text-llm',
    name: '火山方舟',
    modelName: '豆包 Seed 2.1 Pro',
    apiDisplayName: '豆包',
    kind: 'live',
    ...(enabled ? {} : { disabledReason }),
    modelNotice:
      '官方按 token 计费：输入 6 元/百万 token，输出 30 元/百万 token。',
    capabilities: ['text'],
    parameterManifest: arkTextParameterManifest,
    parameterSchema: resolveModelParameterManifest(arkTextParameterManifest),
    pricing: { amount: 1, currency: 'credits', unit: 'generation' },
    tokenPricing: {
      inputPerMillionCny: inputPricePerMillionCny,
      outputPerMillionCny: outputPricePerMillionCny,
    },
    officialApiEndpoint: createUrl,
    async generate(request, context) {
      if (!enabled) throw new Error(disabledReason)
      context.signal.throwIfAborted()
      if (request.targetKind !== 'text') {
        throw new Error('火山方舟豆包 Provider 仅支持文本生成')
      }
      if (!request.prompt.trim()) throw new Error('豆包文本生成需要提示词')
      const body = requestBody(request, resolvedModelId, buildMessages?.(request))
      context.onProgress?.(10)
      const response = await fetchProviderResponse(fetchFn, 'ark-text', createUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: context.signal,
      })
      await assertProviderResponse(response, 'ark-text')
      const parsed = body.stream
        ? await readSseResult(response)
        : await readJsonResult(response)
      context.onProgress?.(90)
      const result = generationResult(
        request,
        parsed.content,
        parsed.usage,
      )
      context.onProgress?.(100)
      return result
    },
    async export(_request, context) {
      context.signal.throwIfAborted()
      throw new Error('火山方舟豆包文本 Provider 不支持视频导出')
    },
  }
}
