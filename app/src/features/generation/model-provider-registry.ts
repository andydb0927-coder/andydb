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
  createKlingLiveProvider,
  type KlingLiveProviderOptions,
} from './kling-live-provider'

export type ModelCapability =
  | 'text'
  | 'text-to-image'
  | 'image-to-image'
  | 'image-edit'
  | 'text-to-video'
  | 'image-to-video'
  | 'audio'

export type ModelParameterName =
  | 'aspectRatio'
  | 'duration'
  | 'generationMode'
  | 'quality'
  | 'sound'
  | 'resolution'
  | 'count'
  | 'onlineSearch'
  | 'materialValidation'
  | 'editStrength'
  | 'multiShot'
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
  | {
      type: 'number'
      defaultValue: number
      min: number
      max: number
      step: number
    }

export type ModelParameterSchema = Partial<
  Record<ModelParameterName, ModelParameterDefinition>
>

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
  kind: 'demo' | 'placeholder' | 'live'
  badge?: '演示'
  selectorVisible?: boolean
  disabledReason?: string
  modelNotice?: string
  supportedVideoModes?: readonly VideoGenerationMode[]
  capabilities: readonly ModelCapability[]
  parameterSchema: ModelParameterSchema
  pricing: ModelProviderPricing
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
  const variant = provider.variants?.find(
    ({ id }) => id === parameters?.modelVariant,
  )
  const pricing = variant?.pricing ?? provider.pricing
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
          ? 'mock-kling-video'
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
      estimatedCost: providerCost(provider, request.parameters),
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
    options: [
      '1:1',
      '1:2',
      '2:1',
      '9:16',
      '16:9',
      '3:4',
      '4:3',
      '3:2',
      '2:3',
      '5:4',
      '4:5',
      '21:9',
      '9:21',
    ],
  },
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
  count: { type: 'enum', defaultValue: '1', options: ['1', '2', '4'] },
  autoLink: { type: 'boolean', defaultValue: true },
}

