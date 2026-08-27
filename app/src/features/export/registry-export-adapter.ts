import {
  defaultProviderRegistry,
  type ProviderRegistry,
} from '../generation/model-provider-registry'
import type {
  ExportAdapter,
  ExportSettings,
} from './export-adapter'

export class RegistryExportAdapter implements ExportAdapter {
  private readonly projectId: string
  private readonly providerId: string
  private readonly registry: ProviderRegistry

  constructor(
    projectId: string,
    providerId = 'internal-demo',
    registry: ProviderRegistry = defaultProviderRegistry,
  ) {
    this.projectId = projectId
    this.providerId = providerId
    this.registry = registry
  }

  start(
    settings: ExportSettings,
    signal: AbortSignal,
    onProgress?: (percentage: number) => void,
  ) {
    return this.registry.export(
      this.providerId,
      { projectId: this.projectId, settings },
      { signal, onProgress },
    )
  }
}
