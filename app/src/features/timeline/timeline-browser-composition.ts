import { drawTimelineFrame, framePlan, gainAt } from './timeline-composition'
import { clipDuration } from './timeline-math'
import { getTimelineDuration } from './timeline-project'
import type { CompositionRuntime, PreparedComposition } from './timeline-render-export'
import type { ResolvedTimelineClip } from './timeline-types'

function check(signal: AbortSignal) { if (signal.aborted) throw new DOMException('已取消导出', 'AbortError') }

function ready(target: EventTarget, event: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); target.removeEventListener(event, success); target.removeEventListener('error', failure); signal.removeEventListener('abort', abort) }
    const success = () => { cleanup(); resolve() }
    const failure = () => { cleanup(); reject(new Error('合成：素材解码失败。')) }
    const abort = () => { cleanup(); reject(new DOMException('已取消导出', 'AbortError')) }
    const timer = setTimeout(() => { cleanup(); reject(new Error('合成：素材加载超时。')) }, 20_000)
    target.addEventListener(event, success, { once: true }); target.addEventListener('error', failure, { once: true }); signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}

/** Same scheduling contract for offline mixing and the preview's source-local envelopes. */
export function scheduleCompositionAudio(context: BaseAudioContext, destination: AudioNode, items: Array<{ item: ResolvedTimelineClip; buffer: AudioBuffer }>) {
  const sources: AudioBufferSourceNode[] = [], gains: GainNode[] = []
  const startTime = context.currentTime
  for (const { item, buffer } of items) {
    const clip = item.clip, source = context.createBufferSource(), gain = context.createGain()
    source.buffer = buffer
    source.playbackRate.value = clip.playbackRate ?? 1
    source.connect(gain); gain.connect(destination)
    const when = startTime + clip.startSeconds, duration = clipDuration(clip)
    gain.gain.setValueAtTime(gainAt(clip.volumeKeyframes, 0), when)
    for (const point of clip.volumeKeyframes ?? []) {
      if (point.timeSeconds > 0 && point.timeSeconds < duration) gain.gain.linearRampToValueAtTime(point.value, when + point.timeSeconds)
    }
    gain.gain.linearRampToValueAtTime(gainAt(clip.volumeKeyframes, duration), when + duration)
    source.start(when, clip.sourceInSeconds, clip.sourceOutSeconds - clip.sourceInSeconds)
    sources.push(source); gains.push(gain)
  }
  return () => { sources.forEach(source => { source.stop(); source.disconnect() }); gains.forEach(gain => gain.disconnect()) }
}

export function compositionSupported() {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof OfflineAudioContext !== 'undefined'
}