const styleImageSchema: ModelParameterSchema = {
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

const styleImageV82Schema: ModelParameterSchema = {
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

const imageEditSchema: ModelParameterSchema = {
  ...imageSchema,
  editStrength: { type: 'number', defaultValue: 0.6, min: 0, max: 1, step: 0.05 },
}

const klingImageSchema: ModelParameterSchema = {
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

const seedance25VideoSchema: ModelParameterSchema = {
  ...seedanceVideoSchema,
  duration: {
    type: 'enum',
    defaultValue: '5',
    options: ['5', '10', '15', '20', '30'],
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
  { providerId: 'mock-seedance-video', modelName: 'Seedance 2.0 VIP', description: '全能参考、最长15s音画同步、会员通道', latency: '2min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-minimax-h3', modelName: 'Minimax H3', description: '全模态输入、多参数控制', latency: '2min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-seedance-2-fast-vip', modelName: 'Seedance 2.0 Fast VIP', description: '快速版、最长15s音画同步', latency: '2min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-seedance-2-mini', modelName: 'Seedance 2.0 Mini', description: '高性价比、最长15s音画同步', latency: '2min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-happy-horse-11', modelName: 'Happy Horse 1.1', description: '多参生成、一致性与视听质量可控', latency: '3min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-happy-horse-10', modelName: 'Happy Horse 1.0', description: '多参视频生成', latency: '3min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-kling-video', modelName: 'Kling O3', description: '视频编辑、参考一致性、音画同出、多镜头', latency: '3min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-kling-30-turbo', modelName: 'Kling 3.0 Turbo', description: '高质感与多镜头', latency: '3min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-kling-30', modelName: 'Kling 3.0', description: '高质感与多镜头', latency: '3min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-wan-27', modelName: 'Wan 2.7', description: '全能参考与视频编辑', latency: '3min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-kling-o1', modelName: 'Kling O1', description: '编辑模型与多模态输入', latency: '3min', capabilities: ['image-to-video'] },
  { providerId: 'mock-wan-26', modelName: 'Wan 2.6', description: '音画同步、多机位、最长15s', latency: '3min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-hailuo-23-fast', modelName: 'Hailuo 2.3 Fast', description: '动作、表情与镜头快速版', latency: '1min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-hailuo-23', modelName: 'Hailuo 2.3', description: '动作、表情与镜头高质感版', latency: '2min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-seedance-15-pro', modelName: 'Seedance1.5 Pro', description: '音画同步、多机位、最长12s', latency: '2min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-seedance-10-pro', modelName: 'Seedance 1.0 Pro', description: '高精度提示词与1080P', latency: '2min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-seedance-10-lite', modelName: 'Seedance 1.0 Lite', description: '轻量快速生成', latency: '1min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'kling-api', modelName: 'Kling 2.6', description: '视频生成与音画同步', latency: '2min', capabilities: ['text-to-video'] },
  { providerId: 'mock-style-video', modelName: 'Style Video', description: '稳定图生视频', latency: '2min', capabilities: ['image-to-video'] },
  { providerId: 'mock-hailuo-02', modelName: 'Hailuo 02', description: '稳定画质与运动特效', latency: '2min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-vidu-q2', modelName: 'Vidu Q2', description: '多图主体参考与精确控制', latency: '3min', capabilities: ['image-to-video'] },
  { providerId: 'mock-vidu-q2-pro', modelName: 'Vidu Q2 Pro', description: '主体参考视频生成', latency: '', capabilities: ['image-to-video'] },
  { providerId: 'mock-vidu-q2-turbo', modelName: 'Vidu Q2 Turbo', description: '主体参考快速生成', latency: '', capabilities: ['image-to-video'] },
  { providerId: 'mock-vidu-q3-pro', modelName: 'Vidu Q3 Pro', description: '主体参考与精确控制', latency: '2min', capabilities: ['image-to-video'] },
  { providerId: 'mock-omnihuman-15', modelName: 'OmniHuman 1.5', description: '多模态数字人视频', latency: '3min', capabilities: ['image-to-video'] },
  { providerId: 'mock-kling-25', modelName: 'Kling 2.5', description: '快速、稳定、高性价比', latency: '2min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-kling-21', modelName: 'Kling 2.1', description: '首尾帧与图生视频', latency: '3min', capabilities: ['image-to-video'] },
  { providerId: 'mock-wan-22', modelName: 'Wan 2.2', description: '特效玩法', latency: '3min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-wan-25', modelName: 'Wan 2.5', description: '特效与音画同步', latency: '3min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-pixverse-55', modelName: 'Pixverse V5.5', description: '丰富特效玩法', latency: '3min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-pixverse-5', modelName: 'Pixverse V5', description: '丰富特效玩法', latency: '3min', capabilities: ['text-to-video', 'image-to-video'] },
  { providerId: 'mock-kling-30-motion', modelName: 'Kling3.0 动作迁移', description: '1图+1视频动作控制', latency: '8min', capabilities: ['image-to-video'] },
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
                url: withAppBase('/demo/audio-preview.mp3'),
                mimeType: 'audio/mpeg',
                durationSeconds: 5,
              }
            : video
              ? {
                  id: assetId,
                  kind: 'video' as const,
                  url: withAppBase('/demo/video-preview.mp4'),
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
                    withAppBase('/demo/shot-river.png'),
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
        downloadUrl: withAppBase(`/demo/exports/${request.projectId}.mp4`),
        completedAt: new Date().toISOString(),
      }))
    },
  }
}

