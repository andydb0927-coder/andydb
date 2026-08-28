import type {
  GenerationReference,
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'
import { assertProviderResponse, fetchProviderResponse, readProviderJson, safeProviderMessage } from './generation-errors'
import { normalizeTaskStatus } from './task-status'
import { resolveVideoReferences, videoGuidedPrompt, videoPromptManifest, videoReferenceFailure } from './video-generation-semantics'
import type {
  ModelProvider,
  VideoGenerationMode,
} from './model-provider-registry'
import {
  resolveModelParameterManifest,
  type ModelParameterManifest,
} from './model-parameter-semantics'

const configurationError = '火山方舟 Seedance 开发验证配置未完成'
const defaultApiBase = 'https://ark.cn-beijing.volces.com/api/v3'
const defaultModelId = 'doubao-seedance-2-0-260128'
const providerId = 'seedance-api'
const providerName = '火山方舟'
const modelName = 'Seedance 2.0'

const seedanceVideoParameterManifest: ModelParameterManifest = {
  ...videoPromptManifest,
  aspectRatio: {
    type: 'enum',
    defaultValue: 'Auto',
    options: ['Auto', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
  },
  duration: {
    type: 'enum',
    defaultValue: '5',
    options: Array.from({ length: 12 }, (_, index) => String(index + 4)),
  },
  quality: {
    type: 'enum',
    defaultValue: '720P',
    options: ['480P', '720P', '1080P', '4K'],
  },
  sound: { type: 'boolean', defaultValue: true },
  count: { type: 'enum', defaultValue: '1', options: ['1'] },
  autoLink: { type: 'boolean', defaultValue: true },
}

const supportedVideoModes: readonly VideoGenerationMode[] = [
  '文生视频',
  '全能参考',
  '图生视频',
  '首尾帧',
  '图片参考',
]

export interface SeedanceVideoProviderOptions {
  mode?: string
  apiKey?: string
  apiBase?: string
  modelId?: string
  fetchFn?: typeof fetch
  pollIntervalMs?: number
  maxPollAttempts?: number
}

interface SeedanceCreateResponse {
  id?: unknown
  data?: { id?: unknown }
}

interface SeedanceTaskError {
  code?: unknown
  message?: unknown
}

interface SeedanceTaskResponse {
  id?: unknown
  status?: unknown
  content?: { video_url?: unknown }
  error?: SeedanceTaskError
  duration?: unknown
  resolution?: unknown
  framespersecond?: unknown
  usage?: { completion_tokens?: unknown }
}

function envValue(name: string) {
  const env = import.meta.env as Record<string, string | undefined>
  const value = env[name]
  return typeof value === 'string' ? value.trim() : ''
}

function generationModeEnabled(mode: string, expected: string) {
  return mode.split(',').some((value) => value.trim() === expected)
}

function normalizedBaseUrl(apiBase: string) {
  return apiBase.replace(/\/+$/u, '')
}

function waitForPoll(delayMs: number, signal: AbortSignal) {
  signal.throwIfAborted()
  if (delayMs <= 0) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer)
      reject(new DOMException('Generation cancelled', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel)
      resolve()
    }, delayMs)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

function httpsResultUrl(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('火山方舟 Seedance 结果 URL 无效')
  }
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return url.toString()
  } catch {
    // Fall through to the safe product error below.
  }
  throw new Error('火山方舟 Seedance 结果 URL 无效')
}

function referenceUrl(reference: GenerationReference) {
  const value = reference.url.trim()
  if (/^data:(?:image|video|audio)\/[a-z0-9.+-]+;base64,/iu.test(value)) {
    return value
  }
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return url.toString()
  } catch {
    // Fall through to the safe product error below.
  }
  throw new Error('火山方舟 Seedance 参考素材必须是 HTTPS 地址或本地上传素材')
}

function booleanSetting(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function durationSetting(value: unknown) {
  const duration = Number(value ?? 5)
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) {
    throw new Error('火山方舟 Seedance 时长仅支持 4–15 秒整数')
  }
  return duration
}

