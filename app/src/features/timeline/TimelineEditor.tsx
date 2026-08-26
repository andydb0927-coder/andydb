import { ChevronLeft, ChevronRight, Scissors, Trash2 } from 'lucide-react'
import { useMemo, useState, type DragEvent } from 'react'

import {
  addClip,
  addSubtitleClip,
  clipDuration,
  deleteClip,
  getTimelineDuration,
  moveClip,
  splitClip,
  trimClip,
  updateClipLayout,
  updateClipPlaybackRate,
  type TimelineClip,
  type TimelineClipLayout,
  type TimelineProject,
  type TimelineSourceCandidate,
  type TimelineTrack,
  type TimelineTrackKind,
} from './timeline-project'

const SOURCE_MIME = 'application/x-wireless-canvas-source'

const kindCopy: Record<TimelineTrackKind, string> = {
  video: '视频',
  audio: '音频',
  image: '图片',
  subtitle: '字幕',
}

interface TimelineEditorProps {
  projectId: string
  timeline: TimelineProject
  candidates: TimelineSourceCandidate[]
  currentTime: number
  selectedClipId?: string
  onTimelineChange(timeline: TimelineProject): void
  onCurrentTimeChange(seconds: number): void
  onSelectedClipChange(clipId: string | undefined): void
}

function allClips(timeline: TimelineProject) {
  return timeline.tracks.flatMap((track) => track.clips)
}

function clipOrdinal(track: TimelineTrack, clip: TimelineClip) {
  return String(track.clips.findIndex((candidate) => candidate.id === clip.id) + 1).padStart(2, '0')
}

