import { Pause, Play } from 'lucide-react'
import {
  useEffect,
  useCallback,
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
import { drawTimelineFrame, framePlan, gainAt, normalizeSubtitleStyle } from './timeline-composition'
import { TimelineAudioPlayback } from './TimelineAudioPlayback'

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
  playbackRate,
  layout,
  opacity = 1,
  onReady,
}: {
  asset?: Asset
  title: string
  mediaTime: number
  playbackRate: number
  layout?: TimelineClipLayout
  opacity?: number
  onReady?: (media: CanvasImageSource) => void
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
    const media = videoRef.current ?? imageRef.current
    if (media && (media instanceof HTMLVideoElement ? media.readyState >= 2 : media.complete && media.naturalWidth > 0)) onReady?.(media)
  }, [mediaTime, onReady])

  if (!asset) return <div className="preview-player__missing">缺少片段</div>
  if (asset.kind === 'video') {
    return (
      <video
        ref={videoRef}
        data-testid="preview-video"
        data-playback-rate={playbackRate}
        data-layout-mode={layout?.mode ?? 'full'}
        className="preview-player__media-layer"
        style={{ ...layoutStyle(layout), opacity }}
        crossOrigin="anonymous"
        src={asset.url}
        aria-label={title}
        muted
        playsInline
        preload="metadata"
        onSeeked={() =>
          videoRef.current && onReady?.(videoRef.current)
        }
      />
    )
  }
  return (
    <img
      ref={imageRef}
      data-layout-mode={layout?.mode ?? 'full'}
      className="preview-player__media-layer"
      style={{ ...layoutStyle(layout), opacity }}
      crossOrigin="anonymous"
      src={asset.url}
      alt={title}
      onLoad={() =>
        imageRef.current && onReady?.(imageRef.current)
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
  const plan = useMemo(() => framePlan(resolved, Math.min(currentTime, Math.max(0, duration - 1 / timeline.frameRate)), timeline.frameRate), [resolved, currentTime, duration, timeline.frameRate])
  const mediaRefs = useRef(new Map<string, CanvasImageSource>())
  const [renderError, setRenderError] = useState<string>()
  const draw = useCallback(() => {
    const canvas = canvasRef.current, context = canvas?.getContext('2d')
    if (!context || !canvas) return
    try { drawTimelineFrame(context, plan, id => mediaRefs.current.get(id), timeline.width, timeline.height) }
    catch { setRenderError('预览画面无法读取，请检查素材解码或跨域访问权限。') }
  }, [canvasRef, plan, timeline.width, timeline.height])
  useEffect(draw, [draw])

  useEffect(() => {
    if (!active || active.clip.id === selectedClipId) return
    if ([...resolved.audio, ...resolved.subtitles].some(item => item.clip.id === selectedClipId)) return
    onSelectedClipChange(active.clip.id)
  }, [active, onSelectedClipChange, selectedClipId, resolved.audio, resolved.subtitles])

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
      resolved.audio.filter(
        (item) => currentTime >= item.startSeconds && currentTime < item.endSeconds,
      ),
    [currentTime, resolved.audio],
  )

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

  if (!active && duration === 0) {
    return <section className="preview-player" aria-label="成片播放器">时间线为空</section>
  }

  const title = active?.node?.title ?? active?.clip.name ?? '缺少片段'
  const mediaTime =
    (active?.clip.sourceInSeconds ?? 0) +
    Math.max(0, currentTime - (active?.startSeconds ?? 0)) * (active?.clip.playbackRate ?? 1)

  return (
    <section className="preview-player" aria-label="成片播放器">
      <div className="preview-player__stage">
        {comparePrevious && previous && active ? (
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
            {plan.layers.map(({ item: layer, opacity, mediaTime }) => (
              <PreviewMedia
                key={layer.clip.id}
                asset={layer.asset}
                title={layer.node?.title ?? layer.clip.name}
                mediaTime={mediaTime}
                opacity={opacity}
                onReady={media => { mediaRefs.current.set(layer.clip.id, media); draw() }}
                playbackRate={layer.clip.playbackRate ?? 1}
                layout={layer.clip.layout}
              />
            ))}
            {plan.subtitles.map(clip => {
              const style = normalizeSubtitleStyle(clip.subtitleStyle)
              return <div key={clip.id} className="preview-player__subtitle" data-testid="timeline-subtitle" style={{ color: style.color, background: style.background, fontWeight: style.bold ? 700 : 400, fontSize: `${style.fontSize / 1080 * 100}cqh`, top: style.position === 'top' ? '9%' : style.position === 'center' ? '50%' : '91%', bottom: 'auto', transform: 'translateY(-50%)', whiteSpace: 'pre-wrap' }}>{clip.text}</div>
            })}
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
      {activeAudio.filter(item => item.asset).map(item => <TimelineAudioPlayback key={item.clip.id} item={item} currentTime={currentTime} playing={playing} volume={gainAt(item.clip.volumeKeyframes, currentTime - item.startSeconds)} />)}
      {renderError && <p role="alert">{renderError}</p>}
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
