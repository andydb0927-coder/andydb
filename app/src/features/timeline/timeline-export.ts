// Compatibility facade: serialization and browser I/O have separate owners.
export { serializeTimelineJson, serializeTimelineEdl } from './timeline-serialization'
export { downloadBlob, safeDownloadFilename, type DownloadAnchor, type DownloadEnvironment } from '../../shared/browser-download'

export interface PreviewCaptureCanvas {
  captureStream?: (frameRate?: number) => MediaStream
}

export interface PreviewMediaRecorder {
  state: string
  start(): void
  stop(): void
  addEventListener(
    type: 'dataavailable' | 'stop',
    listener: (event: Event & { data?: Blob }) => void,
  ): void
}

export interface PreviewRecorderFactory {
  mimeType: string
  create(stream: MediaStream): PreviewMediaRecorder
}

export interface PreviewRecordingSession {
  stop(): void
}

export function supportsPreviewRecording(
  canvas: PreviewCaptureCanvas | undefined,
  factory: PreviewRecorderFactory | undefined,
) {
  return typeof canvas?.captureStream === 'function' && factory !== undefined
}

export function browserPreviewRecorderFactory():
  | PreviewRecorderFactory
  | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  const mimeType = candidates.find(
    (candidate) =>
      typeof MediaRecorder.isTypeSupported !== 'function' ||
      MediaRecorder.isTypeSupported(candidate),
  )
  if (!mimeType) return undefined
  return {
    mimeType,
    create: (stream) => new MediaRecorder(stream, { mimeType }),
  }
}

export function createPreviewRecording(
  canvas: PreviewCaptureCanvas,
  factory: PreviewRecorderFactory,
  onComplete: (blob: Blob) => void,
  frameRate: number,
): PreviewRecordingSession {
  if (!canvas.captureStream) {
    throw new Error('当前浏览器不支持预览流录制')
  }
  const chunks: Blob[] = []
  const recorder = factory.create(canvas.captureStream(frameRate))
  let stopped = false
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data)
  })
  recorder.addEventListener('stop', () => {
    onComplete(new Blob(chunks, { type: factory.mimeType }))
  })
  recorder.start()
  return {
    stop() {
      if (stopped) return
      stopped = true
      if (recorder.state !== 'inactive') recorder.stop()
    },
  }
}
