import { videoProcessingPlan } from './video-processing-plan'
import { audioProcessingPlan, renderAudioEffects, type AudioEffectOptions } from './audio-processing'

export type ImageGridSize = 2 | 3

export interface GridCell {
  column: number
  row: number
  x: number
  y: number
  width: number
  height: number
}

export interface ProcessedMedia {
  dataUrl: string
  mimeType: string
  width?: number
  height?: number
  durationSeconds?: number
  framesPerSecond?: number
  sampleRate?: number
  audioChannels?: number
}

export interface StoryboardLayoutInput {
  width: number
  height: number
}

export interface StoryboardLayoutItem extends StoryboardLayoutInput {
  number: number
  x: number
  y: number
}

export interface StoryboardLayout {
  width: number
  height: number
  items: StoryboardLayoutItem[]
}

export interface StoryboardLayoutOptions {
  columns?: number
  rows?: number
}

export interface AudioSliceOptions extends AudioEffectOptions {
  startSeconds: number
  endSeconds: number
  playbackRate: number
}

export interface VideoCropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface VideoSegmentOptions {
  startSeconds: number
  endSeconds: number
  crop?: VideoCropRect
  framesPerSecond?: number
  playbackRate?: number
  rotationQuarterTurns?: number
  mirrorHorizontal?: boolean
  mirrorVertical?: boolean
  layout?: 'single' | 'pip' | 'triple'
  secondaryUrls?: string[]
}

export function calculateGridCells(
  width: number,
  height: number,
  grid: ImageGridSize,
): GridCell[] {
  const safeWidth = Math.max(grid, Math.floor(width))
  const safeHeight = Math.max(grid, Math.floor(height))
  const cells: GridCell[] = []
  for (let row = 0; row < grid; row += 1) {
    const y = Math.floor((safeHeight * row) / grid)
    const nextY = Math.floor((safeHeight * (row + 1)) / grid)
    for (let column = 0; column < grid; column += 1) {
      const x = Math.floor((safeWidth * column) / grid)
      const nextX = Math.floor((safeWidth * (column + 1)) / grid)
      cells.push({
        column,
        row,
        x,
        y,
        width: nextX - x,
        height: nextY - y,
      })
    }
  }
  return cells
}

export function imageMirrorTransform(
  rotationQuarterTurns = 0,
  mirrorHorizontal = false,
  mirrorVertical = false,
) {
  const rotation = ((rotationQuarterTurns % 4) + 4) % 4
  return `rotate(${rotation * 90}deg) scale(${mirrorHorizontal ? -1 : 1}, ${mirrorVertical ? -1 : 1})`
}

export function calculateStoryboardLayout(
  sources: readonly StoryboardLayoutInput[],
  width = 4096,
  options: StoryboardLayoutOptions = {},
): StoryboardLayout {
  const safeWidth = Math.max(1024, Math.round(width))
  const margin = Math.round(safeWidth * 0.024)
  const gap = Math.round(safeWidth * 0.016)
  const captionHeight = Math.round(safeWidth * 0.048)
  const requestedColumns = Math.max(1, Math.floor(options.columns ?? 2))
  const columns = sources.length <= 1 ? 1 : Math.min(requestedColumns, sources.length)
  const requestedRows = Math.max(1, Math.floor(options.rows ?? Math.ceil(sources.length / columns)))
  if (columns * requestedRows < sources.length) {
    throw new Error('分镜组格数不足，无法容纳全部镜头。')
  }
  const itemWidth = Math.floor(
    (safeWidth - margin * 2 - gap * (columns - 1)) / columns,
  )
  const items: StoryboardLayoutItem[] = []
  let y = margin
  for (let row = 0; row < Math.ceil(sources.length / columns); row += 1) {
    const rowSources = sources.slice(row * columns, row * columns + columns)
    const rowHeights = rowSources.map(({ width: sourceWidth, height }) =>
      Math.max(1, Math.round((itemWidth * height) / Math.max(1, sourceWidth))),
    )
    const rowHeight = Math.max(...rowHeights, 1)
    rowSources.forEach((source, column) => {
      const imageHeight = rowHeights[column]
      items.push({
        ...source,
        number: row * columns + column + 1,
        x: margin + column * (itemWidth + gap),
        y,
        width: itemWidth,
        height: imageHeight,
      })
    })
    y += rowHeight + captionHeight + gap
  }
  return { width: safeWidth, height: y + margin, items }
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function canvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法创建媒体处理画布。')
  return context
}

