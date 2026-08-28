import type {
  GenerationAdapter,
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'
import type { GenerationProviderPreferenceStore } from './generation-provider-preference'
import { isImageAnalysisToolId } from './ark-image-analysis-provider'
import { prepareStyledRequest } from '../styles/style-model'

export class RuntimeGenerationAdapter implements GenerationAdapter {
  private readonly preferenceStore: GenerationProviderPreferenceStore
  private readonly demo: GenerationAdapter
  private readonly libtv: GenerationAdapter

  constructor(
    preferenceStore: GenerationProviderPreferenceStore,
    demo: GenerationAdapter,
    libtv: GenerationAdapter,
  ) {
    this.preferenceStore = preferenceStore
    this.demo = demo
    this.libtv = libtv
  }

  describe(request: GenerationRequest) {
    const preference = this.preferenceStore.read()
    const useLibTv =
      preference.provider === 'libtv' &&
      !isPinnedArkTool(request.providerId) &&
      (request.targetKind === 'image' || request.targetKind === 'video')
    const adapter = useLibTv ? this.libtv : this.demo
    if (useLibTv && preference.provider === 'libtv') {
      return {
        providerId: 'libtv-bridge',
        providerName: 'LibTV',
        modelName:
          request.targetKind === 'video'
            ? preference.selection.videoModelName
            : preference.selection.imageModelName,
        estimatedCost: 0,
      }
    }
    return adapter.describe?.(request) ?? {
      providerId: 'demo',
      providerName: 'Demo',
      modelName: '本地演示模型',
      estimatedCost: 0,
    }
  }

  start(
    request: GenerationRequest,
    signal: AbortSignal,
    onProgress?: (percentage: number) => void,
  ): Promise<GenerationResult> {
    // Editing confirmation authorizes Ark, never a different legacy remote provider.
    return this.preferenceStore.read().provider === 'libtv' &&
      !isPinnedArkTool(request.providerId) &&
      (request.targetKind === 'image' || request.targetKind === 'video')
      ? this.libtv.start(prepareStyledRequest(request), signal, onProgress).then(result =>
        request.style ? { ...result, version: { ...result.version, prompt: request.prompt } } : result)
      : this.demo.start(request, signal, onProgress)
  }
}

/** Explicit tool confirmations authorize only the stated Ark service. */
export function isPinnedArkTool(providerId?: string) {
  return providerId === 'ark-image-edit' || providerId === 'ark-video-continue' || providerId === 'frame-analysis-api' || isImageAnalysisToolId(providerId)
}
