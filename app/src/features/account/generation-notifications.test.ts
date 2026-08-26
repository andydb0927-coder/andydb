import { describe, expect, test } from 'vitest'

import type { GenerationJob } from '../project/model'
import { deriveGenerationNotifications } from './generation-notifications'

const jobs: GenerationJob[] = [
  {
    id: 'job-running',
    nodeId: 'video-1',
    status: 'running',
    prompt: '云海日出',
    providerName: '火山方舟',
    modelName: 'Seedance 2.0',
    progress: 40,
    createdAt: '2026-08-27T08:00:00.000Z',
    updatedAt: '2026-08-27T08:02:00.000Z',
  },
  {
    id: 'job-failed',
    nodeId: 'image-1',
    status: 'failed',
    prompt: '雨夜古桥',
    error: '请求超时',
    createdAt: '2026-08-27T07:00:00.000Z',
    updatedAt: '2026-08-27T07:01:00.000Z',
  },
]

describe('generation notifications', () => {
  test('derives ordered notifications from current generation job states', () => {
    const notifications = deriveGenerationNotifications(jobs)

    expect(notifications.map(({ id }) => id)).toEqual([
      'generation:job-running:running',
      'generation:job-failed:failed',
    ])
    expect(notifications[0]).toMatchObject({
      title: '视频生成中 · 40%',
      detail: '火山方舟 · Seedance 2.0',
    })
    expect(notifications[1]).toMatchObject({
      title: '图片生成失败',
      detail: '请求超时',
    })
  })
})
