import type {
  GenerationReference,
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'
import type { ModelProvider } from './model-provider-registry'

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

const imageSizes = {
  '1K': {
    '1:1': '1024x1024',
    '16:9': '1344x768',
    '9:16': '768x1344',
    '2:3': '832x1248',
    '3:2': '1248x832',
  },
  '2K': {
    '1:1': '2048x2048',
    '16:9': '2560x1440',
    '9:16': '1440x2560',
    '2:3': '1664x2496',
    '3:2': '2496x1664',
  },
  '4K': {
    '1:1': '4096x4096',
    '16:9': '4096x2304',
    '9:16': '2304x4096',
    '2:3': '2730x4096',
    '3:2': '4096x2730',
  },
} as const

type SeedreamResolution = keyof typeof imageSizes
type SeedreamAspectRatio = keyof (typeof imageSizes)['2K']

function envValue(name: string) {
  const env = import.meta.env as Record<string, string | undefined>
  const value = env[name]
  return typeof value === 'string' ? value.trim() : ''
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

function resolutionSetting(value: unknown): SeedreamResolution {
  return value === '1K' || value === '4K' ? value : '2K'
}

function aspectRatioSetting(value: unknown): SeedreamAspectRatio {
  return value === '1:1' ||
    value === '9:16' ||
    value === '2:3' ||
    value === '3:2'
    ? value
    : '16:9'
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
  output: SeedreamOutput,
): GenerationResult {
  const assetId = crypto.randomUUID()
  const dimensions = outputSize(output.size)
  return {
    persistence: 'ephemeral',
    asset: {
      id: assetId,
      kind: 'image',
      url: httpsResultUrl(output.url),
      mimeType: 'image/png',
      ...(dimensions ?? {}),
    },
    version: {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      prompt: request.prompt,
      assetId,
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
  const enabled = Boolean(mode === 'seedream-direct-dev' && apiKey)
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
        options: ['1:1', '16:9', '9:16', '2:3', '3:2'],
      },
      resolution: {
        type: 'enum',
        defaultValue: '2K',
        options: ['1K', '2K', '4K'],
      },
      count: { type: 'enum', defaultValue: '1', options: ['1'] },
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
      if (count !== 1) throw new Error('Seedream 首次验证仅支持生成 1 张图片')

      const resolution = resolutionSetting(request.parameters?.resolution)
      const aspectRatio = aspectRatioSetting(request.parameters?.aspectRatio)
      const references = request.referenceAssets.map(referenceUrl)
      const body = {
        model: resolvedModelId,
        prompt,
        ...(references.length ? { image: references } : {}),
        size: imageSizes[resolution][aspectRatio],
        sequential_image_generation: 'disabled',
        stream: false,
        response_format: 'url',
        output_format: 'png',
        watermark: booleanSetting(request.parameters?.watermark, false),
      }

      context.onProgress?.(10)
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
      context.onProgress?.(85)
      const responseBody = await readJson(response) as SeedreamResponse
      const output = Array.isArray(responseBody.data)
        ? responseBody.data[0]
        : undefined
      if (!output) throw new Error('Seedream 未返回图片结果')
      const result = liveResult(request, output)
      context.onProgress?.(100)
      return result
    },
    async export(_request, context) {
      context.signal.throwIfAborted()
      throw new Error('Seedream 图片 Provider 不支持视频导出')
    },
  }
}
