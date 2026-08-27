import { clipDuration } from './timeline-math'
import type { TimelineProject } from './timeline-types'

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

export function toTimecode(seconds: number, frameRate: number) {
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

export function reelName(assetId: string | undefined, index: number) {
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

export function buildTimelineDownload(timeline: TimelineProject, kind: 'json' | 'edl') {
  return {
    content: kind === 'json' ? serializeTimelineJson(timeline) : serializeTimelineEdl(timeline),
    filename: `${timeline.title}.${kind}`,
    mimeType: kind === 'json' ? 'application/json' : 'text/plain',
    feedback: kind === 'json' ? 'JSON 已开始下载' : 'EDL 已开始下载',
  }
}