export const browserCompositionRuntime: CompositionRuntime = {
  yieldControl: () => new Promise(resolve => setTimeout(resolve, 0)),
  async prepare(timeline, resolved, signal, progress) {
    if (!compositionSupported()) throw new Error('合成：当前浏览器不支持 WebCodecs 本地编码，请使用新版 Chromium 浏览器。')
    check(signal)
    // Loaded only when exporting; no media is sent to this library or a server.
    const { Output, BufferTarget, WebMOutputFormat, CanvasSource, AudioBufferSource, Quality } = await import('mediabunny')
    check(signal)
    const canvas = document.createElement('canvas')
    canvas.width = timeline.width; canvas.height = timeline.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('合成：无法创建渲染画布。')
    const media = new Map<string, HTMLImageElement | HTMLVideoElement>()
    const urls: string[] = []
    const duration = getTimelineDuration(timeline)
    const audio = resolved.audio.length ? new OfflineAudioContext(2, Math.ceil(duration * 48000), 48000) : undefined
    const audioItems: Array<{ item: ResolvedTimelineClip; buffer: AudioBuffer }> = []
    const target = new BufferTarget()
    const output = new Output({ target, format: new WebMOutputFormat() })
    let finalized = false, requestedFrames = 0, encodedFrames = 0
    const videoSource = new CanvasSource(canvas, { codec: 'vp8', quality: new Quality({ bitrate: 6_000_000 }), onEncodedPacket: () => { encodedFrames++ } })
    output.addVideoTrack(videoSource, { frameRate: timeline.frameRate })
    const audioSource = audio ? new AudioBufferSource({ codec: 'opus', quality: new Quality({ bitrate: 128_000 }) }) : undefined
    if (audioSource) output.addAudioTrack(audioSource)
    const dispose = async () => {
      try { if (!finalized) await output.cancel() }
      finally {
        media.forEach(element => { if (element instanceof HTMLVideoElement) { element.pause(); element.removeAttribute('src'); element.load() } else element.src = '' })
        urls.forEach(url => URL.revokeObjectURL(url))
      }
    }
    try {
      const all = [...resolved.visual, ...resolved.audio]
      for (let index = 0; index < all.length; index++) {
        check(signal)
        const item = all[index]
        if (!item.asset || item.missing) throw new Error('合成：时间线中存在缺失素材，请先补齐或删除该片段。')
        const response = await fetch(item.asset.url, { signal })
        if (!response.ok) throw new Error('合成：素材下载失败，请确认地址仍有效或先导入本地资产。')
        const blob = await response.blob()
        check(signal)
        if (item.clip.kind === 'audio') {
          const buffer = await audio!.decodeAudioData(await blob.arrayBuffer())
          check(signal)
          if (buffer.duration + 0.1 < item.clip.sourceOutSeconds) throw new Error('合成：音频素材实际时长短于片段出点，请调整出点。')
          audioItems.push({ item, buffer })
        } else {
          const url = URL.createObjectURL(blob); urls.push(url)
          if (item.asset.kind === 'video') {
            const video = document.createElement('video')
            video.muted = true; video.playsInline = true; video.preload = 'auto'
            media.set(item.clip.id, video)
            const loaded = ready(video, 'loadeddata', signal); video.src = url; await loaded
            if (video.duration + 0.1 < item.clip.sourceOutSeconds) throw new Error('合成：视频素材实际时长短于片段出点，请调整出点。')
          } else {
            const image = new Image(); media.set(item.clip.id, image)
            const loaded = ready(image, 'load', signal); image.src = url; await loaded
          }
        }
        progress({ phase: 'preparing', fraction: (index + 1) / Math.max(1, all.length) * 0.08 })
      }
      check(signal)
      await output.start()
      if (audio && audioSource) {
        const stop = scheduleCompositionAudio(audio, audio.destination, audioItems)
        try {
          const mixed = await audio.startRendering()
          check(signal)
          await audioSource.add(mixed)
          audioSource.close()
        } finally { stop() }
      }
      check(signal)
      const result: PreparedComposition = {
        dispose,
        async encode(seconds, frameDuration) {
          check(signal)
          await videoSource.add(seconds, frameDuration)
          requestedFrames++
        },
        async flush() {
          check(signal)
          videoSource.close()
          await output.finalize()
          finalized = true
          check(signal)
          if (encodedFrames !== requestedFrames || !target.buffer?.byteLength) throw new Error('合成：编码帧数不完整，请重试。')
          return new Blob([target.buffer], { type: 'video/webm' })
        },
        async render(seconds) {
          check(signal)
          const plan = framePlan(resolved, seconds, timeline.frameRate)
          for (const layer of plan.layers) {
            const element = media.get(layer.item.clip.id)
            if (!(element instanceof HTMLVideoElement)) continue
            const targetTime = Math.min(layer.mediaTime, Math.max(0, element.duration - 1 / timeline.frameRate))
            if (Math.abs(element.currentTime - targetTime) > 0.001) {
              const seek = ready(element, 'seeked', signal); element.currentTime = targetTime; await seek
            }
          }
          check(signal)
          drawTimelineFrame(context, plan, id => media.get(id), canvas.width, canvas.height)
        },
      }
      return result
    } catch (error) { await dispose(); throw error }
  },
}
