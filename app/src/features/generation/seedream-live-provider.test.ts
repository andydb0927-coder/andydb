import { describe, expect, test, vi } from 'vitest'

import {
  seedreamMinLoopConfigFixture,
  seedreamMinLoopCreateRequestFixture,
  seedreamMinLoopEmptyResultFixture,
  seedreamMinLoopForbiddenFixture,
  seedreamMinLoopGenerationRequestFixture,
  seedreamMinLoopImageToImageRequestFixture,
  seedreamMinLoopInvalidUrlFixture,
  seedreamMinLoopMultiOutputFixture,
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
  test('uses the current Seedream 5.0 Pro model id when no override is configured', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(seedreamMinLoopSuccessFixture),
    )
    const provider = createSeedreamLiveProvider({
      mode: 'seedream-direct-dev',
      apiKey: 'fixture-seedream-api-key',
      apiBase: 'https://fixture.seedream.invalid/api/v3',
      fetchFn,
    })

    await provider.generate(seedreamMinLoopGenerationRequestFixture, {
      signal: new AbortController().signal,
    })

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: 'doubao-seedream-5-0-pro-260628',
    })
  })

  test('migrates the retired Seedream 5.0 model override to the current Pro model id', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(seedreamMinLoopSuccessFixture),
    )
    const provider = createSeedreamLiveProvider({
      mode: 'seedream-direct-dev',
      apiKey: 'fixture-seedream-api-key',
      apiBase: 'https://fixture.seedream.invalid/api/v3',
      modelId: 'doubao-seedream-5-0-260128',
      fetchFn,
    })

    await provider.generate(seedreamMinLoopGenerationRequestFixture, {
      signal: new AbortController().signal,
    })

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: 'doubao-seedream-5-0-pro-260628',
    })
  })

  test('maps a text-to-image request to the official synchronous API and returns a project image', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse(seedreamMinLoopSuccessFixture))
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
      persistence: 'project',
      asset: {
        kind: 'image',
        url: 'https://media.fixture.invalid/seedream-result.png',
        mimeType: 'image/png',
        width: 2816,
        height: 1584,
      },
      version: { prompt: seedreamMinLoopGenerationRequestFixture.prompt },
    })
    expect(result.version.assetId).toBe(result.asset.id)
    expect(progress).toEqual([10, 85, 100])
    expect(provider.parameterSchema.resolution).toMatchObject({
      defaultValue: '2K',
      options: ['1K', '1.5K', '2K'],
    })
    expect(provider.parameterSchema.aspectRatio).toMatchObject({
      options: [
        '1:1',
        '1:2',
        '2:1',
        '9:16',
        '16:9',
        '3:4',
        '4:3',
        '3:2',
        '2:3',
        '5:4',
        '4:5',
        '21:9',
        '9:21',
        '自适应',
        '自定义',
      ],
    })
    expect(provider.parameterSchema.count).toMatchObject({
      defaultValue: '1',
      options: ['1', '2', '4'],
    })
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

  test('passes adaptive and valid custom output sizes through the official size field', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse(seedreamMinLoopSuccessFixture))
    const provider = createProvider(fetchFn)

    await provider.generate({
      ...seedreamMinLoopGenerationRequestFixture,
      parameters: {
        ...seedreamMinLoopGenerationRequestFixture.parameters,
        aspectRatio: '自适应',
        resolution: '1.5K',
      },
    }, { signal: new AbortController().signal })
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
      size: '1.5K',
    })

    await provider.generate({
      ...seedreamMinLoopGenerationRequestFixture,
      parameters: {
        ...seedreamMinLoopGenerationRequestFixture.parameters,
        aspectRatio: '自定义',
        customWidth: 1600,
        customHeight: 2000,
      },
    }, { signal: new AbortController().signal })
    expect(JSON.parse(String(fetchFn.mock.calls[1]?.[1]?.body))).toMatchObject({
      size: '1600x2000',
    })
  })

  test('rejects an invalid custom size before making a billable request', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    const provider = createProvider(fetchFn)

    await expect(provider.generate({
      ...seedreamMinLoopGenerationRequestFixture,
      parameters: {
        ...seedreamMinLoopGenerationRequestFixture.parameters,
        aspectRatio: '自定义',
        customWidth: 512,
        customHeight: 512,
      },
    }, { signal: new AbortController().signal })).rejects.toThrow(
      '自定义尺寸总像素需在 921,600–4,624,220 之间',
    )
    expect(fetchFn).not.toHaveBeenCalled()
  })

  test('uses four serial single-image requests and returns the complete ordered result set', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_input, init) => {
        const call = fetchFn.mock.calls.length
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(body).not.toHaveProperty('count')
        expect(body).not.toHaveProperty('quality')
        expect(body).not.toHaveProperty('sequential_image_generation')
        expect(body.size).toBe('2280x1824')
        return jsonResponse({
          ...seedreamMinLoopSuccessFixture,
          data: [{
            url: `https://media.fixture.invalid/seedream-result-${call}.png`,
            size: '2280x1824',
          }],
        })
      })
    const progress: number[] = []

    const result = await createProvider(fetchFn).generate({
      ...seedreamMinLoopGenerationRequestFixture,
      parameters: {
        ...seedreamMinLoopGenerationRequestFixture.parameters,
        aspectRatio: '5:4',
        count: 4,
      },
    }, {
      signal: new AbortController().signal,
      onProgress: (value) => progress.push(value),
    })

    expect(fetchFn).toHaveBeenCalledTimes(4)
    expect(result.assets).toHaveLength(4)
    expect(result.asset).toEqual(result.assets?.[0])
    expect(result.assets?.map(({ url }) => url)).toEqual([
      'https://media.fixture.invalid/seedream-result-1.png',
      'https://media.fixture.invalid/seedream-result-2.png',
      'https://media.fixture.invalid/seedream-result-3.png',
      'https://media.fixture.invalid/seedream-result-4.png',
    ])
    expect(progress.at(-1)).toBe(100)
  })

  test('keeps every valid image item returned by one response', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(seedreamMinLoopMultiOutputFixture))

    const result = await createProvider(fetchFn).generate(
      seedreamMinLoopGenerationRequestFixture,
      { signal: new AbortController().signal },
    )

    expect(result.assets).toHaveLength(4)
    expect(result.assets?.map(({ url }) => url)).toEqual([
      'https://media.fixture.invalid/seedream-result-1.png',
      'https://media.fixture.invalid/seedream-result-2.png',
      'https://media.fixture.invalid/seedream-result-3.png',
      'https://media.fixture.invalid/seedream-result-4.png',
    ])
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
