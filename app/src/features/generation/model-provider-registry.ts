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
import { createArkImageEditProvider } from './ark-image-edit-provider'
import { createArkVideoContinueProvider } from './ark-video-continue-provider'
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
  | 'video-continue'
  | 'audio'
  | 'panorama-720'
  | 'multi-camera-grid'
  | 'plot-four-grid'
  | 'storyboard-continuity'
  | 'cinematic-lighting'
  | 'audio-source-separation'
  | 'audio-sentence-segmentation'
  | 'prompt-optimization'
  | 'motion-capture'
  | 'smart-edit'
  | 'frame-analysis'
  | 'setting-image'

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
  /** UI placement for pending tools; does not grant generation capabilities. */
  menuCapabilities?: readonly ModelCapability[]
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
  'video-continue': '视频续写',
  audio: '音频',
  'panorama-720': '720全景生成',
  'multi-camera-grid': '多机位九宫格生成',
  'plot-four-grid': '剧情推演四宫格',
  'storyboard-continuity': '25宫格连贯分镜',
  'cinematic-lighting': '电影级光影矫正',
  'audio-source-separation': '人声/背景音分离',
  'audio-sentence-segmentation': '音频智能断句切分',
  'prompt-optimization': 'Seedance提示词优化',
  'motion-capture': '深度动作捕捉',
  'smart-edit': '智能剪辑粗剪/混剪',
  'frame-analysis': '逐帧拉片分析',
  'setting-image': '设定图生成',
}

