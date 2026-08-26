import type { GenerationRequest } from '../generation-adapter'

export const seedreamMinLoopConfigFixture = {
  mode: 'seedream-direct-dev',
  apiKey: 'fixture-seedream-api-key',
  apiBase: 'https://fixture.seedream.invalid/api/v3',
  modelId: 'doubao-seedream-5-0-260128',
} as const

export const seedreamMinLoopGenerationRequestFixture: GenerationRequest = {
  projectId: 'fixture-project',
  nodeId: 'fixture-image-node',
  operation: 'regenerate',
  targetKind: 'image',
  providerId: 'seedream-5-pro-api',
  prompt: '雨夜街道上的电影感人像，霓虹灯倒映在湿润路面',
  parameters: {
    aspectRatio: '16:9',
    resolution: '2K',
    count: 1,
    watermark: false,
  },
  referenceAssets: [],
}

export const seedreamMinLoopCreateRequestFixture = {
  model: 'doubao-seedream-5-0-260128',
  prompt: '雨夜街道上的电影感人像，霓虹灯倒映在湿润路面',
  size: '2560x1440',
  sequential_image_generation: 'disabled',
  stream: false,
  response_format: 'url',
  output_format: 'png',
  watermark: false,
} as const

export const seedreamMinLoopSuccessFixture = {
  model: 'doubao-seedream-5-0-260128',
  created: 1_766_000_000,
  data: [
    {
      url: 'https://media.fixture.invalid/seedream-result.png',
      size: '2560x1440',
    },
  ],
  usage: {
    generated_images: 1,
    output_tokens: 4_096,
    total_tokens: 4_096,
  },
} as const

export const seedreamMinLoopImageToImageRequestFixture: GenerationRequest = {
  ...seedreamMinLoopGenerationRequestFixture,
  prompt: '保持人物身份不变，将背景改成雪夜',
  referenceAssets: [
    {
      url: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
      kind: 'image',
      mimeType: 'image/png',
    },
  ],
}

export const seedreamMinLoopUnauthorizedFixture = {
  status: 401,
  body: { error: { code: 'AuthenticationError', message: 'fixture unauthorized' } },
} as const

export const seedreamMinLoopForbiddenFixture = {
  status: 403,
  body: { error: { code: 'AccessDenied', message: 'fixture forbidden' } },
} as const

export const seedreamMinLoopRateLimitedFixture = {
  status: 429,
  body: { error: { code: 'QuotaExceeded', message: 'fixture rate limited' } },
} as const

export const seedreamMinLoopSensitivePromptFixture = {
  status: 400,
  body: {
    error: {
      code: 'InputTextSensitiveContentDetected',
      message: 'fixture sensitive prompt',
    },
  },
} as const

export const seedreamMinLoopEmptyResultFixture = {
  ...seedreamMinLoopSuccessFixture,
  data: [],
} as const

export const seedreamMinLoopInvalidUrlFixture = {
  ...seedreamMinLoopSuccessFixture,
  data: [{ url: 'javascript:alert(1)', size: '2560x1440' }],
} as const
