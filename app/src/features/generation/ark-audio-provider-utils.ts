import type { GenerationRequest } from './generation-adapter'

const officialSpeechApiBase = 'https://openspeech.bytedance.com/api/v3'

export const officialVoiceIdByLabel = {
  '温暖女声': 'zh_female_vv_uranus_bigtts',
  '沉稳男声': 'zh_male_m191_uranus_bigtts',
  '清亮少年': 'zh_male_shaonianzixin_uranus_bigtts',
  '纪录片旁白': 'zh_male_jieshuoxiaoming_uranus_bigtts',
} as const

export type OfficialVoiceLabel = keyof typeof officialVoiceIdByLabel

export function envValue(name: string) {
  const env = import.meta.env as Record<string, string | undefined>
  const value = env[name]
  return typeof value === 'string' ? value.trim() : ''
}

export function audioDevelopmentModeEnabled(mode: string) {
  const values = new Set(mode.split(',').map((value) => value.trim()))
  return values.has('seedream-direct-dev') || values.has('ark-audio-dev')
}

export function resolveSpeechApiBase(apiBase: string) {
  const trimmed = apiBase.trim().replace(/\/+$/u, '')
  if (!trimmed) return officialSpeechApiBase
  try {
    const url = new URL(trimmed)
    if (/^ark(?:\.|$)/u.test(url.hostname)) return officialSpeechApiBase
  } catch {
    return officialSpeechApiBase
  }
  return trimmed
}

export function audioFormat(value: unknown, fallback: 'mp3' | 'wav' = 'mp3') {
  const normalized = String(value ?? '').trim()
  if (normalized === 'mp3' || normalized === 'wav' || normalized === 'pcm' || normalized === 'ogg_opus') {
    return normalized
  }
  return fallback
}

export function audioMimeType(format: ReturnType<typeof audioFormat>) {
  if (format === 'wav') return 'audio/wav'
  if (format === 'pcm') return 'audio/L16'
  if (format === 'ogg_opus') return 'audio/ogg; codecs=opus'
  return 'audio/mpeg'
}

export function numberParameter(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const candidate = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(candidate)) return fallback
  return Math.min(max, Math.max(min, candidate))
}

export function sampleRateParameter(
  value: unknown,
  format: ReturnType<typeof audioFormat>,
  fallback: number,
) {
  if (format === 'ogg_opus') return 48_000
  const allowed = new Set([8_000, 16_000, 22_050, 24_000, 32_000, 40_000, 44_100, 48_000])
  const candidate = Math.round(numberParameter(value, fallback, 8_000, 48_000))
  return allowed.has(candidate) ? candidate : fallback
}

export function providerRate(value: unknown, fallback = 1) {
  const ratio = numberParameter(value, fallback, 0.5, 2)
  return Math.round(ratio <= 1 ? (ratio - 1) * 100 : (ratio - 1) * 100)
}

export function providerVolume(value: unknown, fallback = 50) {
  const normalized = numberParameter(value, fallback, 0, 100) / 50
  return Math.round(
    normalized <= 1 ? (normalized - 1) * 50 : (normalized - 1) * 100,
  )
}

export function voiceId(value: unknown) {
  const label = String(value ?? '') as OfficialVoiceLabel
  return officialVoiceIdByLabel[label] ?? officialVoiceIdByLabel['温暖女声']
}

export function dataUrlFromBase64(
  base64: string,
  format: ReturnType<typeof audioFormat>,
) {
  if (!base64.trim()) throw new Error('音频数据为空')
  return `data:${audioMimeType(format)};base64,${base64}`
}

export function httpsAudioUrl(value: unknown) {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export function concatBase64Chunks(chunks: readonly string[]) {
  const decoded = chunks.map((chunk) => {
    const binary = atob(chunk)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  })
  const totalLength = decoded.reduce((total, bytes) => total + bytes.length, 0)
  const combined = new Uint8Array(totalLength)
  let offset = 0
  for (const bytes of decoded) {
    combined.set(bytes, offset)
    offset += bytes.length
  }
  let binary = ''
  for (let index = 0; index < combined.length; index += 1) {
    binary += String.fromCharCode(combined[index]!)
  }
  return btoa(binary)
}

export function audioDuration(request: GenerationRequest, fallback: number) {
  return numberParameter(request.parameters?.duration, fallback, 1, 120)
}
