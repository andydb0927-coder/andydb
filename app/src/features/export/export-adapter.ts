export interface ExportSettings {
  width: 1920
  height: 1080
  aspectRatio: '16:9'
  frameRate: 24
  watermark: boolean
}

export interface ExportResult {
  exportJobId: string
  downloadUrl: string
  completedAt: string
}

export interface ExportAdapter {
  start(settings: ExportSettings, signal: AbortSignal): Promise<ExportResult>
}
