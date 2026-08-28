import { clipDuration } from './timeline-math'
import type { ResolvedTimelineClip, ResolvedTimelineProject, TimelineClip, TimelineSubtitleStyle, TimelineVolumeKeyframe } from './timeline-types'

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

export function normalizeSubtitleStyle(style?: Partial<TimelineSubtitleStyle>): TimelineSubtitleStyle {
  const color = (value: string | undefined, fallback: string) => value && /^#[\da-f]{6}$/i.test(value) ? value : fallback
  return {
    fontSize: Number.isFinite(style?.fontSize) ? clamp(style!.fontSize!, 16, 160) : 64,
    color: color(style?.color, '#ffffff'),
    background: style?.background === 'transparent' ? 'transparent' : color(style?.background, 'transparent'),
    position: style?.position === 'top' || style?.position === 'center' ? style.position : 'bottom',
    bold: style?.bold ?? false,
  }
}

export function gainAt(points: TimelineVolumeKeyframe[] | undefined, localSeconds: number): number {
  if (!points?.length) return 1
  const sorted = points.filter(p => Number.isFinite(p.timeSeconds) && Number.isFinite(p.value)).toSorted((a, b) => a.timeSeconds - b.timeSeconds)
  if (!sorted.length) return 1
  if (localSeconds <= sorted[0].timeSeconds) return clamp(sorted[0].value)
  for (let i = 1; i < sorted.length; i++) {
    const left = sorted[i - 1], right = sorted[i]
    if (localSeconds <= right.timeSeconds) {
      const fraction = (localSeconds - left.timeSeconds) / Math.max(0.000001, right.timeSeconds - left.timeSeconds)
      return clamp(left.value + (right.value - left.value) * fraction)
    }
  }
  return clamp(sorted.at(-1)!.value)
}

export function sliceVolumeEnvelope(points: TimelineVolumeKeyframe[] | undefined, start: number, end: number) {
  if (!points?.length) return points
  return [{ timeSeconds: 0, value: gainAt(points, start) }, ...points.filter(p => p.timeSeconds > start && p.timeSeconds < end).map(p => ({ ...p, timeSeconds: p.timeSeconds - start })), { timeSeconds: end - start, value: gainAt(points, end) }]
}

export interface FrameLayer { item: ResolvedTimelineClip; mediaTime: number; opacity: number }
export interface TimelineFramePlan { layers: FrameLayer[]; subtitles: TimelineClip[] }

function adjacent(previous: ResolvedTimelineClip | undefined, current: ResolvedTimelineClip | undefined) {
  return previous && current && Math.abs(previous.endSeconds - current.startSeconds) < 1 / 48
}

function transitionDuration(previous: ResolvedTimelineClip | undefined, current: ResolvedTimelineClip) {
  if (!adjacent(previous, current) || !current.clip.transitionIn) return 0
  return Math.max(0, Math.min(current.clip.transitionIn.durationSeconds, clipDuration(previous!.clip), clipDuration(current.clip)))
}

