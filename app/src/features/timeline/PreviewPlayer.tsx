import { Pause, Play } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'

import type { Asset } from '../project/model'
import type {
  ResolvedTimelineClip,
  ResolvedTimelineProject,
  TimelineProject,
  TimelineClipLayout,
} from './timeline-project'
import { getTimelineDuration } from './timeline-project'

function drawPreviewFrame(
  canvas: HTMLCanvasElement | null,
  media: CanvasImageSource | undefined,
  subtitle: string | undefined,
  layout: TimelineClipLayout | undefined,
  clearCanvas = true,
) {
  const context = canvas?.getContext('2d')
  if (!canvas || !context || !media) return
  if (clearCanvas) {
    context.fillStyle = '#090a0d'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  const frame = layout ?? { x: 0, y: 0, width: 1, height: 1 }
  try {
    context.drawImage(
      media,
      frame.x * canvas.width,
      frame.y * canvas.height,
      frame.width * canvas.width,
      frame.height * canvas.height,
    )
  } catch {
    return
  }
  if (subtitle) {
    context.font = '64px sans-serif'
    context.textAlign = 'center'
    context.fillStyle = '#ffffff'
    context.strokeStyle = 'rgba(0, 0, 0, 0.75)'
    context.lineWidth = 8
    context.strokeText(subtitle, canvas.width / 2, canvas.height - 100)
    context.fillText(subtitle, canvas.width / 2, canvas.height - 100)
  }
}

function layoutStyle(layout: TimelineClipLayout | undefined): CSSProperties {
  const frame = layout ?? { x: 0, y: 0, width: 1, height: 1 }
  return {
    left: `${frame.x * 100}%`,
    top: `${frame.y * 100}%`,
    width: `${frame.width * 100}%`,
    height: `${frame.height * 100}%`,
  }
}
function PreviewMedia({
  asset,
  title,
  mediaTime,
  subtitle,
  canvasRef,
  playbackRate,
  layout,
  clearCanvas,
}: {
  asset?: Asset
  title: string
  mediaTime: number
  subtitle?: string
  canvasRef?: RefObject<HTMLCanvasElement | null>
  playbackRate: number
  layout?: TimelineClipLayout
  clearCanvas?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, mediaTime)
      videoRef.current.playbackRate = playbackRate
    }
  }, [mediaTime, playbackRate])

  useEffect(() => {
    const media = videoRef.current ?? imageRef.current ?? undefined
    drawPreviewFrame(canvasRef?.current ?? null, media, subtitle, layout, clearCanvas)
  }, [canvasRef, clearCanvas, layout, mediaTime, subtitle])

  if (!asset) return <div className="preview-player__missing">缺少片段</div>
  if (asset.kind === 'video') {
    return (
      <video
        ref={videoRef}
        data-testid="preview-video"
        data-playback-rate={playbackRate}
        data-layout-mode={layout?.mode ?? 'full'}
        className="preview-player__media-layer"
        style={layoutStyle(layout)}
        src={asset.url}
        aria-label={title}
        muted
        playsInline
        preload="metadata"
        onSeeked={() =>
          drawPreviewFrame(canvasRef?.current ?? null, videoRef.current ?? undefined, subtitle, layout, clearCanvas)
        }
      />
    )
  }
  return (
    <img
      ref={imageRef}
      data-layout-mode={layout?.mode ?? 'full'}
      className="preview-player__media-layer"
      style={layoutStyle(layout)}
      src={asset.url}
      alt={title}
      onLoad={() =>
        drawPreviewFrame(canvasRef?.current ?? null, imageRef.current ?? undefined, subtitle, layout, clearCanvas)
      }
    />
  )
}

function activeVisualIndex(items: ResolvedTimelineClip[], seconds: number) {
  const exact = items.findIndex(
    (item, index) =>
      seconds >= item.startSeconds &&
      (seconds < item.endSeconds ||
        (index === items.length - 1 && seconds === item.endSeconds)),
  )
  if (exact >= 0) return exact
  const prior = items.findLastIndex((item) => item.startSeconds <= seconds)
  return Math.max(0, prior)
}

interface PreviewPlayerProps {
  timeline: TimelineProject
  resolved: ResolvedTimelineProject
  currentTime: number
  selectedClipId?: string
  canvasRef: RefObject<HTMLCanvasElement | null>
  onCurrentTimeChange(seconds: number): void
  onSelectedClipChange(clipId: string): void
}

