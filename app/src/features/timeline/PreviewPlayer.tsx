import { useEffect, useMemo, useRef, useState } from 'react'

import type { Asset } from '../project/model'
import type { ResolvedTimelineItem } from './timeline-model'

const FRAME_RATE = 24

function PreviewMedia({
  asset,
  title,
  currentTime = 0,
}: {
  asset?: Asset
  title: string
  currentTime?: number
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.currentTime = currentTime
  }, [currentTime])

  if (!asset) return <div className="preview-player__missing">缺少片段</div>
  if (asset.kind === 'video') {
    return (
      <video
        ref={videoRef}
        data-testid="preview-video"
        src={asset.url}
        aria-label={title}
        muted
        playsInline
        preload="metadata"
      />
    )
  }
  return <img src={asset.url} alt={title} />
}

interface PreviewPlayerProps {
  items: ResolvedTimelineItem[]
  activeIndex: number
  selectionRevision: number
  onActiveIndexChange(index: number): void
}

export function PreviewPlayer({
  items,
  activeIndex,
  selectionRevision,
  onActiveIndexChange,
}: PreviewPlayerProps) {
  const active = items[activeIndex]
  const previous = items[activeIndex - 1]
  const [currentFrame, setCurrentFrame] = useState(() =>
    Math.round((active?.startSeconds ?? 0) * FRAME_RATE),
  )
  const [loopCurrent, setLoopCurrent] = useState(false)
  const [comparePrevious, setComparePrevious] = useState(false)
  const currentSeconds = currentFrame / FRAME_RATE
  const selectedItemRef = useRef(active)
  selectedItemRef.current = active

  useEffect(() => {
    setCurrentFrame(
      Math.round((selectedItemRef.current?.startSeconds ?? 0) * FRAME_RATE),
    )
    setComparePrevious(false)
  }, [selectionRevision])

  const totalFrames = useMemo(
    () => Math.round((items.at(-1)?.endSeconds ?? 0) * FRAME_RATE),
    [items],
  )

  const step = (direction: -1 | 1) => {
    if (!active) return
    const startFrame = Math.round(active.startSeconds * FRAME_RATE)
    const endFrame = Math.round(active.endSeconds * FRAME_RATE)
    let nextFrame = currentFrame + direction

    if (loopCurrent) {
      if (nextFrame >= endFrame) nextFrame = startFrame
      if (nextFrame < startFrame) nextFrame = Math.max(startFrame, endFrame - 1)
    } else {
      nextFrame = Math.min(totalFrames, Math.max(0, nextFrame))
      const nextIndex = items.findIndex(
        (item, index) =>
          nextFrame >= Math.round(item.startSeconds * FRAME_RATE) &&
          (nextFrame < Math.round(item.endSeconds * FRAME_RATE) ||
            (index === items.length - 1 && nextFrame === totalFrames)),
      )
      if (nextIndex >= 0 && nextIndex !== activeIndex) {
        onActiveIndexChange(nextIndex)
      }
    }
    setCurrentFrame(nextFrame)
  }

  if (!active) {
    return <section className="preview-player" aria-label="成片播放器">时间线为空</section>
  }

  const title = active.node?.title ?? '缺少片段'

  return (
    <section className="preview-player" aria-label="成片播放器">
      <div className="preview-player__stage">
        {comparePrevious && previous ? (
          <div className="preview-player__comparison" role="region" aria-label="相邻镜头对比">
            <figure>
              <PreviewMedia asset={previous.asset} title={previous.node?.title ?? '缺少片段'} />
              <figcaption>{previous.node?.title ?? '缺少片段'}</figcaption>
            </figure>
            <figure>
              <PreviewMedia asset={active.asset} title={title} />
              <figcaption>{title}</figcaption>
            </figure>
          </div>
        ) : (
          <PreviewMedia
            asset={active.asset}
            title={title}
            currentTime={Math.max(0, currentSeconds - active.startSeconds)}
          />
        )}
      </div>
      <div className="preview-player__transport">
        <button type="button" onClick={() => step(-1)}>上一帧</button>
        <output aria-label="当前播放时间" data-seconds={String(currentSeconds)}>
          {currentSeconds.toFixed(3)} 秒
        </output>
        <button type="button" onClick={() => step(1)}>下一帧</button>
        <button
          type="button"
          aria-pressed={loopCurrent}
          onClick={() => setLoopCurrent((value) => !value)}
        >
          循环当前片段
        </button>
        <button
          type="button"
          aria-pressed={comparePrevious}
          disabled={!previous}
          onClick={() => setComparePrevious((value) => !value)}
        >
          对比上一镜头
        </button>
      </div>
    </section>
  )
}
