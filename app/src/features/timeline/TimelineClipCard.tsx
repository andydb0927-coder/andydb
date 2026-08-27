import { ChevronLeft, ChevronRight } from 'lucide-react'
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
  onSelect,
  onMove,
}: {
  projectId: string
  track: TimelineTrack
  clip: TimelineClip
  selected: boolean
  onSelect(): void
  onMove(direction: -1 | 1): void
}) {
  const ordinal = clipOrdinal(track, clip)
  const label = kindCopy[track.kind]
  return (
    <li className="professional-timeline__clip" data-kind={clip.kind}>
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
      </button>
      {selected && clip.source.nodeId ? (
        <a href={`/project/${projectId}?focus=${clip.source.nodeId}`}>
          返回来源节点
        </a>
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
