import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { clipDuration } from './timeline-math'
import type { TimelineClip, TimelineTrack, TimelineTrackKind } from './timeline-types'

export const kindCopy: Record<TimelineTrackKind, string> = {
  video: '视频',
  audio: '音频',
  image: '图片',
  subtitle: '字幕',
}

export function clipOrdinal(track: TimelineTrack, clip: TimelineClip) {
  return String(track.clips.findIndex((candidate) => candidate.id === clip.id) + 1).padStart(2, '0')
}

export function TimelineClipCard({
  projectId,
  track,
  clip,
  selected,
  pixelsPerSecond,
  laneHeight = 80,
  laneIndex = 0,
  onHeightChange,
  onSelect,
  onMove,
}: {
  projectId: string
  track: TimelineTrack
  clip: TimelineClip
  selected: boolean
  pixelsPerSecond?: number
  laneHeight?: number
  laneIndex?: number
  onHeightChange?(id: string, height: number): void
  onSelect(): void
  onMove(direction: -1 | 1): void
}) {
  const cardRef = useRef<HTMLLIElement>(null)
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card || !onHeightChange) return
    const measure = () => { if (card.offsetHeight > 0) onHeightChange(clip.id, card.offsetHeight) }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(card)
    return () => observer.disconnect()
  }, [clip, selected, onHeightChange])
  const ordinal = clipOrdinal(track, clip)
  const label = kindCopy[track.kind]
  return (
    <li ref={cardRef} className="professional-timeline__clip" data-kind={clip.kind} data-start-seconds={clip.startSeconds} style={pixelsPerSecond ? { position: 'absolute', left: clip.startSeconds * pixelsPerSecond, width: Math.max(24, clipDuration(clip) * pixelsPerSecond - 2), top: laneIndex * laneHeight } : undefined}>
      <button
        type="button"
        className="professional-timeline__clip-select"
        aria-label={`选择${label} ${ordinal}`}
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
      >
        <span>
          {clip.kind !== 'subtitle' && !clip.source.url
            ? '缺少片段'
            : clip.name}
        </span>
        <small>{clipDuration(clip).toFixed(2)}s</small>
        {clip.transitionIn && <small>{{ fade: '淡入淡出', dissolve: '交叉溶解', black: '黑场' }[clip.transitionIn.kind]} {clip.transitionIn.durationSeconds}s</small>}
        {clip.kind === 'audio' && clip.volumeKeyframes?.length ? <svg role="img" aria-label="音量包络" viewBox="0 0 100 24" height="24" width="100%" preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={clip.volumeKeyframes.map(p => `${p.timeSeconds / Math.max(0.01, clipDuration(clip)) * 100},${24 - p.value * 23}`).join(' ')} /></svg> : null}
      </button>
      {selected && clip.source.nodeId ? (
        <Link to={`/project/${projectId}?focus=${clip.source.nodeId}`}>
          返回来源节点
        </Link>
      ) : null}
      <div className="professional-timeline__move">
        <button
          type="button"
          aria-label={`将${label} ${ordinal} 前移`}
          disabled={clip.order === 0}
          onClick={() => onMove(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`将${label} ${ordinal} 后移`}
          disabled={clip.order === track.clips.length - 1}
          onClick={() => onMove(1)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}