export function PreviewPlayer({
  timeline,
  resolved,
  currentTime,
  selectedClipId,
  canvasRef,
  onCurrentTimeChange,
  onSelectedClipChange,
}: PreviewPlayerProps) {
  const items = resolved.visual
  const selectedIndex = items.findIndex(
    (item) =>
      item.clip.id === selectedClipId &&
      currentTime >= item.startSeconds &&
      currentTime <= item.endSeconds,
  )
  const activeIndex =
    selectedIndex >= 0 ? selectedIndex : activeVisualIndex(items, currentTime)
  const active = items[activeIndex]
  const previous = items[activeIndex - 1]
  const [playing, setPlaying] = useState(false)
  const [loopCurrent, setLoopCurrent] = useState(false)
  const [comparePrevious, setComparePrevious] = useState(false)
  const duration = getTimelineDuration(timeline)
  const totalFrames = Math.round(duration * timeline.frameRate)
  const currentFrame = Math.round(currentTime * timeline.frameRate)
  const subtitle = resolved.subtitles.find(
    (item) => currentTime >= item.startSeconds && currentTime < item.endSeconds,
  )?.clip.text
  const activeLayers = items
    .filter((item) => currentTime >= item.startSeconds && currentTime < item.endSeconds)
    .sort((left, right) => {
      const leftOverlay = left.clip.layout?.mode && left.clip.layout.mode !== 'full' ? 1 : 0
      const rightOverlay = right.clip.layout?.mode && right.clip.layout.mode !== 'full' ? 1 : 0
      return leftOverlay - rightOverlay || left.clip.order - right.clip.order
    })

  useEffect(() => {
    if (!active || active.clip.id === selectedClipId) return
    onSelectedClipChange(active.clip.id)
  }, [active, onSelectedClipChange, selectedClipId])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      const nextFrame = currentFrame + 1
      if (nextFrame >= totalFrames) {
        onCurrentTimeChange(duration)
        setPlaying(false)
        return
      }
      onCurrentTimeChange(nextFrame / timeline.frameRate)
    }, 1000 / timeline.frameRate)
    return () => window.clearInterval(timer)
  }, [currentFrame, duration, onCurrentTimeChange, playing, timeline.frameRate, totalFrames])

  useEffect(() => {
    setComparePrevious(false)
  }, [selectedClipId])

  const activeAudio = useMemo(
    () =>
      resolved.audio.find(
        (item) => currentTime >= item.startSeconds && currentTime < item.endSeconds,
      ),
    [currentTime, resolved.audio],
  )
  const audioRef = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    if (audioRef.current && activeAudio) {
      audioRef.current.currentTime =
        activeAudio.clip.sourceInSeconds +
        (currentTime - activeAudio.startSeconds) * (activeAudio.clip.playbackRate ?? 1)
      audioRef.current.playbackRate = activeAudio.clip.playbackRate ?? 1
    }
  }, [activeAudio, currentTime])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (playing && activeAudio) {
      void audio.play().catch(() => undefined)
    } else {
      audio.pause()
    }
  }, [activeAudio, playing])

  const setFrame = (frame: number) => {
    const clamped = Math.min(totalFrames, Math.max(0, frame))
    const seconds = clamped / timeline.frameRate
    const nextIndex = activeVisualIndex(items, seconds)
    const next = items[nextIndex]
    if (next) onSelectedClipChange(next.clip.id)
    onCurrentTimeChange(seconds)
  }

  const step = (direction: -1 | 1) => {
    if (!active) return
    const startFrame = Math.round(active.startSeconds * timeline.frameRate)
    const endFrame = Math.round(active.endSeconds * timeline.frameRate)
    let nextFrame = currentFrame + direction
    if (loopCurrent) {
      if (nextFrame >= endFrame) nextFrame = startFrame
      if (nextFrame < startFrame) nextFrame = Math.max(startFrame, endFrame - 1)
    }
    setFrame(nextFrame)
  }

  if (!active) {
    return <section className="preview-player" aria-label="成片播放器">时间线为空</section>
  }

  const title = active.node?.title ?? active.clip.name ?? '缺少片段'
  const mediaTime =
    active.clip.sourceInSeconds +
    Math.max(0, currentTime - active.startSeconds) * (active.clip.playbackRate ?? 1)

  return (
    <section className="preview-player" aria-label="成片播放器">
      <div className="preview-player__stage">
        {comparePrevious && previous ? (
          <div className="preview-player__comparison" role="region" aria-label="相邻镜头对比">
            <figure>
              <PreviewMedia
                asset={previous.asset}
                title={previous.node?.title ?? previous.clip.name}
                mediaTime={previous.clip.sourceInSeconds}
                playbackRate={previous.clip.playbackRate ?? 1}
                layout={previous.clip.layout}
              />
              <figcaption>{previous.node?.title ?? previous.clip.name}</figcaption>
            </figure>
            <figure>
              <PreviewMedia
                asset={active.asset}
                title={title}
                mediaTime={mediaTime}
                playbackRate={active.clip.playbackRate ?? 1}
                layout={active.clip.layout}
              />
              <figcaption>{title}</figcaption>
            </figure>
          </div>
        ) : (
          <>
            {(activeLayers.length ? activeLayers : [active]).map((layer, index) => (
              <PreviewMedia
                key={layer.clip.id}
                asset={layer.asset}
                title={layer.node?.title ?? layer.clip.name}
                mediaTime={
                  layer.clip.sourceInSeconds +
                  Math.max(0, currentTime - layer.startSeconds) * (layer.clip.playbackRate ?? 1)
                }
                subtitle={index === 0 ? subtitle : undefined}
                canvasRef={canvasRef}
                playbackRate={layer.clip.playbackRate ?? 1}
                layout={layer.clip.layout}
                clearCanvas={index === 0}
              />
            ))}
            {subtitle ? <div className="preview-player__subtitle">{subtitle}</div> : null}
          </>
        )}
        <canvas
          ref={canvasRef}
          className="preview-player__recording-surface"
          width={timeline.width}
          height={timeline.height}
          aria-label="预览录制画布"
        />
      </div>
      {activeAudio?.asset ? (
        <audio
          ref={audioRef}
          src={activeAudio.asset.url}
          preload="metadata"
          data-playback-rate={activeAudio.clip.playbackRate ?? 1}
        />
      ) : null}
      <div className="preview-player__transport">
        <button type="button" onClick={() => setPlaying((value) => !value)}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {playing ? '暂停' : '播放'}
        </button>
        <button type="button" onClick={() => setFrame(0)}>跳到开头</button>
        <button type="button" onClick={() => step(-1)}>上一帧</button>
        <output aria-label="当前播放时间" data-seconds={String(currentTime)}>
          {currentTime.toFixed(3)} 秒
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
