import type { GenerationRequest } from '../generation-adapter'

export const seedanceVideoConfigFixture = {
  mode: 'seedream-direct-dev',
  apiKey: 'fixture-ark-api-key',
  apiBase: 'https://fixture.ark.invalid/api/v3',
  modelId: 'doubao-seedance-2-0-260128',
} as const

export const seedanceVideoTaskIdFixture = 'cgt-fixture-seedance-task'

export const seedanceVideoGenerationRequestFixture: GenerationRequest = {
  projectId: 'fixture-project',
  nodeId: 'fixture-video-node',
  operation: 'generate-video',
  targetKind: 'video',
  providerId: 'seedance-api',
  prompt: '雨夜霓虹街道，摄影机缓慢向前推进',
  parameters: {
    generationMode: '图生视频',
    aspectRatio: '9:16',
    duration: '8',
    quality: '1080P',
    sound: true,
    watermark: false,
  },
  referenceAssets: [{
    kind: 'image',
    url: 'https://media.fixture.invalid/first-frame.png',
    mimeType: 'image/png',
  }],
}

export const seedanceVideoCreateRequestFixture = {
  model: 'doubao-seedance-2-0-260128',
  content: [
    {
      type: 'text',
      text: seedanceVideoGenerationRequestFixture.prompt,
    },
    {
      type: 'image_url',
      image_url: { url: 'https://media.fixture.invalid/first-frame.png' },
      role: 'first_frame',
    },
  ],
  duration: 8,
  ratio: '9:16',
  resolution: '1080p',
  generate_audio: true,
  watermark: false,
} as const

export const seedanceVideoCreateSuccessFixture = {
  id: seedanceVideoTaskIdFixture,
} as const

export const seedanceVideoRunningFixture = {
  id: seedanceVideoTaskIdFixture,
  model: 'doubao-seedance-2-0-260128',
  status: 'running',
  content: {},
} as const

export const seedanceVideoSuccessFixture = {
  id: seedanceVideoTaskIdFixture,
  model: 'doubao-seedance-2-0-260128',
  status: 'succeeded',
  content: {
    video_url: 'https://media.fixture.invalid/seedance-result.mp4',
  },
  duration: 8,
  ratio: '9:16',
  resolution: '1080p',
  generate_audio: true,
  usage: {
    completion_tokens: 108_000,
  },
} as const

export const seedanceVideoUnauthorizedFixture = {
  status: 401,
  body: { error: { code: 'Unauthorized', message: 'fixture secret' } },
} as const

export const seedanceVideoForbiddenFixture = {
  status: 403,
  body: { error: { code: 'Forbidden', message: 'fixture secret' } },
} as const

export const seedanceVideoRateLimitedFixture = {
  status: 429,
  body: { error: { code: 'RateLimitExceeded', message: 'fixture secret' } },
} as const

export const seedanceVideoFailedFixture = {
  id: seedanceVideoTaskIdFixture,
  status: 'failed',
  error: {
    code: 'ContentPolicyViolation',
    message: 'fixture content rejected',
  },
} as const

export const seedanceVideoCancelledFixture = {
  id: seedanceVideoTaskIdFixture,
  status: 'cancelled',
} as const

export const seedanceVideoInvalidUrlFixture = {
  ...seedanceVideoSuccessFixture,
  content: { video_url: 'javascript:alert(1)' },
} as const

export const seedanceVideoTimeoutFixture = seedanceVideoRunningFixture
