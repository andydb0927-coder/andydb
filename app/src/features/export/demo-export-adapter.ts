import type {
  ExportAdapter,
  ExportResult,
  ExportSettings,
} from './export-adapter'
import { RegistryExportAdapter } from './registry-export-adapter'

export class DemoExportAdapter implements ExportAdapter {
  private readonly onProgress: (percentage: number) => void
  private readonly registryAdapter: RegistryExportAdapter

  constructor(
    projectId: string,
    onProgress: (percentage: number) => void = () => undefined,
  ) {
    this.onProgress = onProgress
    this.registryAdapter = new RegistryExportAdapter(projectId)
  }

  start(
    settings: ExportSettings,
    signal: AbortSignal,
    onProgress?: (percentage: number) => void,
  ): Promise<ExportResult> {
    return this.registryAdapter.start(settings, signal, (percentage) => {
      this.onProgress(percentage)
      onProgress?.(percentage)
    })
  }
}
