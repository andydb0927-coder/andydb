import type { GenerationRequest } from '../generation-adapter'

export const klingMinLoopConfigFixture = {
  mode: 'kling-direct-dev',
  accessKey: 'fixture-access-key',
  secretKey: 'fixture-secret-key',
  apiBase: 'https://fixture.kling.invalid',
  modelId: 'fixture-kling-text-to-video',
} as const

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
  },
  referenceAssets: [],
}

export const klingMinLoopCreateRequestFixture = {
  model_name: 'fixture-kling-text-to-video',
  prompt: '雨夜街道，摄影机缓慢向前推进',
  aspect_ratio: '16:9',
  duration: '5',
} as const

export const klingMinLoopCreateSuccessFixture = {
  code: 0,
  message: 'SUCCEED',
  request_id: 'fixture-create-request',
  data: {
    task_id: 'fixture-kling-task',
    task_status: 'submitted',
  },
} as const

export const klingMinLoopProcessingFixture = {
  code: 0,
  message: 'SUCCEED',
  request_id: 'fixture-status-processing',
  data: {
    task_id: 'fixture-kling-task',
    task_status: 'processing',
    task_result: { videos: [] },
  },
} as const

export const klingMinLoopSuccessFixture = {
  code: 0,
  message: 'SUCCEED',
  request_id: 'fixture-status-success',
  data: {
    task_id: 'fixture-kling-task',
    task_status: 'succeed',
    task_result: {
      videos: [
        {
          id: 'fixture-video-result',
          url: 'https://media.fixture.invalid/kling-result.mp4',
          duration: '5',
        },
      ],
    },
  },
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
  data: {
    task_id: 'fixture-kling-task',
    task_status: 'failed',
    task_status_msg: 'fixture content rejected',
  },
} as const

export const klingMinLoopTimeoutFixture = {
  ...klingMinLoopProcessingFixture,
  request_id: 'fixture-status-timeout',
} as const

export const klingMinLoopInvalidUrlFixture = {
  ...klingMinLoopSuccessFixture,
  request_id: 'fixture-status-invalid-url',
  data: {
    ...klingMinLoopSuccessFixture.data,
    task_result: {
      videos: [
        {
          id: 'fixture-invalid-video-result',
          url: 'javascript:alert(1)',
          duration: '5',
        },
      ],
    },
  },
} as const
