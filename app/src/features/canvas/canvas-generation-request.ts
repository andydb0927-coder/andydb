import { defaultImageGenerationSettings, type Project } from '../project/model'
import type { GenerationRequest } from '../generation/generation-adapter'
import { defaultVideoGenerationMode, isProviderEnabled, isVideoGenerationMode, providerDefaultParameters, resolveVideoGenerationMode, type ProviderRegistry } from '../generation/model-provider-registry'
import { isImageAnalysisToolId } from '../generation/ark-image-analysis-provider'
import { frameAnalysisId } from '../generation/ark-frame-analysis-provider'

export function buildGenerationRequest(
  project: Project,
  node: Project['nodes'][number],
  operation: GenerationRequest['operation'],
  prompt: string,
  providerRegistry: ProviderRegistry,
): GenerationRequest {
  const activeVersion = node.versions.find(
    (version) => version.id === node.activeVersionId,
  )
  const asset = project.assets.find(
    (candidate) => candidate.id === activeVersion?.assetId,
  )
  const savedConfig = node.generationConfig
  const targetKind =
    operation === 'generate-video'
      ? 'video'
      : savedConfig?.targetKind ??
        (node.details?.type === 'audio'
          ? 'audio'
          : node.kind === 'video'
          ? 'video'
          : node.kind === 'text' || node.kind === 'script'
            ? 'text'
            : 'image')
  const defaultProviderId =
    targetKind === 'video'
      ? 'seedance-api'
      : targetKind === 'text'
        ? 'ark-text-llm'
        : targetKind === 'audio'
          ? 'ark-tts'
        : 'seedream-5-pro-api'
  const configuredProviderId = savedConfig?.providerId ?? node.modelProviderId
  const configuredProvider = configuredProviderId
    ? providerRegistry.list().find(({ id }) => id === configuredProviderId)
    : undefined
  const supportsTarget = (provider: typeof configuredProvider) =>
    Boolean(provider?.capabilities.some((capability) =>
      targetKind === 'video'
        ? capability === 'text-to-video' || capability === 'image-to-video'
        : targetKind === 'text'
          ? capability === 'text'
        : targetKind === 'audio'
          ? capability === 'audio'
          : capability === 'text-to-image' || capability === 'image-to-image',
    ))
  const fallbackProvider = defaultProviderId
    ? providerRegistry.list().find(({ id }) => id === defaultProviderId)
    : undefined
  const registeredProvider = supportsTarget(configuredProvider) && !isImageAnalysisToolId(configuredProviderId ?? '') && configuredProviderId !== frameAnalysisId
    ? configuredProvider
    : supportsTarget(fallbackProvider)
      ? fallbackProvider
      : undefined
  const registeredProviderId = registeredProvider?.id
  const normalizedImageSettings = node.imageGeneration
    ? { ...defaultImageGenerationSettings, ...node.imageGeneration }
    : undefined
  const imageParameters =
    targetKind === 'image' && normalizedImageSettings && registeredProvider
      ? Object.fromEntries(
          (
            [
              ['aspectRatio', normalizedImageSettings.aspectRatio],
              ['quality', normalizedImageSettings.quality],
              ['resolution', normalizedImageSettings.resolution],
              ['count', normalizedImageSettings.count],
              ['editStrength', normalizedImageSettings.editStrength],
              ['autoLink', normalizedImageSettings.autoLink],
              ['customWidth', normalizedImageSettings.customWidth],
              ['customHeight', normalizedImageSettings.customHeight],
            ] as const
          ).flatMap(([name, value]) => {
            const definition = registeredProvider.parameterSchema[name]
            if (!definition) return []
            if (
              definition.type === 'enum' &&
              !definition.options.includes(String(value))
            ) {
              return []
            }
            return [[name, value] as const]
          }),
        )
      : undefined
  const parameters: Record<string, string | number | boolean> = {
    ...(registeredProvider ? providerDefaultParameters(registeredProvider) : {}),
    ...(savedConfig && savedConfig.providerId === registeredProviderId ? savedConfig.parameters : {}),
    ...imageParameters,
  }
  if (targetKind === 'video' && registeredProvider) {
    parameters.generationMode =
      resolveVideoGenerationMode(
        registeredProvider,
        parameters.generationMode ?? defaultVideoGenerationMode,
      ) ?? defaultVideoGenerationMode
  }
  const generationMode = isVideoGenerationMode(parameters.generationMode)
    ? parameters.generationMode
    : undefined
  const incomingReferenceAssets = project.edges
    .filter(({ targetNodeId }) => targetNodeId === node.id)
    .flatMap(({ sourceNodeId }) => {
      const source = project.nodes.find(({ id }) => id === sourceNodeId)
      const sourceVersion = source?.versions.find(
        ({ id }) => id === source.activeVersionId,
      )
      const sourceAsset = project.assets.find(
        ({ id }) => id === sourceVersion?.assetId,
      )
      if (!sourceAsset || sourceAsset.kind === 'text') return []
      return [{
        url: sourceAsset.url,
        kind: sourceAsset.kind,
        mimeType: sourceAsset.mimeType,
      }]
    })

  return {
    projectId: project.id,
    nodeId: node.id,
    operation,
    targetKind,
    ...(registeredProviderId ? { providerId: registeredProviderId } : {}),
    prompt,
    ...(Object.keys(parameters).length ? { parameters } : {}),
    referenceAssets: generationMode === '文生视频'
      ? []
      : savedConfig?.referenceAssets.length
        ? savedConfig.referenceAssets.map((reference) => ({ ...reference }))
        : (node.kind === 'image' ||
              node.kind === 'character' ||
              node.kind === 'scene') &&
            incomingReferenceAssets.length
          ? incomingReferenceAssets
          : asset && asset.kind !== 'text'
            ? [
                {
                  url: asset.url,
                  kind: asset.kind,
                  mimeType: asset.mimeType,
                },
              ]
            : [],
  }
}

export function generationEligibilityFailure(
  request: GenerationRequest,
  providerRegistry: ProviderRegistry,
) {
  if (!request.prompt.trim() && request.referenceAssets.length === 0) {
    return '请输入提示词或添加参考素材后再生成。'
  }
  if (request.providerId) {
    const provider = providerRegistry.list().find(
      ({ id }) => id === request.providerId,
    )
    if (!provider) return '当前节点绑定的生成模型不存在。'
    if (!isProviderEnabled(provider)) {
      return provider.disabledReason ?? '当前生成模型暂不可用。'
    }
  }
  return undefined
}

export function isWorkflowGeneratableNode(node: Project['nodes'][number]) {
  if (node.imageTool || node.videoTool || node.effectTool) return false
  return [
    'image',
    'character',
    'scene',
    'video',
    'storyboard',
    'text',
    'script',
  ].includes(node.kind) || node.details?.type === 'audio'
}

export function forceDemoProvider(request: GenerationRequest): GenerationRequest {
  // Batch execution was explicitly demo-only. Never turn it into paid calls.
  return { ...request, providerId: 'internal-demo' }
}
