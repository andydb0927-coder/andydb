import { describe, expect, test, vi } from 'vitest'

import {
  seedreamMinLoopConfigFixture,
  seedreamMinLoopCreateRequestFixture,
  seedreamMinLoopEmptyResultFixture,
  seedreamMinLoopForbiddenFixture,
  seedreamMinLoopGenerationRequestFixture,
  seedreamMinLoopImageToImageRequestFixture,
  seedreamMinLoopInvalidUrlFixture,
  seedreamMinLoopRateLimitedFixture,
  seedreamMinLoopSensitivePromptFixture,
  seedreamMinLoopSuccessFixture,
  seedreamMinLoopUnauthorizedFixture,
} from './fixtures/seedream-min-loop.fixture'
import { createSeedreamLiveProvider } from './seedream-live-provider'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function createProvider(fetchFn: typeof fetch, overrides = {}) {
  return createSeedreamLiveProvider({
    ...seedreamMinLoopConfigFixture,
    fetchFn,
    ...overrides,
  })
}

describe('Seedream live provider', () => {
  test('maps a text-to-image request to the official synchronous API and returns an ephemeral image', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(seedreamMinLoopSuccessFixture))
    const provider = createProvider(fetchFn)
    const progress: number[] = []

    const result = await provider.generate(
      seedreamMinLoopGenerationRequestFixture,
      {
        signal: new AbortController().signal,
        onProgress: (value) => progress.push(value),
      },
    )

    expect(provider).toMatchObject({
      id: 'seedream-5-pro-api',
      modelName: 'Seedream 5.0 Pro',
      kind: 'live',
      capabilities: ['text-to-image', 'image-to-image', 'image-edit'],
    })
    expect(provider.disabledReason).toBeUndefined()
    expect(fetchFn).toHaveBeenCalledOnce()
    expect(fetchFn).toHaveBeenCalledWith(
      'https://fixture.seedream.invalid/api/v3/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer fixture-seedream-api-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(seedreamMinLoopCreateRequestFixture),
      }),
    )
    expect(result).toMatchObject({
      persistence: 'ephemeral',
      asset: {
        kind: 'image',
        url: 'https://media.fixture.invalid/seedream-result.png',
        mimeType: 'image/png',
        width: 2560,
        height: 1440,
      },
      version: { prompt: seedreamMinLoopGenerationRequestFixture.prompt },
    })
    expect(result.version.assetId).toBe(result.asset.id)
    expect(progress).toEqual([10, 85, 100])
  })

  test('maps image references to the official image field for image-to-image', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(seedreamMinLoopSuccessFixture))

    await createProvider(fetchFn).generate(
      seedreamMinLoopImageToImageRequestFixture,
      { signal: new AbortController().signal },
    )

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
      prompt: '保持人物身份不变，将背景改成雪夜',
      image: ['data:image/png;base64,ZmFrZS1pbWFnZQ=='],
    })
  })

  test('is disabled before fetch when direct-development configuration is incomplete', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    const provider = createSeedreamLiveProvider({
      mode: 'seedream-direct-dev',
      apiKey: '',
      fetchFn,
    })

    expect(provider).toMatchObject({
      kind: 'live',
      disabledReason: 'Seedream 开发验证配置未完成',
    })
    await expect(
      provider.generate(seedreamMinLoopGenerationRequestFixture, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Seedream 开发验证配置未完成')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  test.each([
    [seedreamMinLoopUnauthorizedFixture, 'Seedream 鉴权失败（401）'],
    [seedreamMinLoopForbiddenFixture, 'Seedream 访问被拒绝（403）'],
    [seedreamMinLoopRateLimitedFixture, 'Seedream 请求过于频繁或额度不足（429）'],
    [seedreamMinLoopSensitivePromptFixture, 'Seedream 提示词未通过安全检查（400）'],
  ])('maps HTTP $status to a safe product error', async (fixture, message) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(fixture.body, { status: fixture.status }),
    )

    await expect(
      createProvider(fetchFn).generate(seedreamMinLoopGenerationRequestFixture, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(message)
  })

  test.each([
    [seedreamMinLoopEmptyResultFixture, 'Seedream 未返回图片结果'],
    [seedreamMinLoopInvalidUrlFixture, 'Seedream 结果 URL 无效'],
  ])('rejects malformed successful output', async (fixture, message) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(fixture))

    await expect(
      createProvider(fetchFn).generate(seedreamMinLoopGenerationRequestFixture, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(message)
  })
})
