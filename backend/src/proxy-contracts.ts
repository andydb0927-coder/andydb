import type { WorkerBindings } from './bindings'

export interface UpstreamRequest {
  url: string
  init: RequestInit
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function text(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized && normalized.length <= maxLength ? normalized : undefined
}

function numberInRange(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined
}

function normalizedBaseUrl(value: string | undefined, fallback: string) {
  return (value?.trim() || fallback).replace(/\/+$/gu, '')
}

function arkHeaders(env: WorkerBindings) {
  return {
    Authorization: `Bearer ${env.ARK_API_KEY}`,
    'Content-Type': 'application/json',
  }
}

function validHttpsUrls(value: unknown, maxItems: number) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > maxItems) return undefined
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') return undefined
    try {
      const url = new URL(item)
      if (url.protocol !== 'https:') return undefined
      result.push(url.toString())
    } catch {
      return undefined
    }
  }
  return result
}

export function imageUpstreamRequest(value: unknown, env: WorkerBindings): UpstreamRequest | undefined {
  const input = record(value)
  const prompt = text(input?.prompt, 2_000)
  const size = text(input?.size, 16)
  const sizeMatch = size ? /^(\d{3,4})x(\d{3,4})$/u.exec(size) : undefined
  const width = Number(sizeMatch?.[1])
  const height = Number(sizeMatch?.[2])
  const references = validHttpsUrls(input?.referenceImages, 10)
  if (
    !prompt || !sizeMatch || !references ||
    width < 512 || width > 4_096 || height < 512 || height > 4_096 ||
    width * height < 921_600 || width * height > 4_624_220
  ) return undefined
  const body = {
    model: env.SEEDREAM_MODEL_ID,
    prompt,
    ...(references.length ? { image: references } : {}),
    size,
    response_format: 'url',
    output_format: 'png',
    watermark: false,
  }
  return {
    url: `${normalizedBaseUrl(env.ARK_API_BASE, 'https://ark.cn-beijing.volces.com/api/v3')}/images/generations`,
    init: { method: 'POST', headers: arkHeaders(env), body: JSON.stringify(body) },
  }
}

const videoRatios = new Set(['Auto', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'])
const videoResolutions = new Set(['480p', '720p', '1080p', '4k'])

export function videoUpstreamRequest(value: unknown, env: WorkerBindings): UpstreamRequest | undefined {
  const input = record(value)
  const prompt = text(input?.prompt, 2_000)
  const duration = numberInRange(input?.duration, 4, 15)
  const aspectRatio = text(input?.aspectRatio, 8)
  const resolution = text(input?.resolution, 8)?.toLowerCase()
  const references = validHttpsUrls(input?.referenceImages, 2)
  if (
    !prompt || !duration || !Number.isInteger(duration) || !aspectRatio ||
    !videoRatios.has(aspectRatio) || !resolution || !videoResolutions.has(resolution) ||
    typeof input?.sound !== 'boolean' || !references
  ) return undefined
  const content = [
    { type: 'text', text: prompt },
    ...references.map((url) => ({ type: 'image_url', image_url: { url }, role: 'first_frame' })),
  ]
  const body = {
    model: env.SEEDANCE_MODEL_ID,
    content,
    duration,
    ratio: aspectRatio,
    resolution,
    generate_audio: input.sound,
    watermark: false,
  }
  return {
    url: `${normalizedBaseUrl(env.ARK_API_BASE, 'https://ark.cn-beijing.volces.com/api/v3')}/contents/generations/tasks`,
    init: { method: 'POST', headers: arkHeaders(env), body: JSON.stringify(body) },
  }
}

export function videoTaskUpstreamRequest(taskId: string, env: WorkerBindings): UpstreamRequest | undefined {
  const normalizedTaskId = taskId.trim()
  if (!/^[A-Za-z0-9._:-]{4,128}$/u.test(normalizedTaskId)) return undefined
  return {
    url: `${normalizedBaseUrl(env.ARK_API_BASE, 'https://ark.cn-beijing.volces.com/api/v3')}/contents/generations/tasks/${encodeURIComponent(normalizedTaskId)}`,
    init: { method: 'GET', headers: arkHeaders(env) },
  }
}

export function textUpstreamRequest(value: unknown, env: WorkerBindings): UpstreamRequest | undefined {
  const input = record(value)
  const prompt = text(input?.prompt, 8_000)
  const system = input?.system === undefined ? undefined : text(input.system, 2_000)
  const maxTokens = input?.maxTokens === undefined ? 1_200 : numberInRange(input.maxTokens, 1, 4_096)
  const temperature = input?.temperature === undefined ? 0.7 : numberInRange(input.temperature, 0, 2)
  if (!prompt || (input?.system !== undefined && !system) || !maxTokens || temperature === undefined) {
    return undefined
  }
  const body = {
    model: env.ARK_TEXT_MODEL_ID,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ],
    max_tokens: Math.round(maxTokens),
    temperature,
    stream: false,
  }
  return {
    url: `${normalizedBaseUrl(env.ARK_API_BASE, 'https://ark.cn-beijing.volces.com/api/v3')}/chat/completions`,
    init: { method: 'POST', headers: arkHeaders(env), body: JSON.stringify(body) },
  }
}

const audioFormats = new Set(['mp3', 'wav', 'pcm', 'ogg_opus'])
const sampleRates = new Set([8_000, 16_000, 22_050, 24_000, 32_000, 40_000, 44_100, 48_000])

function speechRate(value: number) {
  return Math.round((value - 1) * 100)
}

function loudnessRate(value: number) {
  const normalized = value / 50
  return Math.round(normalized <= 1 ? (normalized - 1) * 50 : (normalized - 1) * 100)
}

export function ttsUpstreamRequest(value: unknown, env: WorkerBindings): UpstreamRequest | undefined {
  const input = record(value)
  const speechText = text(input?.text, 5_000)
  const voice = text(input?.voice, 128)
  const speed = numberInRange(input?.speed, 0.5, 2)
  const volume = numberInRange(input?.volume, 0, 100)
  const pitch = numberInRange(input?.pitch, -12, 12)
  const sampleRate = input?.sampleRate
  const format = text(input?.format, 16)
  if (
    !speechText || !voice || speed === undefined || volume === undefined ||
    pitch === undefined || typeof sampleRate !== 'number' || !sampleRates.has(sampleRate) ||
    !format || !audioFormats.has(format)
  ) return undefined
  const body = {
    req_params: {
      text: speechText,
      speaker: voice,
      ...(pitch === 0 ? {} : {
        additions: JSON.stringify({ post_process: { pitch: Math.round(pitch) } }),
      }),
      audio_params: {
        format,
        sample_rate: sampleRate,
        speech_rate: speechRate(speed),
        loudness_rate: loudnessRate(volume),
      },
    },
  }
  return {
    url: `${normalizedBaseUrl(env.OPENSPEECH_API_BASE, 'https://openspeech.bytedance.com/api/v3')}/tts/unidirectional`,
    init: {
      method: 'POST',
      headers: {
        'X-Api-Key': env.OPENSPEECH_API_KEY,
        'X-Api-Resource-Id': env.OPENSPEECH_RESOURCE_ID ?? 'seed-tts-2.0',
        'X-Api-Request-Id': crypto.randomUUID(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  }
}
