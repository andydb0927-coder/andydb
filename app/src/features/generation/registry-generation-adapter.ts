import type {
  GenerationAdapter,
  GenerationRequest,
} from './generation-adapter'
import {
  defaultProviderRegistry,
  type ProviderRegistry,
} from './model-provider-registry'

export class RegistryGenerationAdapter implements GenerationAdapter {
  private readonly registry: ProviderRegistry

  constructor(
    registry: ProviderRegistry = defaultProviderRegistry,
  ) {
    this.registry = registry
  }

  describe(request: GenerationRequest) {
    return this.registry.describe(request)
  }

  start(
    request: GenerationRequest,
    signal: AbortSignal,
    onProgress?: (percentage: number) => void,
  ) {
    return this.registry.generate(request, { signal, onProgress })
  }
}
