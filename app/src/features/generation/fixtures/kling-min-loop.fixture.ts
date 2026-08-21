import type { GenerationRequest } from '../generation-adapter'

export const klingMinLoopConfigFixture = {
  mode: 'kling-direct-dev',
  apiKey: 'fixture-api-key',
  apiBase: 'https://fixture.kling.invalid',
  modelId: 'kling-2.6',
} as const

export const klingMinLoopRequestIdFixture = 'fixture-request-id'

export const klingMinLoopGenerationRequestFixture: GenerationRequest = {
  projectId: 'fixture-project',
  nodeId: 'fixture-video-node',
  operation: 'regenerate',
  targetKind: 'video',
  providerId: 'kling-api',
  prompt: '雨夜街道，摄影机缓慢向前推进',
  parameters: {
    aspectRatio: '16:9',
    duration: '5',
    resolution: '1080P',
    sound: true,
    watermark: false,
  },
  referenceAssets: [],
}

export const klingMinLoopCreateRequestFixture = {
  prompt: '雨夜街道，摄影机缓慢向前推进',
  settings: {
    audio: 'native',
    resolution: '1080p',
    aspect_ratio: '16:9',
    duration: 5,
  },
  options: {
    external_task_id: klingMinLoopRequestIdFixture,
    watermark_info: { enabled: false },
  },
} as const

export const klingMinLoopCreateSuccessFixture = {
  code: 0,
  message: 'SUCCEED',
  request_id: 'fixture-create-request',
  data: {
    id: 'fixture-kling-task',
    status: 'submitted',
  },
} as const

export const klingMinLoopProcessingFixture = {
  code: 0,
  message: 'SUCCEED',
  request_id: 'fixture-status-processing',
  data: [{
    id: 'fixture-kling-task',
    external_task_id: klingMinLoopRequestIdFixture,
    status: 'processing',
    outputs: [],
  }],
} as const

export const klingMinLoopSuccessFixture = {
  code: 0,
  message: 'SUCCEED',
  request_id: 'fixture-status-success',
  data: [{
    id: 'fixture-kling-task',
    external_task_id: klingMinLoopRequestIdFixture,
    status: 'succeeded',
    outputs: [
      {
        type: 'image',
        url: 'https://media.fixture.invalid/ignored-poster.jpg',
      },
      {
        type: 'video',
        url: 'https://media.fixture.invalid/kling-result.mp4',
        duration: 5,
      },
    ],
  }],
} as const

export const klingMinLoopUnauthorizedFixture = {
  status: 401,
  body: { code: 401, message: 'fixture unauthorized' },
} as const

export const klingMinLoopForbiddenFixture = {
  status: 403,
  body: { code: 403, message: 'fixture forbidden' },
} as const

export const klingMinLoopRateLimitedFixture = {
  status: 429,
  body: { code: 429, message: 'fixture rate limited' },
  headers: { 'Retry-After': '1' },
} as const

export const klingMinLoopFailedFixture = {
  code: 0,
  message: 'SUCCEED',
  request_id: 'fixture-status-failed',
  data: [{
    id: 'fixture-kling-task',
    external_task_id: klingMinLoopRequestIdFixture,
    status: 'failed',
    message: 'fixture content rejected',
    outputs: [],
  }],
} as const

export const klingMinLoopTimeoutFixture = {
  ...klingMinLoopProcessingFixture,
  request_id: 'fixture-status-timeout',
} as const

export const klingMinLoopInvalidUrlFixture = {
  ...klingMinLoopSuccessFixture,
  request_id: 'fixture-status-invalid-url',
  data: [{
    ...klingMinLoopSuccessFixture.data[0],
    outputs: [{
      type: 'video',
      url: 'javascript:alert(1)',
      duration: 5,
    }],
  }],
} as const