/** Pure frame planning is shared by the on-screen preview and burned-in export. */
export function framePlan(resolved: ResolvedTimelineProject, seconds: number, frameRate = 24): TimelineFramePlan {
  const layers: FrameLayer[] = []
  const tracks = new Map<string, ResolvedTimelineClip[]>()
  for (const item of resolved.visual) tracks.set(item.clip.trackId, [...(tracks.get(item.clip.trackId) ?? []), item])
  for (const items of tracks.values()) {
    items.sort((a, b) => a.startSeconds - b.startSeconds || a.clip.order - b.clip.order)
    items.forEach((item, index) => {
      if (seconds < item.startSeconds || seconds >= item.endSeconds) return
      const previous = items[index - 1], next = items[index + 1]
      const local = seconds - item.startSeconds
      const incomingDuration = transitionDuration(previous, item)
      const outgoingDuration = next ? transitionDuration(item, next) : 0
      let opacity = 1
      if (incomingDuration > 0 && local < incomingDuration) {
        const kind = item.clip.transitionIn!.kind
        if (kind === 'dissolve') {
          layers.push({ item: previous!, opacity: 1, mediaTime: Math.max(previous!.clip.sourceInSeconds, previous!.clip.sourceOutSeconds - 1 / frameRate) })
          opacity = clamp(local / incomingDuration)
        } else {
          const hold = kind === 'black' ? incomingDuration * 0.125 : 0
          opacity = clamp((local - hold) / (incomingDuration / 2 - hold))
        }
      }
      if (outgoingDuration > 0 && next!.clip.transitionIn!.kind !== 'dissolve') {
        const remaining = item.endSeconds - seconds
        const hold = next!.clip.transitionIn!.kind === 'black' ? outgoingDuration * 0.125 : 0
        opacity = Math.min(opacity, clamp((remaining - hold) / (outgoingDuration / 2 - hold)))
      }
      layers.push({ item, opacity, mediaTime: item.clip.sourceInSeconds + local * (item.clip.playbackRate ?? 1) })
    })
  }
  // Full frame layers first; PiP/thirds keep their existing overlay priority.
  layers.sort((a, b) => Number(a.item.clip.layout?.mode !== undefined && a.item.clip.layout.mode !== 'full') - Number(b.item.clip.layout?.mode !== undefined && b.item.clip.layout.mode !== 'full'))
  return { layers, subtitles: resolved.subtitles.filter(item => seconds >= item.startSeconds && seconds < item.endSeconds).map(item => item.clip) }
}

function subtitleLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  return text.split('\n').flatMap(paragraph => {
    const lines: string[] = []
    let line = ''
    for (const character of paragraph) {
      if (line && context.measureText(line + character).width > maxWidth) { lines.push(line); line = '' }
      line += character
    }
    lines.push(line)
    return lines
  })
}

export function drawTimelineSubtitles(context: CanvasRenderingContext2D, subtitles: TimelineClip[], width: number, height: number) {
  for (const clip of subtitles) {
    const style = normalizeSubtitleStyle(clip.subtitleStyle)
    const fontSize = style.fontSize * height / 1080
    context.save()
    context.font = `${style.bold ? '700' : '400'} ${fontSize}px sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const lines = subtitleLines(context, clip.text ?? '', width * 0.9)
    const lineHeight = fontSize * 1.3
    const top = style.position === 'top' ? height * 0.09 : style.position === 'center' ? (height - lineHeight * (lines.length - 1)) / 2 : height * 0.91 - lineHeight * (lines.length - 1)
    lines.forEach((line, i) => {
      const y = top + i * lineHeight
      if (style.background !== 'transparent') {
        const w = context.measureText(line).width + fontSize * 0.5
        context.fillStyle = style.background
        context.fillRect((width - w) / 2, y - lineHeight / 2, w, lineHeight)
      }
      context.lineWidth = Math.max(1, fontSize / 12)
      context.strokeStyle = '#000000'
      context.fillStyle = style.color
      context.strokeText(line, width / 2, y)
      context.fillText(line, width / 2, y)
    })
    context.restore()
  }
}

export function drawTimelineFrame(context: CanvasRenderingContext2D, plan: TimelineFramePlan, media: (id: string) => CanvasImageSource | undefined, width: number, height: number) {
  context.save()
  context.globalAlpha = 1
  context.fillStyle = '#000000'
  context.fillRect(0, 0, width, height)
  for (const layer of plan.layers) {
    const source = media(layer.item.clip.id)
    if (!source) continue
    const frame = layer.item.clip.layout ?? { x: 0, y: 0, width: 1, height: 1 }
    context.globalAlpha = layer.opacity
    context.drawImage(source, frame.x * width, frame.y * height, frame.width * width, frame.height * height)
  }
  context.globalAlpha = 1
  drawTimelineSubtitles(context, plan.subtitles, width, height)
  context.restore()
}
