import { clipDuration, type TimelineProject } from './timeline-project'

export interface DownloadAnchor {
  href: string
  download: string
  click(): void
  remove(): void
}

export interface DownloadEnvironment {
  createAnchor(): DownloadAnchor
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
}

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

export function serializeTimelineJson(timeline: TimelineProject): string {
  return JSON.stringify(
    {
      format: 'wireless-canvas-timeline',
      version: 1,
      exportedAt: new Date().toISOString(),
      project: timeline,
    },
    null,
    2,
  )
}

function toTimecode(seconds: number, frameRate: number) {
  const totalFrames = Math.max(0, Math.round(seconds * frameRate))
  const frames = totalFrames % frameRate
  const totalSeconds = Math.floor(totalFrames / frameRate)
  const secs = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const mins = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  return [hours, mins, secs, frames]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

function reelName(assetId: string | undefined, index: number) {
  const value = (assetId ?? `CLIP${index + 1}`)
    .replace(/[^a-z0-9]/gi, '_')
    .toUpperCase()
    .slice(0, 8)
  return value.padEnd(8, '_')
}

export function serializeTimelineEdl(timeline: TimelineProject): string {
  const visual = timeline.tracks
    .filter((track) => track.kind === 'video' || track.kind === 'image')
    .flatMap((track) => track.clips)
    .sort(
      (left, right) =>
        left.startSeconds - right.startSeconds || left.order - right.order,
    )
  const lines = [`TITLE: ${timeline.title}`, 'FCM: NON-DROP FRAME', '']

  visual.forEach((clip, index) => {
    const sourceIn = toTimecode(clip.sourceInSeconds, timeline.frameRate)
    const sourceOut = toTimecode(clip.sourceOutSeconds, timeline.frameRate)
    const recordIn = toTimecode(clip.startSeconds, timeline.frameRate)
    const recordOut = toTimecode(
      clip.startSeconds + clipDuration(clip),
      timeline.frameRate,
    )
    lines.push(
      `${String(index + 1).padStart(3, '0')}  ${reelName(clip.source.assetId, index)}  V     C        ${sourceIn} ${sourceOut} ${recordIn} ${recordOut}`,
      `* FROM CLIP NAME: ${clip.name}`,
      `* SOURCE: ${clip.source.type} ${clip.source.assetId ?? clip.source.nodeId ?? clip.id}`,
      `* TRACK: ${clip.kind}`,
      '',
    )
  })

  return lines.join('\n')
}

export function safeDownloadFilename(filename: string) {
  const sanitized = filename
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/-+\./g, '.')
    .replace(/-{2,}/g, '-')
  return sanitized || 'timeline-export'
}

function browserDownloadEnvironment(): DownloadEnvironment {
  return {
    createAnchor: () => document.createElement('a'),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  }
}

export function downloadBlob(
  blob: Blob,
  filename: string,
  environment: DownloadEnvironment = browserDownloadEnvironment(),
) {
  const anchor = environment.createAnchor()
  const url = environment.createObjectURL(blob)
  anchor.href = url
  anchor.download = safeDownloadFilename(filename)
  anchor.click()
  anchor.remove()
  environment.revokeObjectURL(url)
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