export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法读取图片像素，请确认素材仍可访问。'))
    image.src = url
  })
}

function canvasToDataUrl(canvas: HTMLCanvasElement, mimeType = 'image/png') {
  try {
    return canvas.toDataURL(mimeType)
  } catch {
    throw new Error('浏览器阻止读取跨域媒体像素。请先保存素材到本地资产。')
  }
}

export async function splitImageToGrid(
  url: string,
  grid: ImageGridSize,
): Promise<ProcessedMedia[]> {
  const image = await loadImageElement(url)
  return calculateGridCells(image.naturalWidth, image.naturalHeight, grid).map(
    (cell) => {
      const canvas = createCanvas(cell.width, cell.height)
      canvasContext(canvas).drawImage(
        image,
        cell.x,
        cell.y,
        cell.width,
        cell.height,
        0,
        0,
        cell.width,
        cell.height,
      )
      return {
        dataUrl: canvasToDataUrl(canvas),
        mimeType: 'image/png',
        width: cell.width,
        height: cell.height,
      }
    },
  )
}

export interface StoryboardExportItem {
  url: string
  title: string
  subtitle?: string
}

export async function renderStoryboardGroup4K(
  sources: readonly StoryboardExportItem[],
  options: StoryboardLayoutOptions = {},
): Promise<Blob> {
  if (sources.length === 0) throw new Error('分镜组中没有可导出的图片。')
  const images = await Promise.all(sources.map(({ url }) => loadImageElement(url)))
  const layout = calculateStoryboardLayout(
    images.map((image) => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
    })),
    4096,
    options,
  )
  const canvas = createCanvas(layout.width, layout.height)
  const context = canvasContext(canvas)
  context.fillStyle = '#111114'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.textBaseline = 'top'
  layout.items.forEach((item, index) => {
    const source = sources[index]
    context.drawImage(images[index], item.x, item.y, item.width, item.height)
    const captionY = item.y + item.height + 28
    context.fillStyle = '#f4f2ed'
    context.font = '600 52px system-ui, sans-serif'
    context.fillText(`${item.number}. ${source.title}`, item.x, captionY, item.width)
    if (source.subtitle?.trim()) {
      context.fillStyle = '#aaa6a0'
      context.font = '400 38px system-ui, sans-serif'
      context.fillText(source.subtitle.trim(), item.x, captionY + 68, item.width)
    }
  })
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('分镜组 4K 图片编码失败。'))
    }, 'image/png')
  })
}

function waitForEvent(target: EventTarget, name: string, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      target.removeEventListener(name, success)
      target.removeEventListener('error', failure)
      signal?.removeEventListener('abort', abort)
    }
    const success = () => {
      cleanup()
      resolve()
    }
    const failure = () => {
      cleanup()
      reject(new Error('媒体解码失败。'))
    }
    const abort = () => { cleanup(); reject(new DOMException('视频处理已取消', 'AbortError')) }
    const timer = setTimeout(() => { cleanup(); reject(new Error('媒体加载超时，请检查地址或重试。')) }, 20_000)
    target.addEventListener(name, success, { once: true })
    target.addEventListener('error', failure, { once: true })
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}

async function seekVideo(video: HTMLVideoElement, seconds: number, signal?: AbortSignal) {
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await waitForEvent(video, 'loadedmetadata', signal)
  }
  const duration = Number.isFinite(video.duration) ? video.duration : seconds
  const target = Math.min(Math.max(0, seconds), Math.max(0, duration - 0.001))
  if (Math.abs(video.currentTime - target) < 0.002) return
  const seeking = waitForEvent(video, 'seeked', signal)
  video.currentTime = target
  await seeking
}

