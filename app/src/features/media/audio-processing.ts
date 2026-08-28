import type { AudioSliceOptions } from './browser-media-processing'
import { generationErrorMessage } from '../generation/generation-errors'

export function audioProcessingErrorMessage(error: unknown) {
  const fallback = '音频处理失败，请检查音频格式、网络或浏览器支持情况后重试。'
  const message = generationErrorMessage(error, fallback)
  return /[\u3400-\u9fff]/u.test(message) ? message : fallback
}

export interface AudioEffectOptions {
  fadeInSeconds?: number
  fadeOutSeconds?: number
  normalize?: boolean
}

export function audioProcessingPlan(channels: readonly Float32Array[], sampleRate: number, options: AudioSliceOptions) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !channels.length || !channels[0].length || channels.some(c => c.length !== channels[0].length)) throw new Error('音频采样率或声道数据无效。')
  const { startSeconds, endSeconds, playbackRate } = options
  const fades = [options.fadeInSeconds ?? 0, options.fadeOutSeconds ?? 0]
  if (![startSeconds, endSeconds, playbackRate, ...fades].every(Number.isFinite) || startSeconds < 0 || endSeconds <= startSeconds || playbackRate < 0.5 || playbackRate > 2 || fades.some(value => value < 0)) throw new Error('音频选区、倍速或淡入淡出参数无效。')
  const end = Math.min(endSeconds, channels[0].length / sampleRate)
  if (startSeconds >= end) throw new Error('音频入点必须早于真实音频结束时间。')
  const durationSeconds = (end - startSeconds) / playbackRate
  const fadeScale = Math.min(1, durationSeconds / (fades[0] + fades[1] || 1))
  const fadeIn = fades[0] * fadeScale
  const fadeOut = fades[1] * fadeScale
  const lastSampleTime = Math.max(0, durationSeconds - 1 / sampleRate)
  const fadeInEnd = Math.min(fadeIn, lastSampleTime)
  const fadeOutStart = Math.min(durationSeconds - fadeOut, lastSampleTime)
  let peak = 0
  for (const channel of channels) {
    for (let i = Math.floor(startSeconds * sampleRate); i < Math.ceil(end * sampleRate); i++) {
      if (!Number.isFinite(channel[i])) throw new Error('音频包含无效采样。')
      const time = (i / sampleRate - startSeconds) / playbackRate
      const fadeInGain = fadeIn && time < fadeInEnd ? Math.max(0, time / fadeInEnd) : 1
      const fadeOutGain = fadeOut && time >= fadeOutStart
        ? Math.max(0, (lastSampleTime - time) / (lastSampleTime - fadeOutStart || 1)) : 1
      peak = Math.max(peak, Math.abs(channel[i]) * Math.min(fadeInGain, fadeOutGain))
    }
  }
  // Normalize the audible (already faded) signal, not removed boundary peaks.
  // One gain for all channels preserves the stereo balance. Silence stays silent.
  const gain = options.normalize && peak > 1e-8 ? 10 ** (-1 / 20) / peak : 1
  const envelope = [{ time: 0, value: fadeIn ? 0 : gain }]
  if (fadeIn) envelope.push({ time: fadeIn, value: gain })
  if (fadeOut) envelope.push({ time: durationSeconds - fadeOut, value: gain }, { time: durationSeconds, value: 0 })
  return { durationSeconds, gain, envelope }
}

/** Render gain automation offline. No speakers, network or project mutation. */
export async function renderAudioEffects(channels: readonly Float32Array[], sampleRate: number, options: AudioEffectOptions, signal?: AbortSignal): Promise<Float32Array<ArrayBuffer>[]> {
  signal?.throwIfAborted()
  const plan = audioProcessingPlan(channels, sampleRate, { startSeconds: 0, endSeconds: channels[0]?.length / sampleRate, playbackRate: 1, ...options })
  if (!window.OfflineAudioContext) throw new Error('当前浏览器不支持离线音频渲染，请使用支持 Web Audio 的浏览器。')
  const context = new OfflineAudioContext(channels.length, channels[0].length, sampleRate)
  const buffer = context.createBuffer(channels.length, channels[0].length, sampleRate)
  channels.forEach((channel, index) => buffer.copyToChannel(new Float32Array(channel), index))
  const source = context.createBufferSource()
  source.buffer = buffer
  const gain = context.createGain()
  source.connect(gain)
  gain.connect(context.destination)
  plan.envelope.forEach((point, index) => {
    const time = Math.min(point.time, (channels[0].length - 1) / sampleRate)
    if (!index) gain.gain.setValueAtTime(point.value, time)
    else gain.gain.linearRampToValueAtTime(point.value, time)
  })
  source.start(0)
  const rendered = await context.startRendering()
  // Offline rendering cannot be aborted in all browsers; discard cancelled results.
  signal?.throwIfAborted()
  return Array.from({ length: rendered.numberOfChannels }, (_, index) => new Float32Array(rendered.getChannelData(index)))
}
