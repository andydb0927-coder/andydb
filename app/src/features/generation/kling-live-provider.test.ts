import { describe, expect, test, vi } from 'vitest'

import {
  klingMinLoopConfigFixture,
  klingMinLoopCreateRequestFixture,
  klingMinLoopCreateSuccessFixture,
  klingMinLoopFailedFixture,
  klingMinLoopForbiddenFixture,
  klingMinLoopGenerationRequestFixture,
  klingMinLoopInvalidUrlFixture,
  klingMinLoopProcessingFixture,
  klingMinLoopRateLimitedFixture,
  klingMinLoopRequestIdFixture,
  klingMinLoopSuccessFixture,
  klingMinLoopTimeoutFixture,
  klingMinLoopUnauthorizedFixture,
} from './fixtures/kling-min-loop.fixture'
import { createKlingLiveProvider } from './kling-live-provider'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function createProvider(fetchFn: typeof fetch, overrides = {}) {
  return createKlingLiveProvider({
    ...klingMinLoopConfigFixture,
    fetchFn,
    pollIntervalMs: 0,
    maxPollAttempts: 3,
    requestIdFactory: () => klingMinLoopRequestIdFixture,
    ...overrides,
  })
}

describe('kling live provider', () => {
  test('maps the internal request to one create call, polls, and returns a project video result', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(klingMinLoopCreateSuccessFixture))
      .mockResolvedValueOnce(jsonResponse(klingMinLoopProcessingFixture))
      .mockResolvedValueOnce(jsonResponse(klingMinLoopSuccessFixture))
    const provider = createProvider(fetchFn)
    const progress: number[] = []

    const result = await provider.generate(
      klingMinLoopGenerationRequestFixture,
      {
        signal: new AbortController().signal,
        onProgress: (value) => progress.push(value),
      },
    )

    expect(provider).toMatchObject({
      id: 'kling-api',
      kind: 'live',
      capabilities: ['text-to-video'],
    })
    expect(provider.disabledReason).toBeUndefined()
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      'https://fixture.kling.invalid/text-to-video/kling-2.6',
    )
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer fixture-api-key' }),
      body: JSON.stringify(klingMinLoopCreateRequestFixture),
    })
    expect(fetchFn.mock.calls[1]?.[0]).toBe(
      'https://fixture.kling.invalid/tasks?external_task_ids=fixture-request-id',
    )
    expect(fetchFn.mock.calls[1]?.[1]).toMatchObject({
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer fixture-api-key' }),
    })
    expect(result).toMatchObject({
      persistence: 'project',
      asset: {
        kind: 'video',
        url: 'https://media.fixture.invalid/kling-result.mp4',
        durationSeconds: 5,
      },
      version: {
        prompt: klingMinLoopGenerationRequestFixture.prompt,
      },
    })
    expect(result.version.assetId).toBe(result.asset.id)
    expect(progress).toEqual([10, 55, 100])
  })

  test('is disabled before fetch when the direct-development configuration is incomplete', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    const provider = createKlingLiveProvider({
      mode: 'kling-direct-dev',
      apiKey: '',
      apiBase: '',
      modelId: '',
      fetchFn,
    })

    expect(provider).toMatchObject({
      kind: 'live',
      disabledReason: '可灵开发验证配置未完成',
    })
    await expect(
      provider.generate(klingMinLoopGenerationRequestFixture, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('可灵开发验证配置未完成')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  test.each([
    [klingMinLoopUnauthorizedFixture, '可灵鉴权失败（401）'],
    [klingMinLoopForbiddenFixture, '可灵访问被拒绝（403）'],
    [klingMinLoopRateLimitedFixture, '可灵请求过于频繁（429）'],
  ])('maps HTTP $status without leaking the fixture response', async (fixture, message) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(fixture.body, {
        status: fixture.status,
        headers: 'headers' in fixture ? fixture.headers : undefined,
      }),
    )
    const provider = createProvider(fetchFn)

    await expect(
      provider.generate(klingMinLoopGenerationRequestFixture, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(message)
  })

  test('maps an official failed task to a safe failure', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(klingMinLoopCreateSuccessFixture))
      .mockResolvedValueOnce(jsonResponse(klingMinLoopFailedFixture))

    await expect(
      createProvider(fetchFn).generate(klingMinLoopGenerationRequestFixture, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('可灵生成失败：fixture content rejected')
  })

  test('stops after the bounded polling attempts', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(klingMinLoopCreateSuccessFixture))
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(klingMinLoopTimeoutFixture)),
      )

    await expect(
      createProvider(fetchFn, { maxPollAttempts: 2 }).generate(
        klingMinLoopGenerationRequestFixture,
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('可灵生成等待超时')
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  test('rejects a non-HTTPS result URL', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(klingMinLoopCreateSuccessFixture))
      .mockResolvedValueOnce(jsonResponse(klingMinLoopInvalidUrlFixture))

    await expect(
      createProvider(fetchFn).generate(klingMinLoopGenerationRequestFixture, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('可灵结果 URL 无效')
  })
})
