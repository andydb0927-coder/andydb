import type {
  GenerationReference,
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'
import type { ModelProvider } from './model-provider-registry'
import { assertProviderResponse, fetchProviderResponse, readProviderJson } from './generation-errors'
import {
  ImageSizeResolver,
  type ImageSizePolicy,
} from './image-size-resolver'
import {
  resolveModelParameterManifest,
  standardImageAspectRatios,
  type ModelParameterManifest,
} from './model-parameter-semantics'

const configurationError = 'Seedream 开发验证配置未完成'
const defaultApiBase = 'https://ark.cn-beijing.volces.com/api/v3'
const defaultModelId = 'doubao-seedream-5-0-260128'

export const seedreamImageSizePolicy: ImageSizePolicy = {
  aspectOptions: [...standardImageAspectRatios, '自适应', '自定义'],
  resolutionTiers: [
    {
      id: '1K',
      squareEdge: 1024,
      exactSizes: {
        '1:1': [1024, 1024],
        '4:3': [1152, 864],
        '3:4': [864, 1152],
        '16:9': [1424, 800],
        '9:16': [800, 1424],
        '3:2': [1248, 832],
        '2:3': [832, 1248],
        '21:9': [1568, 672],
        '9:21': [672, 1568],
      },
    },
    {
      id: '1.5K',
      squareEdge: 1536,
      exactSizes: {
        '1:1': [1536, 1536],
        '4:3': [1792, 1344],
        '3:4': [1344, 1792],
        '16:9': [2048, 1152],
        '9:16': [1152, 2048],
        '3:2': [1872, 1248],
        '2:3': [1248, 1872],
        '21:9': [2352, 1008],
        '9:21': [1008, 2352],
      },
    },
    {
      id: '2K',
      squareEdge: 2048,
      exactSizes: {
        '1:1': [2048, 2048],
        '4:3': [2368, 1776],
        '3:4': [1776, 2368],
        '16:9': [2816, 1584],
        '9:16': [1584, 2816],
        '3:2': [2496, 1664],
        '2:3': [1664, 2496],
        '21:9': [3136, 1344],
        '9:21': [1344, 3136],
      },
    },
  ],
  pixelConstraints: {
    minTotalPixels: 921_600,
    maxTotalPixels: 4_624_220,
    minRatio: 1 / 16,
    maxRatio: 16,
  },
  multiImageStrategy: 'serial',
  costMode: { amount: 18, per: 'image' },
}

const seedreamParameterManifest: ModelParameterManifest = {
  aspectRatio: {
    semantic: true,
    options: seedreamImageSizePolicy.aspectOptions,
    defaultValue: '16:9',
  },
  resolution: true,
  count: true,
  customWidth: { type: 'number', defaultValue: 2048, min: 1, max: 10_000, step: 1 },
  customHeight: { type: 'number', defaultValue: 2048, min: 1, max: 10_000, step: 1 },
  editStrength: { type: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.05 },
  autoLink: { type: 'boolean', defaultValue: true },
}

const seedreamImageSizeResolver = new ImageSizeResolver(seedreamImageSizePolicy)

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

function imageSizeSetting(
  parameters: Record<string, string | number | boolean> | undefined,
) {
  return seedreamImageSizeResolver.resolve(parameters).apiValue
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
    persistence: 'project',
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
    apiDisplayName: 'Seedream',
    kind: 'live',
    ...(enabled ? {} : { disabledReason: configurationError }),
    capabilities: ['text-to-image', 'image-to-image', 'image-edit'],
    parameterManifest: seedreamParameterManifest,
    parameterSchema: resolveModelParameterManifest(seedreamParameterManifest),
    sizePolicy: seedreamImageSizePolicy,
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
      const requestCount = seedreamImageSizePolicy.multiImageStrategy === 'serial'
        ? count
        : 1
      for (let index = 0; index < requestCount; index += 1) {
        context.signal.throwIfAborted()
        const response = await fetchProviderResponse(fetchFn, 'seedream', createUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: context.signal,
        })
        await assertProviderResponse(response, 'seedream')
        const responseBody = await readProviderJson(response, 'Seedream 响应格式异常') as SeedreamResponse
        if (Array.isArray(responseBody.data)) outputs.push(...responseBody.data)
        context.onProgress?.(10 + Math.round(((index + 1) / requestCount) * 75))
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
