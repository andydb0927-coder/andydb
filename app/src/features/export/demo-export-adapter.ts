import type {
  ExportAdapter,
  ExportResult,
  ExportSettings,
} from './export-adapter'

const PROGRESS_INTERVAL_MS = 300
const PROGRESS_STEPS = 6

export class DemoExportAdapter implements ExportAdapter {
  private readonly projectId: string
  private readonly onProgress: (percentage: number) => void

  constructor(
    projectId: string,
    onProgress: (percentage: number) => void = () => undefined,
  ) {
    this.projectId = projectId
    this.onProgress = onProgress
  }

  start(
    _settings: ExportSettings,
    signal: AbortSignal,
  ): Promise<ExportResult> {
    return new Promise((resolve, reject) => {
      let step = 0
      const cancel = () => {
        clearInterval(intervalId)
        reject(new DOMException('Export cancelled', 'AbortError'))
      }
      const intervalId = setInterval(() => {
        step += 1
        this.onProgress(Math.round((step / PROGRESS_STEPS) * 100))
        if (step < PROGRESS_STEPS) return

        clearInterval(intervalId)
        signal.removeEventListener('abort', cancel)
        resolve({
          exportJobId: `demo-export-${this.projectId}`,
          downloadUrl: `/demo/exports/${this.projectId}.mp4`,
          completedAt: new Date().toISOString(),
        })
      }, PROGRESS_INTERVAL_MS)

      if (signal.aborted) cancel()
      else signal.addEventListener('abort', cancel, { once: true })
    })
  }
}
