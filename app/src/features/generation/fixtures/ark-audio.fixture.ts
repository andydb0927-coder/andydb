import type { GenerationRequest } from '../generation-adapter'

export const arkAudioConfigFixture = {
  mode: 'seedream-direct-dev',
  apiKey: 'fixture-speech-api-key',
  apiBase: 'https://fixture.speech.invalid/api/v3',
  ttsModelId: 'seed-tts-2.0',
  audioModelId: 'seed-audio-1.0',
} as const

export const arkTtsGenerationRequestFixture: GenerationRequest = {
  projectId: 'fixture-project',
  nodeId: 'fixture-audio-node',
  operation: 'regenerate',
  targetKind: 'audio',
  providerId: 'ark-tts',
  prompt: '清晨的古桥被薄雾包围。',
  parameters: {
    voice: '温暖女声',
    speed: 1.2,
    volume: 75,
    sampleRate: 24000,
    format: 'mp3',
  },
  referenceAssets: [],
}

export const arkTtsCreateRequestFixture = {
  req_params: {
    text: '清晨的古桥被薄雾包围。',
    speaker: 'zh_female_vv_uranus_bigtts',
    audio_params: {
      format: 'mp3',
      sample_rate: 24000,
      speech_rate: 20,
      loudness_rate: 50,
    },
  },
} as const

export const arkTtsSuccessFixture = [
  JSON.stringify({
    code: 0,
    message: 'OK',
    data: 'SUQz',
    usage: { text_words: 6 },
  }),
  JSON.stringify({ code: 0, message: 'OK', data: 'BAUG' }),
].join('\n')

export const arkAudioGenerationRequestFixture: GenerationRequest = {
  projectId: 'fixture-project',
  nodeId: 'fixture-audio-node',
  operation: 'regenerate',
  targetKind: 'audio',
  providerId: 'ark-audio-gen',
  prompt: '雨夜石板路环境音，远处有低沉钟声',
  parameters: {
    duration: 12,
    speed: 1,
    volume: 50,
    sampleRate: 44100,
    format: 'mp3',
  },
  referenceAssets: [],
}

export const arkAudioCreateRequestFixture = {
  model: 'seed-audio-1.0',
  text_prompt: '生成约 12 秒音频。雨夜石板路环境音，远处有低沉钟声',
  references: [{ speaker: 'zh_female_vv_uranus_bigtts' }],
  audio_config: {
    format: 'mp3',
    sample_rate: 44100,
    speech_rate: 0,
    loudness_rate: 0,
    pitch_rate: 0,
    enable_subtitle: false,
  },
  watermark: {},
} as const

export const arkAudioSuccessFixture = {
  audio: 'SUQzBAUG',
  url: 'https://media.fixture.invalid/audio-result.mp3',
  duration: 11.8,
  original_duration: 12,
} as const

export const arkAudioErrorFixtures = {
  unauthorized: { status: 401, body: { code: 401, message: 'fixture secret' } },
  forbidden: { status: 403, body: { code: 403, message: 'fixture secret' } },
  rateLimited: { status: 429, body: { code: 429, message: 'fixture secret' } },
  failed: { status: 500, body: { code: 500, message: 'fixture secret' } },
  malformedTts: { status: 200, body: '{"code":0,"message":"OK"}\n' },
  malformedAudio: { status: 200, body: { duration: 4 } },
} as const
