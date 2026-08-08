import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react'

import type { Project, TimelineItem } from '../project/model'
import type { ResolvedTimelineItem } from './timeline-model'

interface TimelineTrackProps {
  project: Project
  items: ResolvedTimelineItem[]
  activeIndex: number
  onActiveIndexChange(index: number): void
  onReorder(orderedItemIds: string[]): void
}

export function TimelineTrack({
  project,
  items,
  activeIndex,
  onActiveIndexChange,
  onReorder,
}: TimelineTrackProps) {
  const move = (fromIndex: number, toIndex: number) => {
    const ordered = [...project.timeline].sort((a, b) => a.order - b.order)
    const reorderedVideoIds = items.map((item) => item.item.id)
    const [moved] = reorderedVideoIds.splice(fromIndex, 1)
    reorderedVideoIds.splice(toIndex, 0, moved)
    let videoIndex = 0
    onReorder(
      ordered.map((item) =>
        item.track === 'video' ? reorderedVideoIds[videoIndex++] : item.id,
      ),
    )
    onActiveIndexChange(toIndex)
  }

  const audioItems = project.timeline
    .filter((item) => item.track === 'audio')
    .sort((a, b) => a.order - b.order)

  const audioLabel = (item: TimelineItem) =>
    project.nodes.find((node) => node.id === item.nodeId)?.title ?? '缺少音频'

  return (
    <section className="timeline-track" aria-label="时间线">
      <ol className="timeline-track__video" aria-label="主视频轨">
        {items.map((resolved, index) => {
          const ordinal = String(index + 1).padStart(2, '0')
          const label = resolved.node?.title ?? `视频 ${ordinal}`
          return (
            <li key={resolved.item.id} className={resolved.missing ? 'timeline-track__item timeline-track__item--missing' : 'timeline-track__item'}>
              <button
                type="button"
                className="timeline-track__select"
                aria-label={`选择视频 ${ordinal}`}
                aria-current={index === activeIndex ? 'true' : undefined}
                onClick={() => onActiveIndexChange(index)}
              >
                {resolved.missing ? <TriangleAlert aria-hidden="true" /> : null}
                <span>{resolved.missing ? '缺少片段' : label}</span>
                <small>{resolved.item.durationSeconds.toFixed(2)}s</small>
              </button>
              {resolved.missing ? (
                <a href={`/project/${project.id}?focus=${resolved.item.nodeId}`}>返回来源节点</a>
              ) : null}
              <div className="timeline-track__move">
                <button
                  type="button"
                  aria-label={`将视频 ${ordinal} 前移`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`将视频 ${ordinal} 后移`}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      <table className="timeline-track__audio">
        <tbody>
          <tr aria-label="音频轨道">
            <th scope="row">音频轨道</th>
            <td>{audioItems.length > 0 ? audioItems.map(audioLabel).join(' · ') : '无音频'}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}