function aspectRatioSetting(value: unknown) {
  const normalized = String(value ?? '').trim()
  if (normalized === 'Auto' || normalized === '自适应') return 'adaptive'
  if (['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'].includes(normalized)) {
    return normalized
  }
  return 'adaptive'
}

function resolutionSetting(parameters: GenerationRequest['parameters']) {
  const raw = String(parameters?.quality ?? parameters?.resolution ?? '720P')
    .trim()
    .toLowerCase()
  if (raw === '4k' || raw === '3840×2160' || raw === '3840x2160') return '4k'
  if (raw === '1080p' || raw === '1920×1080' || raw === '1920x1080') {
    return '1080p'
  }
  if (raw === '480p' || raw === '854×480' || raw === '854x480') return '480p'
  return '720p'
}

function referenceContent(
  references: GenerationReference[],
  generationMode: unknown,
) {
  const reason = videoReferenceFailure(references, generationMode)
  if (reason) throw new Error(reason)
  return resolveVideoReferences(references, generationMode).map((reference) => {
    const type = `${reference.kind}_url` as const
    const content = {
      type,
      [type]: { url: referenceUrl(reference) },
    }
    if (reference.kind === 'video') return { ...content, role: 'reference_video' }
    if (reference.kind === 'audio') return { ...content, role: 'reference_audio' }
    return { ...content, role: reference.role ?? 'reference_image' }
  })
}

function completionTokens(value: unknown) {
  const tokens = Number(value)
  return Number.isFinite(tokens) && tokens >= 0 ? tokens : undefined
}

export function seedanceVideoTokenRateCny(resolution: string, hasVideoInput: boolean) {
  if (resolution.toLowerCase() === '4k') return hasVideoInput ? 16 : 26
  if (resolution.toLowerCase() === '1080p') return hasVideoInput ? 31 : 51
  return hasVideoInput ? 28 : 46
}

function estimatedCostCny(tokens: number | undefined, resolution: string, hasVideoInput: boolean) {
  if (tokens === undefined) return undefined
  const rate = seedanceVideoTokenRateCny(resolution, hasVideoInput)
  return Number(((tokens / 1_000_000) * rate).toFixed(4))
}

function liveResult(
  request: GenerationRequest,
  task: SeedanceTaskResponse,
  resolution: string,
): GenerationResult {
  const assetId = crypto.randomUUID()
  const tokens = completionTokens(task.usage?.completion_tokens)
  const duration = Number(task.duration ?? request.parameters?.duration ?? 5)
  return {
    persistence: 'project',
    asset: {
      id: assetId,
      kind: 'video',
      url: httpsResultUrl(task.content?.video_url),
      mimeType: 'video/mp4',
      durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : 5,
      ...(typeof task.framespersecond === 'number' && Number.isFinite(task.framespersecond) && task.framespersecond > 0 ? { framesPerSecond: task.framespersecond } : {}),
      ...(typeof task.resolution === 'string' && ['480p', '720p', '1080p', '4k'].includes(task.resolution) ? { resolution: task.resolution } : {}),
    },
    version: {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      prompt: request.prompt,
      assetId,
    },
    ...(tokens === undefined
      ? {}
      : {
          usage: {
            providerId,
            providerName,
            modelName,
            cost: 135,
            currency: 'credits' as const,
            outputTokens: tokens,
            totalTokens: tokens,
            estimatedCostCny: estimatedCostCny(tokens,
              typeof task.resolution === 'string' && ['480p', '720p', '1080p', '4k'].includes(task.resolution) ? task.resolution : resolution,
              request.referenceAssets.some(({ kind }) => kind === 'video')),
          },
        }),
  }
}