export async function captureVideoFrame(
  video: HTMLVideoElement,
  seconds: number,
): Promise<ProcessedMedia> {
  await seekVideo(video, seconds)
  const width = video.videoWidth || 1280
  const height = video.videoHeight || 720
  const canvas = createCanvas(width, height)
  canvasContext(canvas).drawImage(video, 0, 0, width, height)
  return {
    dataUrl: canvasToDataUrl(canvas),
    mimeType: 'image/png',
    width,
    height,
  }
}

export async function loadVideoElement(url: string, signal?: AbortSignal) {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  try {
    signal?.throwIfAborted()
    const ready = waitForEvent(video, 'loadedmetadata', signal)
    video.src = url
    video.load()
    await ready
    // MediaRecorder WebM often has no duration header. Decode the end before
    // validating ranges; do not substitute a guessed/stored duration.
    if (!Number.isFinite(video.duration)) {
      const end = waitForEvent(video, 'seeked', signal)
      video.currentTime = 1e10
      await end
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        throw new Error('无法读取视频时长，请重新导出或更换素材。')
      }
      await seekVideo(video, 0, signal)
    }
    return video
  } catch (error) {
    video.removeAttribute('src')
    video.load()
    throw error
  }
}

export async function readVideoMetadata(url: string, signal: AbortSignal) {
  const video = await loadVideoElement(url, signal)
  try {
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) throw new Error('无法读取视频尺寸或时长。')
    return { width: video.videoWidth, height: video.videoHeight, duration: video.duration }
  } finally { video.pause(); video.removeAttribute('src'); video.load() }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('无法读取导出媒体。'))
    reader.onerror = () => reject(new Error('无法读取导出媒体。'))
    reader.readAsDataURL(blob)
  })
}

export async function readVideoThumbnails(url: string, signal: AbortSignal, count = 12) {
  const video = await loadVideoElement(url, signal)
  try {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await waitForEvent(video, 'loadeddata', signal)
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('无法读取视频时长。')
    const canvas = createCanvas(160, Math.max(1, Math.round(160 * video.videoHeight / video.videoWidth)))
    const context = canvasContext(canvas)
    const thumbnails: string[] = []
    for (let index = 0; index < count; index++) {
      signal.throwIfAborted()
      await seekVideo(video, Math.max(0, video.duration - 0.05) * index / Math.max(1, count - 1), signal)
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      thumbnails.push(canvas.toDataURL('image/jpeg', 0.7))
    }
    return thumbnails
  } finally { video.pause(); video.removeAttribute('src'); video.load() }
}

