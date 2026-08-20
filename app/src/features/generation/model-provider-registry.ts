import type {
  ExportResult,
  ExportSettings,
} from '../export/export-adapter'
import type {
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'

export type ModelCapability =
  | 'text-to-image'
  | 'image-to-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'audio'

export type ModelParameterName =
  | 'aspectRatio'
  | 'duration'
  | 'quality'
  | 'sound'
  | 'resolution'
  | 'count'
  | 'onlineSearch'
  | 'materialValidation'
  | 'autoLink'

export type ModelParameterDefinition =
  | {
      type: 'enum'
      defaultValue: string
      options: readonly string[]
    }
  | {
      type: 'boolean'
      defaultValue: boolean
    }

export type ModelParameterSchema = Partial<
  Record<ModelParameterName, ModelParameterDefinition>
>

export interface ModelProviderPricing {
  amount: number
  currency: 'credits'
  unit: 'generation' | 'second'
}

export interface ProviderExecutionContext {
  signal: AbortSignal
  onProgress?(percentage: number): void
}

export interface ProviderExportRequest {
  projectId: string
  settings: ExportSettings
}

export interface ModelProvider {
  id: string
  name: string
  modelName: string
  kind: 'demo' | 'placeholder'
  badge?: '演示'
  capabilities: readonly ModelCapability[]
  parameterSchema: ModelParameterSchema
  pricing: ModelProviderPricing
  officialApiEndpoint: string
  generate(
    request: GenerationRequest,
    context: ProviderExecutionContext,
  ): Promise<GenerationResult>
  export(
    request: ProviderExportRequest,
    context: ProviderExecutionContext,
  ): Promise<ExportResult>
}

const capabilityCopy: Record<ModelCapability, string> = {
  'text-to-image': '文生图',
  'image-to-image': '图生图',
  'text-to-video': '文生视频',
  'image-to-video': '图生视频',
  audio: '音频',
}

function generationCapability(request: GenerationRequest): ModelCapability {
  if (request.targetKind === 'audio') return 'audio'
  const hasMedia = request.referenceAssets.length > 0
  if (request.targetKind === 'image') {
    return hasMedia ? 'image-to-image' : 'text-to-image'
  }
  return hasMedia ? 'image-to-video' : 'text-to-video'
}

function providerCost(
  provider: ModelProvider,
  parameters?: GenerationRequest['parameters'],
) {
  const requestedCount = Number(parameters?.count ?? 1)
  const count =
    Number.isFinite(requestedCount) && requestedCount > 0 ? requestedCount : 1
  if (provider.pricing.unit === 'generation') {
    return provider.pricing.amount * count
  }
  const duration = Number(
    parameters?.duration ?? provider.parameterSchema.duration?.defaultValue ?? 1,
  )
  return (
    provider.pricing.amount *
    (Number.isFinite(duration) ? duration : 1) *
    count
  )
}

export function providerCapabilityLabel(provider: ModelProvider) {
  return provider.capabilities.map((capability) => capabilityCopy[capability]).join(' / ')
}

export function providerPricingLabel(provider: ModelProvider) {
  return `${provider.pricing.amount} 积分/${
    provider.pricing.unit === 'generation' ? '次' : '秒'
  }`
}

export function providerOptionLabel(provider: ModelProvider) {
  return [
    provider.name,
    provider.modelName,
    providerCapabilityLabel(provider),
    providerPricingLabel(provider),
    provider.kind === 'demo' ? provider.badge ?? '演示' : '待接入',
  ].join(' · ')
}

export function providerDefaultParameters(provider: ModelProvider) {
  return Object.fromEntries(
    Object.entries(provider.parameterSchema).flatMap(([name, definition]) =>
      definition ? [[name, definition.defaultValue]] : [],
    ),
  ) as Record<string, string | boolean>
}

export class ProviderRegistry {
  readonly #providers = new Map<string, ModelProvider>()

  constructor(providers: readonly ModelProvider[] = []) {
    providers.forEach((provider) => this.register(provider))
  }

  register(provider: ModelProvider) {
    if (this.#providers.has(provider.id)) {
      throw new Error(`Provider already registered: ${provider.id}`)
    }
    this.#providers.set(provider.id, provider)
    return this
  }

  list() {
    return [...this.#providers.values()]
  }

  matching(capabilities: readonly ModelCapability[]) {
    return this.list().filter((provider) =>
      capabilities.some((capability) => provider.capabilities.includes(capability)),
    )
  }

  require(id: string) {
    const provider = this.#providers.get(id)
    if (!provider) throw new Error(`Unknown model provider: ${id}`)
    return provider
  }

  resolve(request: GenerationRequest) {
    const capability = generationCapability(request)
    const provider = request.providerId
      ? this.require(request.providerId)
      : this.matching([capability]).find(({ kind }) => kind === 'demo')
    if (!provider) throw new Error(`No model provider for capability: ${capability}`)
    if (!provider.capabilities.includes(capability)) {
      throw new Error(`${provider.modelName} does not support ${capability}`)
    }
    return provider
  }

  describe(request: GenerationRequest) {
    const provider = this.resolve(request)
    return {
      providerId: provider.id,
      providerName: provider.name,
      modelName: provider.modelName,
      estimatedCost: providerCost(provider, request.parameters),
    }
  }

  async generate(
    request: GenerationRequest,
    context: ProviderExecutionContext,
  ): Promise<GenerationResult> {
    const provider = this.resolve(request)
    const result = await provider.generate(request, context)
    return {
      ...result,
      usage: {
        providerId: provider.id,
        providerName: provider.name,
        modelName: provider.modelName,
        cost: providerCost(provider, request.parameters),
        currency: 'credits',
      },
    }
  }

  async export(
    providerId: string,
    request: ProviderExportRequest,
    context: ProviderExecutionContext,
  ): Promise<ExportResult> {
    const provider = this.require(providerId)
    const result = await provider.export(request, context)
    return {
      ...result,
      providerId: provider.id,
      providerName: provider.name,
      modelName: provider.modelName,
      cost: providerCost(provider),
    }
  }
}

const imageSchema: ModelParameterSchema = {
  aspectRatio: {
    type: 'enum',
    defaultValue: '16:9',
    options: ['1:1', '4:3', '16:9', '9:16'],
  },
  resolution: {
    type: 'enum',
    defaultValue: '1920×1080',
    options: ['1024×1024', '1920×1080'],
  },
}

const videoSchema: ModelParameterSchema = {
  aspectRatio: {
    type: 'enum',
    defaultValue: '16:9',
    options: ['1:1', '16:9', '9:16'],
  },
  duration: {
    type: 'enum',
    defaultValue: '3',
    options: ['3', '5', '10'],
  },
  quality: {
    type: 'enum',
    defaultValue: '标准',
    options: ['标准', '高清', '4K'],
  },
  sound: { type: 'boolean', defaultValue: false },
  resolution: {
    type: 'enum',
    defaultValue: '1280×720',
    options: ['1280×720', '1920×1080'],
  },
  count: { type: 'enum', defaultValue: '1', options: ['1'] },
  autoLink: { type: 'boolean', defaultValue: true },
}

const seedanceVideoSchema: ModelParameterSchema = {
  aspectRatio: {
    type: 'enum',
    defaultValue: '16:9',
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
  resolution: {
    type: 'enum',
    defaultValue: '1280×720',
    options: ['854×480', '1280×720', '1920×1080', '3840×2160'],
  },
  count: { type: 'enum', defaultValue: '1', options: ['1', '2', '4'] },
  onlineSearch: { type: 'boolean', defaultValue: true },
  materialValidation: { type: 'boolean', defaultValue: true },
  autoLink: { type: 'boolean', defaultValue: true },
}

function abortError(message: string) {
  return new DOMException(message, 'AbortError')
}

function scheduledProgress<T>(
  context: ProviderExecutionContext,
  intervalMs: number,
  percentages: readonly number[],
  result: () => T,
) {
  return new Promise<T>((resolve, reject) => {
    let index = 0
    const cancel = () => {
      clearInterval(timer)
      reject(abortError('Generation cancelled'))
    }
    const timer = setInterval(() => {
      const percentage = percentages[index]
      context.onProgress?.(percentage)
      index += 1
      if (index < percentages.length) return
      clearInterval(timer)
      context.signal.removeEventListener('abort', cancel)
      resolve(result())
    }, intervalMs)
    if (context.signal.aborted) cancel()
    else context.signal.addEventListener('abort', cancel, { once: true })
  })
}

function demoProvider(config: Omit<ModelProvider, 'kind' | 'badge' | 'generate' | 'export'>): ModelProvider {
  return {
    ...config,
    kind: 'demo',
    badge: '演示',
    generate(request, context) {
      return scheduledProgress(context, 300, [25, 55, 85, 100], () => {
        const assetId = crypto.randomUUID()
        const video = request.targetKind === 'video'
        const audio = request.targetKind === 'audio'
        const requestedDuration = Number(
          request.parameters?.duration ??
            config.parameterSchema.duration?.defaultValue ??
            3,
        )
        const durationSeconds = Number.isFinite(requestedDuration)
          ? requestedDuration
          : 3
        return {
          asset: audio
            ? {
                id: assetId,
                kind: 'audio' as const,
                url: '/demo/audio-preview.mp3',
                mimeType: 'audio/mpeg',
                durationSeconds: 5,
              }
            : video
              ? {
                  id: assetId,
                  kind: 'video' as const,
                  url: '/demo/video-preview.mp4',
                  mimeType: 'video/mp4',
                  width: 1280,
                  height: 720,
                  durationSeconds,
                }
              : {
                  id: assetId,
                  kind: 'image' as const,
                  url: request.referenceAssets[0]?.url ?? '/demo/shot-river.png',
                  mimeType: 'image/png',
                  width: 1920,
                  height: 1080,
                },
          version: {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            prompt: request.prompt,
            assetId,
          },
        }
      })
    },
    export(request, context) {
      return scheduledProgress(context, 300, [17, 33, 50, 67, 83, 100], () => ({
        exportJobId: `demo-export-${request.projectId}`,
        downloadUrl: `/demo/exports/${request.projectId}.mp4`,
        completedAt: new Date().toISOString(),
      }))
    },
  }
}

function placeholderProvider(
  config: Omit<ModelProvider, 'kind' | 'generate' | 'export'>,
): ModelProvider {
  const unavailable = async (context: ProviderExecutionContext) => {
    context.signal.throwIfAborted()
    throw new Error(`${config.name} API 尚未配置；当前仅提供接口占位。`)
  }
  return {
    ...config,
    kind: 'placeholder',
    generate: (_request, context) => unavailable(context),
    export: (_request, context) => unavailable(context),
  }
}

export function createDefaultProviderRegistry() {
  return new ProviderRegistry([
    demoProvider({
      id: 'mock-mj-image',
      name: 'Mock Studio',
      modelName: 'MJ 风格图片',
      capabilities: ['text-to-image', 'image-to-image'],
      parameterSchema: imageSchema,
      pricing: { amount: 18, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'mock://local/mj-image',
    }),
    demoProvider({
      id: 'mock-kling-video',
      name: 'Mock Studio',
      modelName: '可灵风格视频',
      capabilities: ['text-to-video', 'image-to-video'],
      parameterSchema: videoSchema,
      pricing: { amount: 24, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'mock://local/kling-video',
    }),
    demoProvider({
      id: 'mock-seedance-video',
      name: 'Mock Studio',
      modelName: 'Seedance 2.0',
      capabilities: ['text-to-video', 'image-to-video'],
      parameterSchema: seedanceVideoSchema,
      pricing: { amount: 135, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'mock://local/seedance-video',
    }),
    demoProvider({
      id: 'mock-audio',
      name: 'Mock Studio',
      modelName: '音频生成',
      capabilities: ['audio'],
      parameterSchema: {
        duration: { type: 'enum', defaultValue: '5', options: ['5', '10', '30'] },
        quality: { type: 'enum', defaultValue: '标准', options: ['标准', '高清'] },
      },
      pricing: { amount: 6, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'mock://local/audio',
    }),
    placeholderProvider({
      id: 'kling-api',
      name: 'Kling',
      modelName: 'Kling 官方 API',
      capabilities: ['text-to-video', 'image-to-video'],
      parameterSchema: videoSchema,
      pricing: { amount: 24, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'https://api.klingai.com/v1/videos/generations',
    }),
    placeholderProvider({
      id: 'seedance-api',
      name: 'Seedance',
      modelName: 'Seedance 官方 API',
      capabilities: ['text-to-video', 'image-to-video'],
      parameterSchema: seedanceVideoSchema,
      pricing: { amount: 135, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
    }),
    placeholderProvider({
      id: 'tongyi-api',
      name: '通义万相',
      modelName: 'Tongyi 官方 API',
      capabilities: ['text-to-image', 'image-to-image', 'text-to-video', 'image-to-video'],
      parameterSchema: { ...imageSchema, ...videoSchema },
      pricing: { amount: 18, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc',
    }),
  ])
}

export const defaultProviderRegistry = createDefaultProviderRegistry()
