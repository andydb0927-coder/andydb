import type { GenerationAdapter, GenerationRequest } from './generation-adapter'
import { RegistryGenerationAdapter } from './registry-generation-adapter'

export class DemoGenerationAdapter implements GenerationAdapter {
  readonly #registryAdapter = new RegistryGenerationAdapter()

  describe(request: GenerationRequest) {
    return this.#registryAdapter.describe(request)
  }

  start(
    request: GenerationRequest,
    signal: AbortSignal,
    onProgress?: (percentage: number) => void,
  ) {
    return this.#registryAdapter.start(request, signal, onProgress)
  }
}
