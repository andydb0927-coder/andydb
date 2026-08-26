import { withAppBase } from '../../app/public-url'

import type {
  ExportResult,
  ExportSettings,
} from '../export/export-adapter'
import type {
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'
import {
  createSeedanceVideoProvider,
  type SeedanceVideoProviderOptions,
} from './seedance-video-provider'
import {
  createSeedreamLiveProvider,
  type SeedreamLiveProviderOptions,
} from './seedream-live-provider'
import {
  createArkTextLlmProvider,
  type ArkTextLlmProviderOptions,
} from './ark-text-llm-provider'
import {
  createArkTtsProvider,
  type ArkTtsProviderOptions,
} from './ark-tts-provider'
import {
  createArkAudioGenProvider,
  type ArkAudioGenProviderOptions,
} from './ark-audio-gen-provider'
import { ImageSizeResolver, type ImageSizePolicy } from './image-size-resolver'
import {
  resolveModelParameterManifest,
  type ModelParameterManifest,
  type ModelParameterSchema,
} from './model-parameter-semantics'

export type {
  ModelParameterDefinition,
  ModelParameterManifest,
  ModelParameterName,
  ModelParameterSchema,
} from './model-parameter-semantics'

export type ModelCapability =
  | 'text'
  | 'text-to-image'
  | 'image-to-image'
  | 'image-edit'
  | 'text-to-video'
  | 'image-to-video'
  | 'audio'
  | 'panorama-720'

export interface ModelProviderPricing {
  amount: number
  currency: 'credits'
  unit: 'generation' | 'second'
}

export interface ModelProviderVariant {
  id: string
  name: string
  pricing: ModelProviderPricing
  defaultParameters?: Readonly<Record<string, string | number | boolean>>
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
  apiDisplayName?: string
  kind: 'demo' | 'placeholder' | 'live'
  badge?: '演示'
  selectorVisible?: boolean
  disabledReason?: string
  modelNotice?: string
  supportedVideoModes?: readonly VideoGenerationMode[]
  capabilities: readonly ModelCapability[]
  parameterManifest: ModelParameterManifest
  parameterSchema: ModelParameterSchema
  sizePolicy?: ImageSizePolicy
  pricing: ModelProviderPricing
  tokenPricing?: {
    inputPerMillionCny: number
    outputPerMillionCny: number
  }
  officialApiEndpoint: string
  variants?: readonly ModelProviderVariant[]
  generate(
    request: GenerationRequest,
    context: ProviderExecutionContext,
  ): Promise<GenerationResult>
  export(
    request: ProviderExportRequest,
    context: ProviderExecutionContext,
  ): Promise<ExportResult>
}

export const videoGenerationModeDefinitions = [
  { mode: '文生视频', capability: 'text-to-video' },
  { mode: '全能参考', capability: 'image-to-video' },
  { mode: '图生视频', capability: 'image-to-video' },
  { mode: '首尾帧', capability: 'image-to-video' },
  { mode: '图片参考', capability: 'image-to-video' },
] as const satisfies readonly {
  mode: string
  capability: ModelCapability
}[]

export type VideoGenerationMode =
  (typeof videoGenerationModeDefinitions)[number]['mode']

export const defaultVideoGenerationMode: VideoGenerationMode = '全能参考'

export function isVideoGenerationMode(
  value: unknown,
): value is VideoGenerationMode {
  return videoGenerationModeDefinitions.some(({ mode }) => mode === value)
}

export function providerSupportsVideoGenerationMode(
  provider: ModelProvider,
  mode: VideoGenerationMode,
) {
  if (provider.supportedVideoModes) {
    return provider.supportedVideoModes.includes(mode)
  }
  const definition = videoGenerationModeDefinitions.find(
    (candidate) => candidate.mode === mode,
  )
  return Boolean(
    definition && provider.capabilities.includes(definition.capability),
  )
}

export function resolveVideoGenerationMode(
  provider: ModelProvider,
  requestedMode: unknown = defaultVideoGenerationMode,
): VideoGenerationMode | undefined {
  const preferred = isVideoGenerationMode(requestedMode)
    ? requestedMode
    : defaultVideoGenerationMode
  if (providerSupportsVideoGenerationMode(provider, preferred)) return preferred
  return videoGenerationModeDefinitions.find(({ capability }) =>
    provider.capabilities.includes(capability),
  )?.mode
}

const capabilityCopy: Record<ModelCapability, string> = {
  text: '文本',
  'text-to-image': '文生图',
  'image-to-image': '图生图',
  'image-edit': '图片编辑',
  'text-to-video': '文生视频',
  'image-to-video': '图生视频',
  audio: '音频',
  'panorama-720': '720全景生成',
}

function generationCapability(request: GenerationRequest): ModelCapability {
  if (request.targetKind === 'text') return 'text'
  if (request.targetKind === 'audio') return 'audio'
  const hasMedia = request.referenceAssets.length > 0
  if (request.targetKind === 'image') {
    return hasMedia ? 'image-to-image' : 'text-to-image'
  }
  return hasMedia ? 'image-to-video' : 'text-to-video'
}

export function providerGenerationCost(
  provider: ModelProvider,
  parameters?: GenerationRequest['parameters'],
) {
  const requestedCount = Number(parameters?.count ?? 1)
  const count =
    Number.isFinite(requestedCount) && requestedCount > 0 ? requestedCount : 1
  const variant = provider.variants?.find(
    ({ id }) => id === parameters?.modelVariant,
  )
  const pricing = variant?.pricing ?? provider.pricing
  if (provider.sizePolicy?.costMode) {
    return provider.sizePolicy.costMode.amount * (
      provider.sizePolicy.costMode.per === 'image' ? count : 1
    )
  }
  if (pricing.unit === 'generation') {
    return pricing.amount * count
  }
  const duration = Number(
    parameters?.duration ?? provider.parameterSchema.duration?.defaultValue ?? 1,
  )
  return (
    pricing.amount *
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
  const status =
    provider.kind === 'demo'
      ? provider.badge ?? '演示'
      : provider.disabledReason
        ? provider.disabledReason
        : provider.kind === 'live'
          ? '开发直连'
          : '待接入'
  return [
    provider.name,
    provider.modelName,
    providerCapabilityLabel(provider),
    providerPricingLabel(provider),
    status,
  ].join(' · ')
}

export function modelProviderVariants(provider: ModelProvider) {
  return provider.variants ?? []
}

export function modelProviderVariant(
  provider: ModelProvider,
  variantId?: string,
) {
  return (
    provider.variants?.find(({ id }) => id === variantId) ??
    provider.variants?.[0]
  )
}

export function modelProviderVariantCost(
  provider: ModelProvider,
  variantId?: string,
) {
  return modelProviderVariant(provider, variantId)?.pricing.amount ?? provider.pricing.amount
}

export function isProviderEnabled(provider: ModelProvider) {
  return provider.kind !== 'placeholder' && provider.disabledReason === undefined
}

export function providerDefaultParameters(provider: ModelProvider) {
  return Object.fromEntries(
    Object.entries(provider.parameterSchema).flatMap(([name, definition]) =>
      definition ? [[name, definition.defaultValue]] : [],
    ),
  ) as Record<string, string | number | boolean>
}

export const providerMenuGroupDefinitions = [
  { id: 'live', label: '官方 API 已接（开发直连）' },
  { id: 'pending', label: '待接入' },
  { id: 'demo', label: '本地演示' },
] as const

export type ProviderMenuGroupId =
  (typeof providerMenuGroupDefinitions)[number]['id']

export function providerMenuGroup(provider: ModelProvider): ProviderMenuGroupId {
  if (provider.kind === 'live') return 'live'
  if (provider.kind === 'placeholder') return 'pending'
  return 'demo'
}

export function groupProvidersForMenu(providers: readonly ModelProvider[]) {
  return providerMenuGroupDefinitions.flatMap((definition) => {
    const items = providers.filter(
      (provider) => providerMenuGroup(provider) === definition.id,
    )
    return items.length ? [{ ...definition, providers: items }] : []
  })
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
      provider.selectorVisible !== false &&
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
    const preferredDemoId =
      capability === 'text-to-image' || capability === 'image-to-image'
        ? 'mock-mj-image'
        : capability === 'text-to-video' || capability === 'image-to-video'
          ? 'mock-seedance-25'
          : capability === 'text'
            ? 'mock-text-llm'
            : capability === 'audio'
              ? 'mock-audio'
              : undefined
    const provider = request.providerId
      ? this.require(request.providerId)
      : preferredDemoId && this.#providers.get(preferredDemoId)?.capabilities.includes(capability)
        ? this.#providers.get(preferredDemoId)
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
      estimatedCost: providerGenerationCost(provider, request.parameters),
    }
  }

  async generate(
    request: GenerationRequest,
    context: ProviderExecutionContext,
  ): Promise<GenerationResult> {
    const provider = this.resolve(request)
    if (!isProviderEnabled(provider)) {
      throw new Error(
        provider.disabledReason ?? `${provider.name} API 尚未配置；当前仅提供接口占位。`,
      )
    }
    const result = await provider.generate(request, context)
    return {
      ...result,
      usage: {
        ...result.usage,
        providerId: provider.id,
        providerName: provider.name,
        modelName: provider.modelName,
        cost: providerGenerationCost(provider, request.parameters),
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
      cost: providerGenerationCost(provider),
    }
  }
}

const imageSchema: ModelParameterManifest = {
  aspectRatio: true,
  quality: {
    type: 'enum',
    defaultValue: '标准画质',
    options: ['低画质', '标准画质', '高画质'],
  },
  resolution: {
    type: 'enum',
    defaultValue: '2K',
    options: ['1K', '2K', '4K'],
  },
  count: true,
  autoLink: { type: 'boolean', defaultValue: true },
}

const styleImageSchema: ModelParameterManifest = {
  aspectRatio: {
    type: 'enum',
    defaultValue: '16:9',
    options: ['1:1', '9:16', '16:9', '3:4', '4:3', '3:2', '2:3'],
  },
  resolution: {
    type: 'enum',
    defaultValue: '自适应',
    options: ['自适应'],
  },
  count: { type: 'enum', defaultValue: '4', options: ['4'] },
  editStrength: { type: 'number', defaultValue: 0.6, min: 0, max: 1, step: 0.05 },
  autoLink: { type: 'boolean', defaultValue: true },
}

const styleImageV82Schema: ModelParameterManifest = {
  aspectRatio: {
    type: 'enum',
    defaultValue: '16:9',
    options: ['16:9'],
  },
  resolution: {
    type: 'enum',
    defaultValue: '自适应',
    options: ['自适应'],
  },
  count: { type: 'enum', defaultValue: '4', options: ['4'] },
  editStrength: { type: 'number', defaultValue: 0.6, min: 0, max: 1, step: 0.05 },
  autoLink: { type: 'boolean', defaultValue: true },
}

const imageEditSchema: ModelParameterManifest = {
  ...imageSchema,
  editStrength: { type: 'number', defaultValue: 0.6, min: 0, max: 1, step: 0.05 },
}

const tongyiImageSchema: ModelParameterManifest = {
  aspectRatio: {
    type: 'enum',
    defaultValue: '16:9',
    options: ['1:1', '16:9', '9:16', '2:3', '3:2'],
  },
  resolution: {
    type: 'enum',
    defaultValue: '2K',
    options: ['1K', '2K'],
  },
}

const videoSchema: ModelParameterManifest = {
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

const seedance25VideoSchema: ModelParameterManifest = {
  aspectRatio: {
    type: 'enum',
    defaultValue: '16:9',
    options: ['Auto', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
  },
  duration: {
    type: 'enum',
    defaultValue: '5',
    options: ['5', '10', '15', '20', '30'],
  },
  quality: {
    type: 'enum',
    defaultValue: '1080P',
    options: ['720P', '1080P'],
  },
  sound: { type: 'boolean', defaultValue: true },
  resolution: {
    type: 'enum',
    defaultValue: '1920×1080',
    options: ['1280×720', '1920×1080'],
  },
  count: { type: 'enum', defaultValue: '1', options: ['1'] },
  onlineSearch: { type: 'boolean', defaultValue: true },
  materialValidation: { type: 'boolean', defaultValue: true },
  autoLink: { type: 'boolean', defaultValue: true },
}

const klingO3VideoSchema: ModelParameterManifest = {
  aspectRatio: {
    type: 'enum',
    defaultValue: '16:9',
    options: ['16:9', '9:16', '1:1'],
  },
  duration: {
    type: 'enum',
    defaultValue: '5',
    options: ['3', '5', '10'],
  },
  quality: {
    type: 'enum',
    defaultValue: '高清',
    options: ['标准', '高清', '4K'],
  },
  sound: { type: 'boolean', defaultValue: true },
  resolution: {
    type: 'enum',
    defaultValue: '1920×1080',
    options: ['1280×720', '1920×1080', '3840×2160'],
  },
  count: { type: 'enum', defaultValue: '1', options: ['1'] },
  multiShot: { type: 'boolean', defaultValue: true },
  materialValidation: { type: 'boolean', defaultValue: true },
  autoLink: { type: 'boolean', defaultValue: true },
}

const kling30VideoSchema: ModelParameterManifest = {
  aspectRatio: {
    type: 'enum',
    defaultValue: '16:9',
    options: ['16:9', '9:16', '1:1'],
  },
  duration: {
    type: 'enum',
    defaultValue: '5',
    options: ['5', '10'],
  },
  quality: {
    type: 'enum',
    defaultValue: '高清',
    options: ['标准', '高清'],
  },
  resolution: {
    type: 'enum',
    defaultValue: '1920×1080',
    options: ['1280×720', '1920×1080'],
  },
  count: { type: 'enum', defaultValue: '1', options: ['1'] },
  multiShot: { type: 'boolean', defaultValue: true },
  materialValidation: { type: 'boolean', defaultValue: true },
  autoLink: { type: 'boolean', defaultValue: true },
}

const minimaxH3VideoSchema: ModelParameterManifest = {
  aspectRatio: {
    type: 'enum',
    defaultValue: '16:9',
    options: ['Auto', '16:9', '9:16', '1:1'],
  },
  duration: {
    type: 'enum',
    defaultValue: '5',
    options: ['5', '10'],
  },
  quality: {
    type: 'enum',
    defaultValue: '1080P',
    options: ['720P', '1080P'],
  },
  sound: { type: 'boolean', defaultValue: true },
  resolution: {
    type: 'enum',
    defaultValue: '1920×1080',
    options: ['1280×720', '1920×1080'],
  },
  count: { type: 'enum', defaultValue: '1', options: ['1'] },
  materialValidation: { type: 'boolean', defaultValue: true },
  autoLink: { type: 'boolean', defaultValue: true },
}

const seedance20VipVideoSchema: ModelParameterManifest = {
  aspectRatio: {
    type: 'enum',
    defaultValue: '16:9',
    options: ['Auto', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
  },
  duration: {
    type: 'enum',
    defaultValue: '5',
    options: ['5', '10', '15'],
  },
  quality: {
    type: 'enum',
    defaultValue: '1080P',
    options: ['720P', '1080P'],
  },
  sound: { type: 'boolean', defaultValue: true },
  resolution: {
    type: 'enum',
    defaultValue: '1920×1080',
    options: ['1280×720', '1920×1080'],
  },
  count: { type: 'enum', defaultValue: '1', options: ['1'] },
  onlineSearch: { type: 'boolean', defaultValue: true },
  materialValidation: { type: 'boolean', defaultValue: true },
  autoLink: { type: 'boolean', defaultValue: true },
}

const seedance20MiniVideoSchema: ModelParameterManifest = {
  ...seedance20VipVideoSchema,
  quality: {
    type: 'enum',
    defaultValue: '720P',
    options: ['720P', '1080P'],
  },
  resolution: {
    type: 'enum',
    defaultValue: '1280×720',
    options: ['1280×720', '1920×1080'],
  },
}

export interface LiblibModelCatalogEntry {
  providerId: string
  modelName: string
  description: string
  latency: string
  capabilities: readonly ModelCapability[]
}

export const liblibImageModelCatalog: readonly LiblibModelCatalogEntry[] = [
  { providerId: 'mock-mj-image', modelName: 'Lib Image', description: '最新图片模型、长文本能力突出', latency: '60s', capabilities: ['text-to-image', 'image-to-image'] },
  { providerId: 'mock-general-image-pro', modelName: 'General image Pro', description: '最强图片编辑模型，一致性好', latency: '50s', capabilities: ['text-to-image', 'image-to-image', 'image-edit'] },
  { providerId: 'mock-general-image-v2', modelName: 'General image V2', description: '支持联网搜索、文字准确、速度更快', latency: '25s', capabilities: ['text-to-image', 'image-to-image', 'image-edit'] },
  { providerId: 'mock-seedream-5-pro', modelName: 'Seedream 5.0 Pro', description: '精准交互式编辑，支持原生多语言排版', latency: '20s', capabilities: ['text-to-image', 'image-to-image', 'image-edit'] },
  { providerId: 'mock-seedream-46', modelName: 'Seedream 4.6', description: '人像一致性与平面设计', latency: '20s', capabilities: ['text-to-image', 'image-to-image', 'image-edit'] },
  { providerId: 'mock-seedream-5-lite', modelName: 'Seedream 5.0 Lite', description: '联网搜索与中式风格', latency: '20s', capabilities: ['text-to-image', 'image-to-image', 'image-edit'] },
  { providerId: 'mock-seedream-45', modelName: 'Seedream 4.5', description: '多角色一致性与中式风格', latency: '15s', capabilities: ['text-to-image', 'image-to-image', 'image-edit'] },
  { providerId: 'mock-seedream-40', modelName: 'Seedream 4.0', description: '中文文字与海报设计', latency: '15s', capabilities: ['text-to-image', 'image-to-image', 'image-edit'] },
  { providerId: 'mock-style-image-v82', modelName: 'Style Image V8.2', description: '电影感、光影、人物与真实材质', latency: '50s', capabilities: ['text-to-image', 'image-to-image', 'image-edit'] },
  { providerId: 'mock-style-image-v81', modelName: 'Style Image V8.1', description: '连贯性、细节与美学提升', latency: '50s', capabilities: ['text-to-image', 'image-to-image', 'image-edit'] },
  { providerId: 'mock-style-image-v7', modelName: 'Style Image V7', description: '电影质感与创意能力', latency: '50s', capabilities: ['text-to-image', 'image-to-image', 'image-edit'] },
  { providerId: 'mock-style-image-niji7', modelName: 'Style Image Niji 7', description: '动漫高审美与多样风格', latency: '50s', capabilities: ['text-to-image', 'image-to-image', 'image-edit'] },
  { providerId: 'mock-qwen-image-3', modelName: 'Qwen image 3.0', description: '复杂版面与精准文字的高质量生图', latency: '60s', capabilities: ['text-to-image'] },
  { providerId: 'mock-qwen-image', modelName: 'Qwen Image', description: '文字排版能力', latency: '60s', capabilities: ['text-to-image'] },
  { providerId: 'mock-z-image-turbo', modelName: 'Z-image Turbo', description: '极速真实感图片', latency: '10s', capabilities: ['text-to-image'] },
  { providerId: 'mock-qwen-edit', modelName: 'Qwen Edit', description: '精细可控编辑', latency: '60s', capabilities: ['image-to-image', 'image-edit'] },
  { providerId: 'mock-general-image', modelName: 'General image', description: '图像编辑与语义理解', latency: '50s', capabilities: ['text-to-image', 'image-to-image', 'image-edit'] },
] as const

export const liblibVideoModelCatalog: readonly LiblibModelCatalogEntry[] = [
  { providerId: 'mock-seedance-25', modelName: 'Seedance 2.5', description: '全能参考、最长30s音画同步', latency: '2min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-seedance-20-vip', modelName: 'Seedance 2.0 VIP', description: '全能参考、最长15s音画同步、会员通道', latency: '2min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-seedance-20-mini', modelName: 'Seedance 2.0 Mini', description: '高性价比、最长15s音画同步', latency: '2min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-kling-o3', modelName: 'Kling O3', description: '视频编辑、参考一致性、音画同出与多镜头', latency: '3min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-kling-30', modelName: 'Kling 3.0', description: '高质感、多镜头视频生成', latency: '3min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-minimax-h3', modelName: 'Minimax H3', description: '全模态输入、多参数控制、商用级', latency: '2min', capabilities: ['text-to-video', 'image-to-video'] },
] as const

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

type ProviderManifestCore = Omit<
  ModelProvider,
  'kind' | 'badge' | 'parameterManifest' | 'parameterSchema' | 'generate' | 'export'
> & {
  parameters: ModelParameterManifest
}

export interface DemoProviderFixture {
  imageUrl?: string
  videoUrl?: string
  audioUrl?: string
}

export type DemoModelProviderManifest = ProviderManifestCore & {
  fixture?: DemoProviderFixture
}

export function createDemoProviderFromManifest(
  config: DemoModelProviderManifest,
): ModelProvider {
  const { parameters, fixture, ...manifest } = config
  const parameterSchema = resolveModelParameterManifest(parameters)
  return {
    ...manifest,
    kind: 'demo',
    badge: '演示',
    parameterManifest: parameters,
    parameterSchema,
    generate(request, context) {
      return scheduledProgress(context, 300, [25, 55, 85, 100], () => {
        const video = request.targetKind === 'video'
        const audio = request.targetKind === 'audio'
        const text = request.targetKind === 'text'
        const requestedDuration = Number(
          request.parameters?.duration ??
            parameterSchema.duration?.defaultValue ??
            3,
        )
        const durationSeconds = Number.isFinite(requestedDuration)
          ? requestedDuration
          : 3
        const requestedCount = Number(request.parameters?.count ?? 1)
        const count =
          manifest.sizePolicy?.multiImageStrategy === 'batch' &&
          Number.isFinite(requestedCount) &&
          requestedCount > 1
            ? requestedCount
            : 1
        const resolvedSize = !video && !audio && !text && manifest.sizePolicy
          ? new ImageSizeResolver(manifest.sizePolicy).resolve(request.parameters)
          : undefined
        const textContent = text
          ? request.parameters?.outputKind === 'script'
            ? JSON.stringify({
                chapters: Array.from(
                  {
                    length: Math.min(
                      20,
                      Math.max(1, Number(request.parameters?.sceneCount ?? 3)),
                    ),
                  },
                  (_, index) => ({
                    title: `场次 ${String(index + 1).padStart(2, '0')}`,
                    summary: `${request.prompt} · 第 ${index + 1} 场本地演示拆解`,
                  }),
                ),
              })
            : `基础文案：${request.prompt}。本地演示结果已回填。`
          : undefined
        const assets = Array.from({ length: count }, () => {
          const assetId = crypto.randomUUID()
          return text
            ? {
                id: assetId,
                kind: 'text' as const,
                url: `data:text/plain;charset=utf-8,${encodeURIComponent(textContent ?? '')}`,
                mimeType: 'text/plain',
              }
            : audio
            ? {
                id: assetId,
                kind: 'audio' as const,
                url: fixture?.audioUrl ?? withAppBase('/demo/audio-preview.mp3'),
                mimeType: 'audio/mpeg',
                durationSeconds: 5,
              }
            : video
              ? {
                  id: assetId,
                  kind: 'video' as const,
                  url: fixture?.videoUrl ?? withAppBase('/demo/video-preview.mp4'),
                  mimeType: 'video/mp4',
                  width: 1280,
                  height: 720,
                  durationSeconds,
                }
              : {
                  id: assetId,
                  kind: 'image' as const,
                  url:
                    request.referenceAssets[0]?.url ??
                    fixture?.imageUrl ??
                    withAppBase('/demo/shot-river.png'),
                  mimeType: 'image/png',
                  width: resolvedSize?.width ?? 1920,
                  height: resolvedSize?.height ?? 1080,
                }
        })
        const asset = assets[0]!
        return {
          asset,
          ...(assets.length > 1 ? { assets } : {}),
          version: {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            prompt: request.prompt,
            assetId: asset.id,
            ...(textContent ? { textContent } : {}),
          },
          ...(text ? { persistence: 'project' as const } : {}),
        }
      })
    },
    export(request, context) {
      return scheduledProgress(context, 300, [17, 33, 50, 67, 83, 100], () => ({
        exportJobId: `demo-export-${request.projectId}`,
        downloadUrl: withAppBase(`/demo/exports/${request.projectId}.mp4`),
        completedAt: new Date().toISOString(),
      }))
    },
  }
}

const demoProvider = createDemoProviderFromManifest

function imageCatalogProvider(entry: LiblibModelCatalogEntry) {
  const styleModel = entry.providerId.startsWith('mock-style-image-')
  const config = {
    id: entry.providerId,
    name: 'Mock Studio',
    modelName: entry.modelName,
    capabilities: entry.capabilities,
    parameters:
      entry.providerId === 'mock-style-image-v82'
        ? styleImageV82Schema
        : styleModel
          ? styleImageSchema
          : entry.capabilities.includes('image-edit')
            ? imageEditSchema
            : imageSchema,
    pricing: {
      amount: entry.providerId === 'mock-style-image-v82' ? 15 : 18,
      currency: 'credits' as const,
      unit: 'generation' as const,
    },
    officialApiEndpoint: `mock://local/liblib-image/${entry.providerId}`,
  }
  return entry.providerId === 'mock-qwen-edit'
    ? placeholderProvider({
        ...config,
        disabledReason: 'Qwen Edit 图片编辑适配器待接入',
      })
    : demoProvider(config)
}

function videoCatalogProvider(entry: LiblibModelCatalogEntry) {
  const seedance25 = entry.providerId === 'mock-seedance-25'
  const seedance20Vip = entry.providerId === 'mock-seedance-20-vip'
  const seedance20Mini = entry.providerId === 'mock-seedance-20-mini'
  const klingO3 = entry.providerId === 'mock-kling-o3'
  const kling30 = entry.providerId === 'mock-kling-30'
  const minimaxH3 = entry.providerId === 'mock-minimax-h3'
  const supportedVideoModes: readonly VideoGenerationMode[] = [
    '文生视频',
    '全能参考',
    '图生视频',
    '首尾帧',
    '图片参考',
  ]
  const modelNotice =
    seedance25
      ? '全能参考、最长 30 秒音画同步，预计 2 分钟。'
      : seedance20Vip
        ? '全能参考、最长 15 秒音画同步、会员通道，预计 2 分钟。'
        : seedance20Mini
          ? '高性价比、最长 15 秒音画同步，预计 2 分钟。'
          : klingO3
            ? '支持视频编辑、参考一致性、音画同出与多镜头，预计 3 分钟。'
            : kling30
              ? '高质感、多镜头生成，预计 3 分钟。'
              : minimaxH3
                ? '全模态输入、多参数控制、商用级，预计 2 分钟。'
                : undefined
  const parameters = seedance25
    ? seedance25VideoSchema
    : seedance20Vip
      ? seedance20VipVideoSchema
      : seedance20Mini
        ? seedance20MiniVideoSchema
        : klingO3
          ? klingO3VideoSchema
          : kling30
            ? kling30VideoSchema
            : minimaxH3VideoSchema
  const config = {
    id: entry.providerId,
    name: 'Mock Studio',
    modelName: entry.modelName,
    capabilities: entry.capabilities,
    parameters,
    pricing: {
      amount: 24,
      currency: 'credits' as const,
      unit: 'generation' as const,
    },
    modelNotice,
    supportedVideoModes,
    officialApiEndpoint: `mock://local/liblib-video/${entry.providerId}`,
  }
  return demoProvider(config)
}

function placeholderProvider(config: ProviderManifestCore): ModelProvider {
  const unavailable = async (context: ProviderExecutionContext) => {
    context.signal.throwIfAborted()
    throw new Error(`${config.name} API 尚未配置；当前仅提供接口占位。`)
  }
  const { parameters, ...manifest } = config
  return {
    ...manifest,
    kind: 'placeholder',
    parameterManifest: parameters,
    parameterSchema: resolveModelParameterManifest(parameters),
    generate: (_request, context) => unavailable(context),
    export: (_request, context) => unavailable(context),
  }
}

export interface DefaultProviderRegistryOptions {
  seedanceVideo?: SeedanceVideoProviderOptions
  seedream?: SeedreamLiveProviderOptions
  arkText?: ArkTextLlmProviderOptions
  arkTts?: ArkTtsProviderOptions
  arkAudio?: ArkAudioGenProviderOptions
}

export function createDefaultProviderRegistry(
  options: DefaultProviderRegistryOptions = {},
) {
  return new ProviderRegistry([
    createSeedreamLiveProvider(options.seedream),
    ...liblibImageModelCatalog.map(imageCatalogProvider),
    demoProvider({
      id: 'mock-tongyi-image',
      name: '通义万相',
      modelName: '通义万相图片',
      selectorVisible: false,
      capabilities: ['text-to-image', 'image-to-image'],
      parameters: tongyiImageSchema,
      pricing: { amount: 6, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'mock://local/tongyi-image',
    }),
    demoProvider({
      id: 'mock-text-llm',
      name: 'Mock Studio',
      modelName: '文本 LLM',
      capabilities: ['text'],
      parameters: {},
      pricing: { amount: 8, currency: 'credits', unit: 'generation' },
      variants: [
        {
          id: 'deep-script',
          name: 'GVLM 3.1',
          pricing: { amount: 12, currency: 'credits', unit: 'generation' },
          defaultParameters: {
            fontStyle: '引用',
            sceneCount: 5,
            latency: '20s',
            steps: '20多步',
          },
        },
        {
          id: 'idea-expansion',
          name: 'CVLM 5.5',
          pricing: { amount: 15, currency: 'credits', unit: 'generation' },
          defaultParameters: {
            fontStyle: '标题',
            sceneCount: 4,
            latency: '10s',
            steps: '10秒',
          },
        },
        {
          id: 'basic-copy',
          name: 'GVLM 3.1 Flash',
          pricing: { amount: 8, currency: 'credits', unit: 'generation' },
          defaultParameters: {
            fontStyle: '正文',
            sceneCount: 3,
            latency: '15s',
            steps: '15秒',
          },
        },
        {
          id: 'qwen-3-vl-flash',
          name: 'Qwen 3 VL Flash',
          pricing: { amount: 1, currency: 'credits', unit: 'generation' },
          defaultParameters: {
            fontStyle: '正文',
            sceneCount: 3,
            latency: '10s',
            steps: '10秒',
          },
        },
      ],
      officialApiEndpoint: 'mock://local/text-llm',
    }),
    createArkTextLlmProvider(options.arkText),
    ...liblibVideoModelCatalog.map(videoCatalogProvider),
    createSeedanceVideoProvider(options.seedanceVideo),
    demoProvider({
      id: 'mock-audio',
      name: 'Mock Studio',
      modelName: '音频生成',
      capabilities: ['audio'],
      parameters: {
        duration: { type: 'enum', defaultValue: '5', options: ['5', '10', '30'] },
        quality: { type: 'enum', defaultValue: '标准', options: ['标准', '高清'] },
      },
      pricing: { amount: 6, currency: 'credits', unit: 'generation' },
      variants: [
        {
          id: 'ambience',
          name: 'Mureka V8 · 氛围音',
          pricing: { amount: 4, currency: 'credits', unit: 'generation' },
          defaultParameters: {
            durationSeconds: 12,
            voice: '温暖女声',
            speed: 1,
            volume: 75,
          },
        },
        {
          id: 'narration',
          name: 'ElevenLabs V3 · 人声旁白',
          pricing: { amount: 8, currency: 'credits', unit: 'generation' },
          defaultParameters: {
            durationSeconds: 30,
            voice: '纪录片旁白',
            speed: 0.9,
            volume: 85,
          },
        },
        {
          id: 'sound-effect',
          name: 'ElevenLabs V2 · 音效',
          pricing: { amount: 3, currency: 'credits', unit: 'generation' },
          defaultParameters: {
            durationSeconds: 5,
            voice: '清亮少年',
            speed: 1,
            volume: 100,
          },
        },
      ],
      officialApiEndpoint: 'mock://local/audio',
    }),
    createArkTtsProvider(options.arkTts),
    createArkAudioGenProvider(options.arkAudio),
    placeholderProvider({
      id: 'panorama-720-api',
      name: '720全景',
      modelName: '720全景生成',
      selectorVisible: false,
      disabledReason: '待接入720全景生成',
      capabilities: ['panorama-720'],
      parameters: {},
      pricing: { amount: 0, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'pending://panorama-720',
    }),
    placeholderProvider({
      id: 'tongyi-api',
      name: '通义万相',
      modelName: 'Tongyi 官方 API',
      selectorVisible: false,
      capabilities: ['text-to-image', 'image-to-image', 'text-to-video', 'image-to-video'],
      parameters: { ...imageSchema, ...videoSchema },
      pricing: { amount: 18, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc',
    }),
  ])
}

export const defaultProviderRegistry = createDefaultProviderRegistry()