export async function recordVideoSegment(
  sourceUrl: string,
  options: VideoSegmentOptions,
  signal?: AbortSignal,
): Promise<ProcessedMedia> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('当前浏览器不支持 MediaRecorder 视频导出。')
  }
  const videos: HTMLVideoElement[] = []
  let stream: MediaStream | undefined
  let recorder: MediaRecorder | undefined
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  try {
    const extraCount = options.layout === 'triple' ? 2 : options.layout === 'pip' ? 1 : 0
    if (extraCount && options.secondaryUrls?.length !== extraCount) throw new Error(`请选择 ${extraCount} 个副视频。`)
    for (const url of [sourceUrl, ...(options.secondaryUrls ?? []).slice(0, extraCount)]) videos.push(await loadVideoElement(url, signal))
    const video = videos[0]
    const plan = videoProcessingPlan({ width: video.videoWidth, height: video.videoHeight, duration: video.duration }, options)
    const fps = options.framesPerSecond ?? 30
    if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error('导出帧率必须在 1–60 之间。')
    const canvas = createCanvas(plan.width, plan.height)
    const context = canvasContext(canvas)
    const mainCanvas = createCanvas(plan.width, plan.height)
    const mainContext = canvasContext(mainCanvas)
    stream = canvas.captureStream?.(fps)
    if (!stream) throw new Error('当前浏览器不支持 Canvas 视频流导出。')
    const preferredMime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(mime => MediaRecorder.isTypeSupported(mime))
    if (!preferredMime) throw new Error('当前浏览器没有可用的 WebM 编码器。')
    recorder = new MediaRecorder(stream, { mimeType: preferredMime })
    const encoder = recorder
    const chunks: Blob[] = []
    encoder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    for (const [index, item] of videos.entries()) {
      await seekVideo(item, index === 0 ? options.startSeconds : 0, signal)
      if (item.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await waitForEvent(item, 'loadeddata', signal)
      item.playbackRate = plan.playbackRate
      item.loop = index !== 0
    }
    const draw = () => {
      mainContext.save()
      mainContext.clearRect(0, 0, plan.width, plan.height)
      mainContext.translate(plan.width / 2, plan.height / 2)
      mainContext.rotate(plan.rotation * Math.PI / 2)
      mainContext.scale(plan.mirrorHorizontal ? -1 : 1, plan.mirrorVertical ? -1 : 1)
      const c = plan.crop
      mainContext.drawImage(video, c.x, c.y, c.width, c.height, -c.width / 2, -c.height / 2, c.width, c.height)
      mainContext.restore()
      context.fillStyle = '#000'
      context.fillRect(0, 0, plan.width, plan.height)
      plan.layers.forEach((layer, index) => {
        const source = index === 0 ? mainCanvas : videos[index]
        const width = index === 0 ? plan.width : videos[index].videoWidth
        const height = index === 0 ? plan.height : videos[index].videoHeight
        const scale = Math.min(layer.width / width, layer.height / height)
        context.drawImage(source, layer.x + (layer.width - width * scale) / 2, layer.y + (layer.height - height * scale) / 2, width * scale, height * scale)
      })
    }
    draw()
    await Promise.all(videos.map(item => item.play()))
    signal?.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      abort = () => reject(new DOMException('视频处理已取消', 'AbortError'))
      signal?.addEventListener('abort', abort, { once: true })
      encoder.onstop = () => resolve()
      encoder.onerror = () => reject(new Error('视频编码失败，请重试。'))
      timer = setTimeout(() => reject(new Error('视频播放停滞，已取消导出；未写入不完整结果。')), (plan.durationSeconds + 10) * 1000)
      encoder.start(200)
      const tick = () => {
        try {
          signal?.throwIfAborted()
          draw()
          if (video.currentTime >= options.endSeconds - 0.02 || video.ended) { encoder.stop(); return }
          frame = requestAnimationFrame(tick)
        } catch (error) { reject(error) }
      }
      tick()
    })
    signal?.throwIfAborted()
    if (!chunks.length) throw new Error('视频编码没有输出数据。')
    const dataUrl = await blobToDataUrl(new Blob(chunks, { type: 'video/webm' }))
    signal?.throwIfAborted()
    return { dataUrl, mimeType: 'video/webm', width: plan.width, height: plan.height, durationSeconds: plan.durationSeconds, framesPerSecond: fps }
  } finally {
    clearTimeout(timer)
    cancelAnimationFrame(frame)
    if (abort) signal?.removeEventListener('abort', abort)
    if (recorder?.state !== 'inactive' && recorder) recorder.stop()
    stream?.getTracks().forEach(track => track.stop())
    videos.forEach(video => { video.pause(); video.removeAttribute('src'); video.load() })
  }
}