export function createSeedanceVideoProvider(
  options: SeedanceVideoProviderOptions = {},
): ModelProvider {
  const mode = options.mode ?? envValue('VITE_GENERATION_MODE')
  const apiKey = options.apiKey ?? envValue('VITE_SEEDREAM_API_KEY')
  const apiBase = options.apiBase ?? envValue('VITE_SEEDREAM_API_BASE')
  const modelId = options.modelId ?? envValue('VITE_ARK_VIDEO_MODEL_ID')
  const enabled = Boolean(
    generationModeEnabled(mode, 'seedream-direct-dev') && apiKey,
  )
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
  const pollIntervalMs = options.pollIntervalMs ?? 2_000
  const maxPollAttempts = options.maxPollAttempts ?? 150
  const resolvedApiBase = normalizedBaseUrl(apiBase || defaultApiBase)
  const resolvedModelId = modelId || defaultModelId
  const createUrl = `${resolvedApiBase}/contents/generations/tasks`

  return {
    id: providerId,
    name: providerName,
    modelName,
    apiDisplayName: 'Seedance',
    kind: 'live',
    ...(enabled ? {} : { disabledReason: configurationError }),
    modelNotice: '火山方舟官方 Seedance 2.0，支持 4–15 秒、音画同步与最高 4K。',
    supportedVideoModes,
    capabilities: ['text-to-video', 'image-to-video'],
    parameterManifest: seedanceVideoParameterManifest,
    parameterSchema: resolveModelParameterManifest(
      seedanceVideoParameterManifest,
    ),
    pricing: { amount: 135, currency: 'credits', unit: 'generation' },
    officialApiEndpoint: createUrl,
    async generate(request, context) {
      if (!enabled) throw new Error(configurationError)
      context.signal.throwIfAborted()
      if (request.targetKind !== 'video') {
        throw new Error('火山方舟 Seedance Provider 仅支持视频生成')
      }
      const prompt = videoGuidedPrompt(request)
      if (!prompt && request.referenceAssets.length === 0) {
        throw new Error('火山方舟 Seedance 需要提示词或参考素材')
      }
      const resolution = resolutionSetting(request.parameters)
      const content = [
        ...(prompt ? [{ type: 'text' as const, text: prompt }] : []),
        ...referenceContent(
          request.referenceAssets,
          request.parameters?.generationMode,
        ),
      ]
      const response = await fetchProviderResponse(fetchFn, 'seedance', createUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: resolvedModelId,
          content,
          duration: durationSetting(request.parameters?.duration),
          ratio: aspectRatioSetting(request.parameters?.aspectRatio),
          resolution,
          generate_audio: booleanSetting(request.parameters?.sound, true),
          watermark: booleanSetting(request.parameters?.watermark, false),
        }),
        signal: context.signal,
      })
      await assertProviderResponse(response, 'seedance')
      const createBody = await readProviderJson(response, '火山方舟 Seedance 响应格式异常') as SeedanceCreateResponse
      const taskId = createBody.id ?? createBody.data?.id
      if (typeof taskId !== 'string' || !taskId.trim()) {
        throw new Error('火山方舟 Seedance 创建任务响应格式异常')
      }
      context.onProgress?.(10)

      const statusUrl = `${createUrl}/${encodeURIComponent(taskId)}`
      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        await waitForPoll(pollIntervalMs, context.signal)
        const statusResponse = await fetchProviderResponse(fetchFn, 'seedance', statusUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: context.signal,
        })
        await assertProviderResponse(statusResponse, 'seedance')
        const task = await readProviderJson(statusResponse, '火山方舟 Seedance 响应格式异常') as SeedanceTaskResponse
        const status = normalizeTaskStatus(task.status, { pending: 'queued', expired: 'failed' })
        if (!status) {
          throw new Error('火山方舟 Seedance 任务状态响应格式异常')
        }
        if (task.status === 'expired') {
          throw new Error('火山方舟 Seedance 任务已超时')
        }
        if (status === 'failed') {
          throw new Error(
            `火山方舟 Seedance 生成失败：${safeProviderMessage(task.error?.message)}`,
          )
        }
        if (status === 'cancelled') {
          throw new Error('火山方舟 Seedance 任务已取消')
        }
        if (status === 'succeeded') {
          const result = liveResult(request, task, resolution)
          context.onProgress?.(100)
          return result
        }
        context.onProgress?.(55)
      }
      throw new Error('火山方舟 Seedance 生成等待超时')
    },
    async export(_request, context) {
      context.signal.throwIfAborted()
      throw new Error('火山方舟 Seedance 视频 Provider 不支持项目导出')
    },
  }
}
