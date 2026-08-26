import type {
  GenerationReference,
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'
import type { ModelProvider } from './model-provider-registry'
import {
  customImageSizeLimits,
  resolveSeedreamImageSize,
  seedreamAspectRatioOptions,
} from './image-size'

const configurationError = 'Seedream 开发验证配置未完成'
const defaultApiBase = 'https://ark.cn-beijing.volces.com/api/v3'
const defaultModelId = 'doubao-seedream-5-0-260128'

export interface SeedreamLiveProviderOptions {
  mode?: string
  apiKey?: string
  apiBase?: string
  modelId?: string
  fetchFn?: typeof fetch
}

interface SeedreamOutput {
  url?: unknown
  size?: unknown
}

interface SeedreamResponse {
  model?: unknown
  data?: SeedreamOutput[]
}

interface SeedreamErrorResponse {
  error?: {
    code?: unknown
  }
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

async function readJson(response: Response) {
  try {
    return await response.json() as unknown
  } catch {
    throw new Error('Seedream 响应格式异常')
  }
}

async function assertSuccessfulResponse(response: Response) {
  if (response.ok) return
  if (response.status === 401) throw new Error('Seedream 鉴权失败（401）')
  if (response.status === 403) throw new Error('Seedream 访问被拒绝（403）')
  if (response.status === 429) {
    throw new Error('Seedream 请求过于频繁或额度不足（429）')
  }
  if (response.status === 400) {
    let code = ''
    try {
      const body = await response.json() as SeedreamErrorResponse
      code = typeof body.error?.code === 'string' ? body.error.code : ''
    } catch {
      // Keep malformed upstream details out of the user-facing error.
    }
    if (code === 'InputTextSensitiveContentDetected') {
      throw new Error('Seedream 提示词未通过安全检查（400）')
    }
    if (code === 'InputImageSensitiveContentDetected') {
      throw new Error('Seedream 参考图片未通过安全检查（400）')
    }
    if (code === 'OutputImageSensitiveContentDetected') {
      throw new Error('Seedream 生成结果未通过安全检查（400）')
    }
    throw new Error('Seedream 请求参数无效（400）')
  }
  throw new Error(`Seedream 请求失败（${response.status}）`)
}

function imageSizeSetting(
  parameters: Record<string, string | number | boolean> | undefined,
) {
  return resolveSeedreamImageSize(parameters).apiValue
}

function booleanSetting(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function outputSize(value: unknown) {
  if (typeof value !== 'string') return undefined
  const match = /^(\d+)[x×](\d+)$/u.exec(value.trim())
  if (!match) return undefined
  const width = Number(match[1])
  const height = Number(match[2])
  return Number.isFinite(width) && Number.isFinite(height)
    ? { width, height }
    : undefined
}

function httpsResultUrl(value: unknown) {
  if (typeof value !== 'string') throw new Error('Seedream 结果 URL 无效')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Seedream 结果 URL 无效')
  }
  if (url.protocol !== 'https:') throw new Error('Seedream 结果 URL 无效')
  return url.toString()
}

function referenceUrl(reference: GenerationReference) {
  const value = reference.url.trim()
  if (/^data:image\/(?:png|jpeg|webp);base64,/u.test(value)) return value
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return url.toString()
  } catch {
    // Fall through to the safe product error below.
  }
  throw new Error('Seedream 参考图片必须是 HTTPS 地址或本地上传图片')
}

function liveResult(
  request: GenerationRequest,
  outputs: SeedreamOutput[],
): GenerationResult {
  const assets = outputs.map((output) => {
    const dimensions = outputSize(output.size)
    return {
      id: crypto.randomUUID(),
      kind: 'image' as const,
      url: httpsResultUrl(output.url),
      mimeType: 'image/png',
      ...(dimensions ?? {}),
    }
  })
  const asset = assets[0]
  if (!asset) throw new Error('Seedream 未返回图片结果')
  return {
    persistence: 'ephemeral',
    asset,
    assets,
    version: {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      prompt: request.prompt,
      assetId: asset.id,
    },
  }
}

export function createSeedreamLiveProvider(
  options: SeedreamLiveProviderOptions = {},
): ModelProvider {
  const mode = options.mode ?? envValue('VITE_GENERATION_MODE')
  const apiKey = options.apiKey ?? envValue('VITE_SEEDREAM_API_KEY')
  const apiBase = options.apiBase ?? envValue('VITE_SEEDREAM_API_BASE')
  const modelId = options.modelId ?? envValue('VITE_SEEDREAM_MODEL_ID')
  const enabled = Boolean(
    generationModeEnabled(mode, 'seedream-direct-dev') && apiKey,
  )
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
  const resolvedApiBase = normalizedBaseUrl(apiBase || defaultApiBase)
  const resolvedModelId = modelId || defaultModelId
  const createUrl = `${resolvedApiBase}/images/generations`

  return {
    id: 'seedream-5-pro-api',
    name: '火山方舟',
    modelName: 'Seedream 5.0 Pro',
    kind: 'live',
    ...(enabled ? {} : { disabledReason: configurationError }),
    capabilities: ['text-to-image', 'image-to-image', 'image-edit'],
    parameterSchema: {
      aspectRatio: {
        type: 'enum',
        defaultValue: '16:9',
        options: [
          ...seedreamAspectRatioOptions,
          '自适应',
          '自定义',
        ],
      },
      resolution: {
        type: 'enum',
        defaultValue: '2K',
        options: ['1K', '1.5K', '2K'],
      },
      count: { type: 'enum', defaultValue: '1', options: ['1', '2', '4'] },
      customWidth: {
        type: 'number',
        defaultValue: 2048,
        min: customImageSizeLimits.inputMin,
        max: customImageSizeLimits.inputMax,
        step: 1,
      },
      customHeight: {
        type: 'number',
        defaultValue: 2048,
        min: customImageSizeLimits.inputMin,
        max: customImageSizeLimits.inputMax,
        step: 1,
      },
      editStrength: {
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
      },
      autoLink: { type: 'boolean', defaultValue: true },
    },
    pricing: { amount: 18, currency: 'credits', unit: 'generation' },
    officialApiEndpoint: createUrl,
    async generate(request, context) {
      if (!enabled) throw new Error(configurationError)
      context.signal.throwIfAborted()
      if (request.targetKind !== 'image') {
        throw new Error('Seedream Provider 仅支持图片生成')
      }
      const prompt = request.prompt.trim()
      if (!prompt) throw new Error('Seedream 生图需要提示词')
      const count = Number(request.parameters?.count ?? 1)
      if (count !== 1 && count !== 2 && count !== 4) {
        throw new Error('Seedream 生成数量仅支持 1、2 或 4 张')
      }

      const references = request.referenceAssets.map(referenceUrl)
      const body = {
        model: resolvedModelId,
        prompt,
        ...(references.length ? { image: references } : {}),
        size: imageSizeSetting(request.parameters),
        response_format: 'url',
        output_format: 'png',
        watermark: booleanSetting(request.parameters?.watermark, false),
      }

      context.onProgress?.(10)
      const outputs: SeedreamOutput[] = []
      for (let index = 0; index < count; index += 1) {
        context.signal.throwIfAborted()
        const response = await fetchFn(createUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: context.signal,
        })
        await assertSuccessfulResponse(response)
        const responseBody = await readJson(response) as SeedreamResponse
        if (Array.isArray(responseBody.data)) outputs.push(...responseBody.data)
        context.onProgress?.(10 + Math.round(((index + 1) / count) * 75))
      }
      if (!outputs.length) throw new Error('Seedream 未返回图片结果')
      const result = liveResult(request, outputs)
      context.onProgress?.(100)
      return result
    },
    async export(_request, context) {
      context.signal.throwIfAborted()
      throw new Error('Seedream 图片 Provider 不支持视频导出')
    },
  }
}