export function sliceAndResampleChannels(
  channels: readonly Float32Array[],
  sampleRate: number,
  options: AudioSliceOptions,
) {
  if (channels.length === 0) throw new Error('音频没有可用声道。')
  const sourceLength = Math.min(...channels.map(({ length }) => length))
  const start = Math.min(
    sourceLength,
    Math.max(0, Math.floor(options.startSeconds * sampleRate)),
  )
  const end = Math.min(
    sourceLength,
    Math.max(start + 1, Math.ceil(options.endSeconds * sampleRate)),
  )
  const rate = Math.min(2, Math.max(0.5, options.playbackRate))
  const outputLength = Math.max(1, Math.floor((end - start) / rate))
  return channels.map((channel) => {
    const output = new Float32Array(outputLength)
    for (let index = 0; index < outputLength; index += 1) {
      const sourcePosition = start + index * rate
      const left = Math.min(end - 1, Math.floor(sourcePosition))
      const right = Math.min(end - 1, left + 1)
      const mix = sourcePosition - left
      output[index] = channel[left] * (1 - mix) + channel[right] * mix
    }
    return output
  })
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

export function encodePcm16Wav(
  channels: readonly Float32Array[],
  sampleRate: number,
) {
  if (channels.length === 0) throw new Error('音频没有可编码声道。')
  const frameCount = Math.min(...channels.map(({ length }) => length))
  const channelCount = channels.length
  const dataLength = frameCount * channelCount * 2
  const bytes = new Uint8Array(44 + dataLength)
  const view = new DataView(bytes.buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channelCount * 2, true)
  view.setUint16(32, channelCount * 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataLength, true)
  let offset = 44
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return bytes
}

export function wavDurationSeconds(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const byteRate = view.getUint32(28, true)
  const dataLength = view.getUint32(40, true)
  return dataLength / byteRate
}

export async function extractAudioToWav(
  sourceUrl: string,
  options?: Partial<AudioSliceOptions>,
  signal?: AbortSignal,
): Promise<ProcessedMedia & { waveform: number[] }> {
  signal?.throwIfAborted()
  const response = await fetch(sourceUrl, { signal })
  if (!response.ok) throw new Error(`无法读取媒体音轨（${response.status}）。`)
  const AudioContextConstructor = window.AudioContext
  if (!AudioContextConstructor) throw new Error('当前浏览器不支持 AudioContext 音轨解码。')
  const context = new AudioContextConstructor()
  try {
    const buffer = await context.decodeAudioData(await response.arrayBuffer())
    signal?.throwIfAborted()
    const channels = Array.from(
      { length: buffer.numberOfChannels },
      (_, index) => buffer.getChannelData(index),
    )
    const startSeconds = options?.startSeconds ?? 0
    const endSeconds = options?.endSeconds ?? buffer.duration
    const playbackRate = options?.playbackRate ?? 1
    const selection = {
      startSeconds,
      endSeconds,
      playbackRate,
      ...options,
    }
    audioProcessingPlan(channels, buffer.sampleRate, selection)
    let processed = sliceAndResampleChannels(channels, buffer.sampleRate, selection)
    if (options?.fadeInSeconds || options?.fadeOutSeconds || options?.normalize) {
      processed = await renderAudioEffects(processed, buffer.sampleRate, options, signal)
    }
    signal?.throwIfAborted()
    const wav = encodePcm16Wav(processed, buffer.sampleRate)
    const waveform = waveformPeaks(processed[0], 64)
    return {
      dataUrl: await blobToDataUrl(new Blob([wav], { type: 'audio/wav' })),
      mimeType: 'audio/wav',
      durationSeconds: wavDurationSeconds(wav),
      sampleRate: buffer.sampleRate,
      audioChannels: processed.length,
      waveform,
    }
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error('无法解码媒体音轨。')
  } finally {
    await context.close()
  }
}

export function waveformPeaks(samples: Float32Array, count: number) {
  const safeCount = Math.max(1, Math.floor(count))
  return Array.from({ length: safeCount }, (_, index) => {
    const start = Math.floor((samples.length * index) / safeCount)
    const end = Math.max(start + 1, Math.floor((samples.length * (index + 1)) / safeCount))
    let peak = 0
    for (let cursor = start; cursor < Math.min(samples.length, end); cursor += 1) {
      peak = Math.max(peak, Math.abs(samples[cursor]))
    }
    return peak
  })
}
