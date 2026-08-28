import { expect, test, vi } from 'vitest'
import { createArkTtsProvider } from './ark-tts-provider'
import { createArkAudioGenProvider } from './ark-audio-gen-provider'
import { officialAudioVoices, resolveAudioVoiceId } from './audio-voice-catalog'
import { arkAudioConfigFixture, arkTtsGenerationRequestFixture, arkTtsSuccessFixture, arkAudioSuccessFixture } from './fixtures/ark-audio.fixture'
import { encodePcm16Wav } from '../media/browser-media-processing'
import { audioOutputSettings } from './audio-output-settings'

test('output controls follow the manifest and restrict Opus and MP3 sampling rates', () => {
  const provider = createArkAudioGenProvider({ mode: 'mock' })
  expect(audioOutputSettings(provider, 'ogg_opus', 24000)).toMatchObject({ format: 'ogg_opus', sampleRate: 48000, sampleRates: [48000] })
  expect(audioOutputSettings(provider, 'mp3', 40000)).toMatchObject({ sampleRate: 44100 })
  expect(audioOutputSettings(provider, 'mp3', 40000).sampleRates).not.toContain(40000)
  expect(audioOutputSettings(provider, 'wav', 40000)).toMatchObject({ sampleRate: 40000 })
})

test('catalog uses verified official IDs and preserves all four legacy aliases', () => {
  expect(officialAudioVoices.map(v => [v.name, v.id])).toEqual([
    ['Vivi 2.0', 'zh_female_vv_uranus_bigtts'],
    ['云舟 2.0', 'zh_male_m191_uranus_bigtts'],
    ['少年梓辛 2.0', 'zh_male_shaonianzixin_uranus_bigtts'],
    ['解说小明 2.0', 'zh_male_jieshuoxiaoming_uranus_bigtts'],
  ])
  officialAudioVoices.forEach(v => {
    expect(resolveAudioVoiceId(v.id)).toBe(v.id)
    expect(resolveAudioVoiceId(v.legacyLabel)).toBe(v.id)
  })
  expect(() => resolveAudioVoiceId('unknown-voice')).toThrow('音色')
})

test.each([-12, 4, 12])('TTS forwards official voice and pitch %i through additions JSON', async pitch => {
  const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(arkTtsSuccessFixture))
  const provider = createArkTtsProvider({ ...arkAudioConfigFixture, fetchFn })
  await provider.generate({ ...arkTtsGenerationRequestFixture, parameters: { voice: officialAudioVoices[1].id, speed: 1.2, volume: 75, pitch } }, { signal: new AbortController().signal })
  const body = JSON.parse(String(fetchFn.mock.calls[0][1]?.body))
  expect(body.req_params.speaker).toBe(officialAudioVoices[1].id)
  expect(body.req_params.audio_params).toMatchObject({ speech_rate: 20, loudness_rate: 50 })
  expect(JSON.parse(body.req_params.additions)).toEqual({ post_process: { pitch } })
  expect(provider.parameterSchema.pitch).toMatchObject({ min: -12, max: 12, defaultValue: 0 })
})

test('audio generation uses pitch_rate and reports output sampling metadata', async () => {
  const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(Response.json(arkAudioSuccessFixture))
  const provider = createArkAudioGenProvider({ ...arkAudioConfigFixture, fetchFn })
  const result = await provider.generate({ ...arkTtsGenerationRequestFixture, providerId: 'ark-audio-gen', parameters: { pitch: -3, sampleRate: 32000, format: 'mp3' } }, { signal: new AbortController().signal })
  expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body)).audio_config).toMatchObject({ pitch_rate: -3, sample_rate: 32000 })
  expect(result.asset).toMatchObject({ sampleRate: 32000, durationSeconds: 11.8, mimeType: 'audio/mpeg' })
})

test('WAV result metadata uses returned bytes rather than requested duration/sample rate', async () => {
  const bytes = encodePcm16Wav([new Float32Array(16000)], 16000)
  const base64 = Buffer.from(bytes).toString('base64')
  const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 0, data: base64 }))
  const result = await createArkTtsProvider({ ...arkAudioConfigFixture, fetchFn }).generate({ ...arkTtsGenerationRequestFixture, parameters: { duration: 99, sampleRate: 24000, format: 'wav' } }, { signal: new AbortController().signal })
  expect(result.asset).toMatchObject({ durationSeconds: 1, sampleRate: 16000, audioChannels: 1 })
  expect(result.persistence).toBe('project')
})