function imageCatalogProvider(entry: LiblibModelCatalogEntry) {
  const styleModel = entry.providerId.startsWith('mock-style-image-')
  const config = {
    id: entry.providerId,
    name: 'Mock Studio',
    modelName: entry.modelName,
    capabilities: entry.capabilities,
    parameterSchema:
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
  const klingO3 = entry.providerId === 'mock-kling-video'
  const seedance20 = entry.providerId === 'mock-seedance-video'
  const seedance25 = entry.providerId === 'mock-seedance-25'
  const omniHuman = entry.providerId === 'mock-omnihuman-15'
  const imageOnly =
    entry.capabilities.includes('image-to-video') &&
    !entry.capabilities.includes('text-to-video')
  const supportedVideoModes: readonly VideoGenerationMode[] = omniHuman
    ? ['图生视频', '图片参考']
    : imageOnly
      ? ['图生视频', '首尾帧', '图片参考']
      : ['文生视频', '全能参考', '图生视频', '首尾帧', '图片参考']
  const modelNotice =
    seedance25
      ? '最长 30 秒，支持音画同步与全能参考。'
      : klingO3
        ? '支持多镜头生成与参考一致性。'
        : entry.providerId === 'mock-wan-27'
          ? '全能参考模式支持多素材输入与视频编辑。'
          : omniHuman
            ? '数字人模式：请添加人物图片和驱动音频。'
            : undefined
  const parameterSchema = seedance25
    ? seedance25VideoSchema
    : klingO3
      ? { ...videoSchema, multiShot: { type: 'boolean' as const, defaultValue: true } }
      : seedanceVideoSchema
  const config = {
    id: entry.providerId,
    name: 'Mock Studio',
    modelName: entry.modelName,
    capabilities: entry.capabilities,
    parameterSchema,
    pricing: {
      amount: seedance20 ? 135 : 24,
      currency: 'credits' as const,
      unit: 'generation' as const,
    },
    modelNotice,
    supportedVideoModes,
    officialApiEndpoint: `mock://local/liblib-video/${entry.providerId}`,
  }
  return entry.providerId === 'mock-kling-30-motion'
    ? placeholderProvider({
        ...config,
        disabledReason: '动作迁移需要专用图片与视频输入，适配器待接入',
      })
    : demoProvider(config)
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

export interface DefaultProviderRegistryOptions {
  kling?: KlingLiveProviderOptions
}

export function createDefaultProviderRegistry(
  options: DefaultProviderRegistryOptions = {},
) {
  return new ProviderRegistry([
    ...liblibImageModelCatalog.map(imageCatalogProvider),
    demoProvider({
      id: 'mock-kling-image',
      name: '可灵',
      modelName: '可灵图片',
      selectorVisible: false,
      capabilities: ['text-to-image'],
      parameterSchema: klingImageSchema,
      pricing: { amount: 8, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'mock://local/kling-image',
    }),
    demoProvider({
      id: 'mock-tongyi-image',
      name: '通义万相',
      modelName: '通义万相图片',
      selectorVisible: false,
      capabilities: ['text-to-image', 'image-to-image'],
      parameterSchema: klingImageSchema,
      pricing: { amount: 6, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'mock://local/tongyi-image',
    }),
    demoProvider({
      id: 'mock-text-llm',
      name: 'Mock Studio',
      modelName: '文本 LLM',
      capabilities: ['text'],
      parameterSchema: {},
      pricing: { amount: 8, currency: 'credits', unit: 'generation' },
      variants: [
        {
          id: 'basic-copy',
          name: 'GVLM 3.1 Flash · 基础文案',
          pricing: { amount: 8, currency: 'credits', unit: 'generation' },
          defaultParameters: { fontStyle: '正文', sceneCount: 3 },
        },
        {
          id: 'deep-script',
          name: 'GVLM 3.1 · 深度脚本',
          pricing: { amount: 12, currency: 'credits', unit: 'generation' },
          defaultParameters: { fontStyle: '引用', sceneCount: 5 },
        },
        {
          id: 'idea-expansion',
          name: 'CVLM 5.5 · 灵感扩展',
          pricing: { amount: 15, currency: 'credits', unit: 'generation' },
          defaultParameters: { fontStyle: '标题', sceneCount: 4 },
        },
      ],
      officialApiEndpoint: 'mock://local/text-llm',
    }),
    ...liblibVideoModelCatalog.map((entry) =>
      entry.providerId === 'kling-api'
        ? createKlingLiveProvider(options.kling)
        : videoCatalogProvider(entry),
    ),
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
    placeholderProvider({
      id: 'seedance-api',
      name: 'Seedance',
      modelName: 'Seedance 官方 API',
      selectorVisible: false,
      capabilities: ['text-to-video', 'image-to-video'],
      parameterSchema: seedanceVideoSchema,
      pricing: { amount: 135, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
    }),
    placeholderProvider({
      id: 'tongyi-api',
      name: '通义万相',
      modelName: 'Tongyi 官方 API',
      selectorVisible: false,
      capabilities: ['text-to-image', 'image-to-image', 'text-to-video', 'image-to-video'],
      parameterSchema: { ...imageSchema, ...videoSchema },
      pricing: { amount: 18, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc',
    }),
  ])
}

export const defaultProviderRegistry = createDefaultProviderRegistry()
