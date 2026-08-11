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

  start(
    request: GenerationRequest,
    signal: AbortSignal,
  ): Promise<GenerationResult> {
    return this.preferenceStore.read().provider === 'libtv'
      ? this.libtv.start(request, signal)
      : this.demo.start(request, signal)
  }
}
