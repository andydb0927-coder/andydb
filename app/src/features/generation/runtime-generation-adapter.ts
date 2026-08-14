import type {
  GenerationAdapter,
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'
import type { GenerationProviderPreferenceStore } from './generation-provider-preference'

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
    const adapter = preference.provider === 'libtv' ? this.libtv : this.demo
    if (preference.provider === 'libtv') {
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
    return this.preferenceStore.read().provider === 'libtv'
      ? this.libtv.start(request, signal, onProgress)
      : this.demo.start(request, signal, onProgress)
  }
}