function generationCapability(request: GenerationRequest): ModelCapability {
  if (request.targetKind === 'video' && request.parameters?.videoPostOperation === 'continue') return 'video-continue'
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
      (provider) => provider.selectorVisible !== false && providerMenuGroup(provider) === definition.id,
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

  menuProvidersFor(capabilities: readonly ModelCapability[]) {
    return this.list().filter((provider) => provider.selectorVisible !== false &&
      capabilities.some((capability) => provider.capabilities.includes(capability) ||
        provider.menuCapabilities?.includes(capability)))
  }

  /** Prefer configured live models; unavailable models remain visible with a reason. */
  defaultFor(capabilities: readonly ModelCapability[], preferredId?: string) {
    const providers = this.matching(capabilities)
    return providers.find(({ id }) => id === preferredId) ??
      providers.find((provider) => provider.kind === 'live' && isProviderEnabled(provider)) ??
      providers.find(({ kind }) => kind === 'live') ?? providers[0]
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
      : this.defaultFor([capability])
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

function placeholderProvider(config: ProviderManifestCore): ModelProvider {
  const unavailable = async (context: ProviderExecutionContext) => {
    context.signal.throwIfAborted()
    throw new Error(
      config.disabledReason ?? `${config.name} API 尚未配置；当前仅提供接口占位。`,
    )
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

// Image tools belong to the preset panel, not the image model selector.
// Keep their provider IDs registered for preset notices and future integration.
export const managedAiPlaceholderCatalog = [
  { id: 'panorama-720-api', name: '720全景', modelName: '720全景生成', capability: 'panorama-720', menuCapabilities: [], cost: 36, disabledReason: '待接入720全景生成服务' },
  { id: 'multi-camera-grid-api', name: '多机位九宫格', modelName: '多机位九宫格生成', capability: 'multi-camera-grid', menuCapabilities: [], cost: 48, disabledReason: '待接入多机位九宫格生成服务' },
  { id: 'plot-four-grid-api', name: '剧情推演四宫格', modelName: '剧情推演四宫格', capability: 'plot-four-grid', menuCapabilities: [], cost: 28, disabledReason: '待接入剧情推演四宫格服务' },
  { id: 'storyboard-25-grid-api', name: '25宫格连贯分镜', modelName: '25宫格连贯分镜', capability: 'storyboard-continuity', menuCapabilities: [], cost: 90, disabledReason: '待接入25宫格连贯分镜服务' },
  { id: 'cinematic-lighting-api', name: '电影级光影矫正', modelName: '电影级光影矫正', capability: 'cinematic-lighting', menuCapabilities: [], cost: 12, disabledReason: '待接入电影级光影矫正服务' },
  { id: 'vocal-background-separation-api', name: '人声/背景音分离', modelName: '人声/背景音分离', capability: 'audio-source-separation', menuCapabilities: ["audio"], cost: 8, disabledReason: '待接入人声/背景音分离服务' },
  { id: 'audio-sentence-segmentation-api', name: '音频智能断句切分', modelName: '音频智能断句切分', capability: 'audio-sentence-segmentation', menuCapabilities: ["audio"], cost: 4, disabledReason: '待接入音频智能断句切分服务' },
  { id: 'seedance-prompt-optimization-api', name: 'Seedance提示词优化', modelName: 'Seedance提示词优化', capability: 'prompt-optimization', menuCapabilities: ["text-to-video","image-to-video"], cost: 2, disabledReason: '待接入Seedance提示词优化服务' },
  { id: 'deep-motion-capture-api', name: '深度动作捕捉', modelName: '深度动作捕捉', capability: 'motion-capture', menuCapabilities: ["text-to-video","image-to-video"], cost: 30, disabledReason: '待接入深度动作捕捉服务' },
  { id: 'smart-edit-api', name: '智能剪辑', modelName: '智能剪辑粗剪/混剪', capability: 'smart-edit', menuCapabilities: ["text-to-video","image-to-video"], cost: 20, disabledReason: '待接入智能剪辑粗剪/混剪服务' },
  { id: 'frame-analysis-api', name: '逐帧拉片', modelName: '逐帧拉片分析', capability: 'frame-analysis', menuCapabilities: ["text-to-video","image-to-video"], cost: 15, disabledReason: '待接入逐帧拉片分析服务' },
  { id: 'setting-image-api', name: '设定图', modelName: '设定图生成', capability: 'setting-image', menuCapabilities: [], cost: 24, disabledReason: '待接入设定图生成服务' },
] as const satisfies readonly {
  id: string
  name: string
  modelName: string
  capability: ModelCapability
  menuCapabilities: readonly ModelCapability[]
  cost: number
  disabledReason: string
}[]

export type ManagedAiPlaceholderId =
  (typeof managedAiPlaceholderCatalog)[number]['id']

function managedAiPlaceholderProviders() {
  return managedAiPlaceholderCatalog.map((definition) =>
    placeholderProvider({
      id: definition.id,
      name: definition.name,
      modelName: definition.modelName,
      menuCapabilities: definition.menuCapabilities,
      disabledReason: definition.disabledReason,
      capabilities: [definition.capability],
      parameters: {},
      pricing: {
        amount: definition.cost,
        currency: 'credits',
        unit: 'generation',
      },
      officialApiEndpoint: `pending://${definition.id}`,
    }),
  )
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
    createArkImageEditProvider(options.seedream ? { ...options.seedream, modelId: undefined } : undefined),
    createSeedanceVideoProvider(options.seedanceVideo),
    createArkVideoContinueProvider(options.seedanceVideo),
    createArkTextLlmProvider(options.arkText),
    createArkTtsProvider(options.arkTts),
    createArkAudioGenProvider(options.arkAudio),
    ...managedAiPlaceholderProviders(),
    createInternalDemoProvider(),
  ])
}

/** Explicitly addressed development/test executor; never a selectable fallback. */
export function createInternalDemoProvider(): ModelProvider {
  return createDemoProviderFromManifest({
    id: 'internal-demo',
    name: 'Internal fixture',
    modelName: '内部测试执行器',
    selectorVisible: false,
    ...(!import.meta.env.DEV ? { disabledReason: '内部测试执行器仅在开发环境可用' } : {}),
    capabilities: ['text', 'text-to-image', 'image-to-image', 'text-to-video', 'image-to-video', 'audio'],
    parameters: { aspectRatio: true, count: true, duration: { type: 'enum', defaultValue: '5', options: ['5', '10'] } },
    pricing: { amount: 0, currency: 'credits', unit: 'generation' },
    officialApiEndpoint: 'fixture://internal',
  })
}

export const defaultProviderRegistry = createDefaultProviderRegistry()