function TimelineClipCard({
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

export function TimelineEditor({
  projectId,
  timeline,
  candidates,
  currentTime,
  selectedClipId,
  onTimelineChange,
  onCurrentTimeChange,
  onSelectedClipChange,
}: TimelineEditorProps) {
  const [subtitle, setSubtitle] = useState('')
  const [subtitleDuration, setSubtitleDuration] = useState(3)
  const duration = getTimelineDuration(timeline)
  const selectedClip = useMemo(
    () => allClips(timeline).find((clip) => clip.id === selectedClipId),
    [selectedClipId, timeline],
  )

  const apply = (next: TimelineProject) => {
    if (next !== timeline) onTimelineChange(next)
  }

  const addCandidate = (
    candidate: TimelineSourceCandidate,
    targetKind?: TimelineTrackKind,
  ) => {
    const next = addClip(timeline, candidate, undefined, targetKind)
    apply(next)
    const added = next.tracks
      .flatMap((track) => track.clips)
      .find((clip) => !allClips(timeline).some(({ id }) => id === clip.id))
    if (added) {
      onSelectedClipChange(added.id)
      onCurrentTimeChange(added.startSeconds)
    }
  }

  const dropCandidate = (
    event: DragEvent<HTMLElement>,
    targetKind: TimelineTrackKind,
  ) => {
    event.preventDefault()
    const id = event.dataTransfer.getData(SOURCE_MIME)
    const candidate = candidates.find((item) => item.id === id)
    if (candidate && candidate.kind === targetKind) addCandidate(candidate, targetKind)
  }

  const selectClip = (clip: TimelineClip) => {
    onSelectedClipChange(clip.id)
    onCurrentTimeChange(clip.startSeconds)
  }

  const addSubtitle = () => {
    const next = addSubtitleClip(
      timeline,
      subtitle,
      currentTime,
      subtitleDuration,
    )
    if (next === timeline) return
    apply(next)
    const added = next.tracks
      .find((track) => track.kind === 'subtitle')
      ?.clips.at(-1)
    onSelectedClipChange(added?.id)
    setSubtitle('')
  }

  const splitSelected = () => {
    if (!selectedClip) return
    apply(
      splitClip(
        timeline,
        selectedClip.id,
        currentTime - selectedClip.startSeconds,
      ),
    )
  }

  const deleteSelected = () => {
    if (!selectedClip) return
    const next = deleteClip(timeline, selectedClip.id)
    apply(next)
    onSelectedClipChange(undefined)
  }

  const setPlaybackRate = (playbackRate: number) => {
    if (!selectedClip) return
    apply(updateClipPlaybackRate(timeline, selectedClip.id, playbackRate))
  }

  const setLayout = (layout: TimelineClipLayout) => {
    if (!selectedClip) return
    apply(updateClipLayout(timeline, selectedClip.id, layout))
  }

  const selectLayoutMode = (mode: TimelineClipLayout['mode']) => {
    if (mode === 'full') {
      setLayout({ mode, x: 0, y: 0, width: 1, height: 1, slot: 'main' })
    } else if (mode === 'picture-in-picture') {
      setLayout({ mode, x: 0.68, y: 0.62, width: 0.28, height: 0.3, slot: 'overlay' })
    } else {
      setLayout({ mode, x: 0, y: 0, width: 1 / 3, height: 1, slot: 'left' })
    }
  }

  const updatePipGeometry = (
    key: 'x' | 'y' | 'width' | 'height',
    value: number,
  ) => {
    if (!selectedClip) return
    const current = selectedClip.layout?.mode === 'picture-in-picture'
      ? selectedClip.layout
      : { mode: 'picture-in-picture' as const, x: 0.68, y: 0.62, width: 0.28, height: 0.3, slot: 'overlay' as const }
    const next = { ...current, [key]: value }
    next.x = Math.min(next.x, 1 - next.width)
    next.y = Math.min(next.y, 1 - next.height)
    next.width = Math.min(next.width, 1 - next.x)
    next.height = Math.min(next.height, 1 - next.y)
    setLayout(next)
  }

  const selectThirdsSlot = (slot: 'left' | 'center' | 'right') => {
    setLayout({
      mode: 'thirds',
      x: slot === 'left' ? 0 : slot === 'center' ? 1 / 3 : 2 / 3,
      y: 0,
      width: 1 / 3,
      height: 1,
      slot,
    })
  }

  const ticks = Array.from(
    { length: Math.min(121, Math.max(1, Math.ceil(duration) + 1)) },
    (_, index) => index,
  )

  return (
    <section className="professional-timeline" aria-label="专业时间线编辑器">
      <div className="professional-timeline__heading">
        <div>
          <p>专业剪辑</p>
          <h2>多轨时间线</h2>
        </div>
        <output aria-label="当前剪辑时间">{currentTime.toFixed(3)} 秒</output>
      </div>

      <div className="professional-timeline__ruler">
        <input
          type="range"
          aria-label="时间线播放头"
          min={0}
          max={Math.max(duration, 1)}
          step={1 / timeline.frameRate}
          value={Math.min(currentTime, Math.max(duration, 1))}
          onChange={(event) => onCurrentTimeChange(Number(event.target.value))}
        />
        <div aria-label="时间刻度" className="professional-timeline__ticks">
          {ticks.map((second) => (
            <time key={second} dateTime={`PT${second}S`}>{second}s</time>
          ))}
        </div>
      </div>

      <div className="professional-timeline__body">
        <aside className="professional-timeline__sources" aria-label="素材库与画布片段">
          <h3>素材</h3>
          {candidates.length > 0 ? (
            candidates.map((candidate) => (
              <article
                key={candidate.id}
                aria-label={candidate.name}
                draggable
                onDragStart={(event) =>
                  event.dataTransfer.setData(SOURCE_MIME, candidate.id)
                }
              >
                <strong>{candidate.name}</strong>
                <span>{kindCopy[candidate.kind]}</span>
                <button type="button" onClick={() => addCandidate(candidate)}>
                  将{candidate.name}加入{kindCopy[candidate.kind]}轨道
                </button>
              </article>
            ))
          ) : (
            <p>暂无未使用素材</p>
          )}
        </aside>

        <div className="professional-timeline__tracks">
          {[...timeline.tracks]
            .sort((left, right) => left.order - right.order)
            .map((track) => (
              <section
                key={track.id}
                className="professional-timeline__track"
                role="row"
                aria-label={track.name}
              >
                <header role="rowheader">{track.name}</header>
                <div
                  className="professional-timeline__dropzone"
                  aria-label={`${track.name}投放区`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => dropCandidate(event, track.kind)}
                >
                  <ol aria-label={track.kind === 'video' ? '主视频轨' : track.name}>
                    {track.clips.map((clip) => (
                      <TimelineClipCard
                        key={clip.id}
                        projectId={projectId}
                        track={track}
                        clip={clip}
                        selected={clip.id === selectedClipId}
                        onSelect={() => selectClip(clip)}
                        onMove={(direction) => {
                          apply(moveClip(timeline, clip.id, direction))
                          onSelectedClipChange(clip.id)
                        }}
                      />
                    ))}
                  </ol>
                </div>
              </section>
            ))}
        </div>
      </div>

      <div className="professional-timeline__tools">
        <form
          className="professional-timeline__subtitle-form"
          onSubmit={(event) => {
            event.preventDefault()
            addSubtitle()
          }}
        >
          <label>
            字幕文本
            <input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
          </label>
          <label>
            字幕时长
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={subtitleDuration}
              onChange={(event) => setSubtitleDuration(Number(event.target.value))}
            />
          </label>
          <button type="button" disabled={!subtitle.trim()} onClick={addSubtitle}>
            在播放头添加字幕
          </button>
        </form>

        {selectedClip ? (
          <section className="professional-timeline__inspector" aria-label="片段编辑器">
            <h3>{selectedClip.name}</h3>
            <label>
              片段入点
              <input
                type="number"
                min={0}
                max={selectedClip.sourceOutSeconds}
                step={1 / timeline.frameRate}
                value={selectedClip.sourceInSeconds}
                onChange={(event) =>
                  apply(
                    trimClip(
                      timeline,
                      selectedClip.id,
                      Number(event.target.value),
                      selectedClip.sourceOutSeconds,
                    ),
                  )
                }
              />
            </label>
            <label>
              片段出点
              <input
                type="number"
                min={selectedClip.sourceInSeconds}
                max={selectedClip.sourceDurationSeconds}
                step={1 / timeline.frameRate}
                value={selectedClip.sourceOutSeconds}
                onChange={(event) =>
                  apply(
                    trimClip(
                      timeline,
                      selectedClip.id,
                      selectedClip.sourceInSeconds,
                      Number(event.target.value),
                    ),
                  )
                }
              />
            </label>
            <output aria-label="片段时长">{clipDuration(selectedClip).toFixed(2)} 秒</output>
            <label>
              片段变速
              <input
                type="range"
                aria-label="片段变速"
                min={0.25}
                max={4}
                step={0.25}
                value={selectedClip.playbackRate ?? 1}
                onChange={(event) => setPlaybackRate(Number(event.target.value))}
              />
            </label>
            <output aria-label="变速倍率">{(selectedClip.playbackRate ?? 1).toFixed(2)}x</output>
            <output aria-label="变速后时长">{clipDuration(selectedClip).toFixed(2)} 秒</output>
            {selectedClip.kind === 'video' || selectedClip.kind === 'image' ? (
              <fieldset className="professional-timeline__layout-controls">
                <legend>合成布局</legend>
                <label>
                  布局模式
                  <select
                    aria-label="布局模式"
                    value={selectedClip.layout?.mode ?? 'full'}
                    onChange={(event) => selectLayoutMode(event.target.value as TimelineClipLayout['mode'])}
                  >
                    <option value="full">主轨全屏</option>
                    <option value="picture-in-picture">画中画副轨</option>
                    <option value="thirds">三分屏</option>
                  </select>
                </label>
                {selectedClip.layout?.mode === 'picture-in-picture' ? (
                  <div className="professional-timeline__pip-grid">
                    {(['x', 'y', 'width', 'height'] as const).map((key) => (
                      <label key={key}>
                        {{ x: '水平位置', y: '垂直位置', width: '副轨宽度', height: '副轨高度' }[key]}
                        <input
                          type="range"
                          aria-label={{ x: '画中画水平位置', y: '画中画垂直位置', width: '画中画宽度', height: '画中画高度' }[key]}
                          min={0}
                          max={1}
                          step={0.01}
                          value={selectedClip.layout?.[key] ?? 0}
                          onChange={(event) => updatePipGeometry(key, Number(event.target.value))}
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
                {selectedClip.layout?.mode === 'thirds' ? (
                  <label>
                    三分屏位置
                    <select
                      aria-label="三分屏位置"
                      value={selectedClip.layout.slot}
                      onChange={(event) => selectThirdsSlot(event.target.value as 'left' | 'center' | 'right')}
                    >
                      <option value="left">左</option>
                      <option value="center">中</option>
                      <option value="right">右</option>
                    </select>
                  </label>
                ) : null}
              </fieldset>
            ) : null}
            <button type="button" onClick={splitSelected}>
              <Scissors aria-hidden="true" />
              在播放头处分割
            </button>
            <button type="button" onClick={deleteSelected}>
              <Trash2 aria-hidden="true" />
              删除当前片段
            </button>
          </section>
        ) : (
          <p className="professional-timeline__empty-inspector">选择片段后可裁剪、分割或删除。</p>
        )}
      </div>
    </section>
  )
}
