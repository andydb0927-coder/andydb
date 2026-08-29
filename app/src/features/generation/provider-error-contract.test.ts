import { expect, test, vi } from 'vitest'

import type { GenerationRequest } from './generation-adapter'
import { createSeedreamLiveProvider } from './seedream-live-provider'
import { createSeedanceVideoProvider } from './seedance-video-provider'
import { createArkTextLlmProvider } from './ark-text-llm-provider'
import { createArkTtsProvider } from './ark-tts-provider'
import { createArkAudioGenProvider } from './ark-audio-gen-provider'
import { seedanceVideoCreateSuccessFixture, seedanceVideoSuccessFixture } from './fixtures/seedance-video.fixture'

const configuration = {
  mode: 'seedream-direct-dev',
  apiKey: 'fixture-only-key',
  apiBase: 'https://fixture.invalid/api/v3',
  modelId: 'doubao-seedance-2-0-260128',
}
const request: GenerationRequest = {
  projectId: 'fixture-project', nodeId: 'fixture-node', operation: 'regenerate',
  targetKind: 'image', prompt: '清晨的桥', referenceAssets: [],
}

test.each([
  ['Seedream', createSeedreamLiveProvider, 'image'],
  ['Seedance', createSeedanceVideoProvider, 'video'],
  ['豆包文本', createArkTextLlmProvider, 'text'],
  ['豆包TTS', createArkTtsProvider, 'audio'],
  ['豆包音频', createArkAudioGenProvider, 'audio'],
] as const)('%s在真实Provider调用点转换网络错误，不泄露凭据', async (_label, createProvider, targetKind) => {
  const cause = new TypeError('Authorization: Bearer fixture-private-key')
  const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(cause)
  const provider = createProvider({ ...configuration, fetchFn })
  const pending = provider.generate({ ...request, targetKind }, { signal: new AbortController().signal })
  await expect(pending).rejects.toMatchObject({ cause })
  await expect(pending).rejects.toThrow('网络异常')
  await expect(pending).rejects.not.toThrow('fixture-private-key')
  expect(fetchFn).toHaveBeenCalledTimes(1)
})

test('Seedance的pending别名继续轮询，成功只回填一次', async () => {
  const fetchFn = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(seedanceVideoCreateSuccessFixture))
    .mockResolvedValueOnce(Response.json({ status: 'pending' }))
    .mockResolvedValueOnce(Response.json(seedanceVideoSuccessFixture))
  const progress = vi.fn<(value: number) => void>()
  const result = await createSeedanceVideoProvider({ ...configuration, fetchFn, pollIntervalMs: 0 })
    .generate({ ...request, targetKind: 'video' }, { signal: new AbortController().signal, onProgress: progress })
  expect(result.asset.url).toBe(seedanceVideoSuccessFixture.content.video_url)
  expect(fetchFn).toHaveBeenCalledTimes(3)
  expect(progress.mock.calls.map(([value]) => value)).toEqual([10, 55, 100])
})

test.each([
  ['expired', '火山方舟 Seedance 任务已超时'],
  ['cancelled', '火山方舟 Seedance 任务已取消'],
  ['unknown', '火山方舟 Seedance 任务状态响应格式异常'],
])('Seedance原始%s状态仍失败，不假回填结果', async (status, message) => {
  const fetchFn = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(seedanceVideoCreateSuccessFixture))
    .mockResolvedValueOnce(Response.json({ status }))
  await expect(createSeedanceVideoProvider({ ...configuration, fetchFn, pollIntervalMs: 0 })
    .generate({ ...request, targetKind: 'video' }, { signal: new AbortController().signal })).rejects.toThrow(message)
  expect(fetchFn).toHaveBeenCalledTimes(2)
})

test('远程失败详情也经过安全边界', async () => {
  const fetchFn = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(seedanceVideoCreateSuccessFixture))
    .mockResolvedValueOnce(Response.json({ status: 'failed', error: { message: 'Authorization: Bearer fixture-private-key' } }))
  await expect(createSeedanceVideoProvider({ ...configuration, fetchFn, pollIntervalMs: 0 })
    .generate({ ...request, targetKind: 'video' }, { signal: new AbortController().signal })).rejects.toThrow('火山方舟 Seedance 生成失败：任务未完成')
})
