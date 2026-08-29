import { describe, expect, test, vi } from 'vitest'

import {
  seedanceVideoCancelledFixture,
  seedanceVideoConfigFixture,
  seedanceVideoCreateRequestFixture,
  seedanceVideoCreateSuccessFixture,
  seedanceVideoFailedFixture,
  seedanceVideoForbiddenFixture,
  seedanceVideoGenerationRequestFixture,
  seedanceVideoInvalidUrlFixture,
  seedanceVideoRateLimitedFixture,
  seedanceVideoRunningFixture,
  seedanceVideoSuccessFixture,
  seedanceVideoTaskIdFixture,
  seedanceVideoTimeoutFixture,
  seedanceVideoUnauthorizedFixture,
} from './fixtures/seedance-video.fixture'
import { createSeedanceVideoProvider } from './seedance-video-provider'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function createProvider(fetchFn: typeof fetch, overrides = {}) {
  return createSeedanceVideoProvider({
    ...seedanceVideoConfigFixture,
    fetchFn,
    pollIntervalMs: 0,
    maxPollAttempts: 3,
    ...overrides,
  })
}

describe('Seedance video live provider', () => {
  test('sets explicit roles on video and audio references and uses the input-video price', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(seedanceVideoCreateSuccessFixture))
      .mockResolvedValueOnce(jsonResponse(seedanceVideoSuccessFixture))
    const result = await createProvider(fetchFn).generate({ ...seedanceVideoGenerationRequestFixture,
      parameters: { generationMode: '全能参考', quality: '1080P', duration: 5 },
      referenceAssets: [
        { kind: 'video', url: 'https://media.fixture.invalid/source.mp4', mimeType: 'video/mp4' },
        { kind: 'audio', url: 'https://media.fixture.invalid/source.wav', mimeType: 'audio/wav' },
      ],
    }, { signal: new AbortController().signal })
    expect(JSON.parse(String(fetchFn.mock.calls[0]![1]?.body)).content).toEqual([
      { type: 'text', text: seedanceVideoGenerationRequestFixture.prompt },
      { type: 'video_url', video_url: { url: 'https://media.fixture.invalid/source.mp4' }, role: 'reference_video' },
      { type: 'audio_url', audio_url: { url: 'https://media.fixture.invalid/source.wav' }, role: 'reference_audio' },
    ])
    expect(result.usage?.estimatedCostCny).toBe(3.348)
  })
  test('creates with the official content contract, polls, and returns a project-persistent video', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(seedanceVideoCreateSuccessFixture))
      .mockResolvedValueOnce(jsonResponse(seedanceVideoRunningFixture))
      .mockResolvedValueOnce(jsonResponse(seedanceVideoSuccessFixture))
    const provider = createProvider(fetchFn)
    const progress: number[] = []

    const result = await provider.generate(
      seedanceVideoGenerationRequestFixture,
      {
        signal: new AbortController().signal,
        onProgress: (value) => progress.push(value),
      },
    )

    expect(provider).toMatchObject({
      id: 'seedance-api',
      name: '火山方舟',
      modelName: 'Seedance 2.0',
      kind: 'live',
      capabilities: ['text-to-video', 'image-to-video'],
      pricing: { amount: 135, currency: 'credits', unit: 'generation' },
    })
    expect(provider.disabledReason).toBeUndefined()
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      'https://fixture.ark.invalid/api/v3/contents/generations/tasks',
    )
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer fixture-ark-api-key',
      }),
      body: JSON.stringify(seedanceVideoCreateRequestFixture),
    })
    expect(fetchFn.mock.calls[1]?.[0]).toBe(
      `https://fixture.ark.invalid/api/v3/contents/generations/tasks/${seedanceVideoTaskIdFixture}`,
    )
    expect(result).toMatchObject({
      persistence: 'project',
      asset: {
        kind: 'video',
        url: 'https://media.fixture.invalid/seedance-result.mp4',
        durationSeconds: 8,
      },
      version: {
        prompt: seedanceVideoGenerationRequestFixture.prompt,
      },
      usage: {
        outputTokens: 108_000,
        totalTokens: 108_000,
      },
    })
    expect(result.version.assetId).toBe(result.asset.id)
    expect(progress).toEqual([10, 55, 100])
  })

  test('is disabled before fetch when the shared Ark development configuration is incomplete', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    const provider = createSeedanceVideoProvider({
      mode: 'seedream-direct-dev',
      apiKey: '',
      apiBase: '',
      modelId: '',
      fetchFn,
    })

    expect(provider).toMatchObject({
      kind: 'live',
      disabledReason: '火山方舟 Seedance 开发验证配置未完成',
    })
    await expect(
      provider.generate(seedanceVideoGenerationRequestFixture, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('火山方舟 Seedance 开发验证配置未完成')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  test('requires an account-callable model or endpoint id instead of falling back to the public experience id', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    const provider = createSeedanceVideoProvider({
      mode: 'seedream-direct-dev',
      apiKey: 'fixture-ark-api-key',
      apiBase: 'https://fixture.ark.invalid/api/v3',
      modelId: '',
      fetchFn,
    })

    expect(provider.disabledReason).toBe(
      '火山方舟 Seedance 2.0 待开通：请配置账号可调用的模型或推理接入点 ID',
    )
    await expect(
      provider.generate(seedanceVideoGenerationRequestFixture, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('火山方舟 Seedance 2.0 待开通')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  test('maps a missing or unopened video model to an actionable 404 message', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: { code: 'NotFound', message: 'fixture secret' } }, { status: 404 }),
    )

    await expect(
      createProvider(fetchFn).generate(seedanceVideoGenerationRequestFixture, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('火山方舟 Seedance 模型未开通或模型/接入点不可用（404）')
  })

  test.each([
    [seedanceVideoUnauthorizedFixture, '火山方舟 Seedance 鉴权失败（401）'],
    [seedanceVideoForbiddenFixture, '火山方舟 Seedance 访问被拒绝（403）'],
    [seedanceVideoRateLimitedFixture, '火山方舟 Seedance 请求过于频繁（429）'],
  ])('maps HTTP $status without leaking response details', async (fixture, message) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(fixture.body, { status: fixture.status }),
    )

    await expect(
      createProvider(fetchFn).generate(seedanceVideoGenerationRequestFixture, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(message)
  })

  test.each([
    [seedanceVideoFailedFixture, '火山方舟 Seedance 生成失败：fixture content rejected'],
    [seedanceVideoCancelledFixture, '火山方舟 Seedance 任务已取消'],
  ])('maps terminal status $status to a safe Chinese failure', async (fixture, message) => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(seedanceVideoCreateSuccessFixture))
      .mockResolvedValueOnce(jsonResponse(fixture))

    await expect(
      createProvider(fetchFn).generate(seedanceVideoGenerationRequestFixture, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(message)
  })

  test('stops after the bounded polling attempts', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(seedanceVideoCreateSuccessFixture))
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(seedanceVideoTimeoutFixture)),
      )

    await expect(
      createProvider(fetchFn, { maxPollAttempts: 2 }).generate(
        seedanceVideoGenerationRequestFixture,
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('火山方舟 Seedance 生成等待超时')
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  test('rejects a non-HTTPS result URL', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(seedanceVideoCreateSuccessFixture))
      .mockResolvedValueOnce(jsonResponse(seedanceVideoInvalidUrlFixture))

    await expect(
      createProvider(fetchFn).generate(seedanceVideoGenerationRequestFixture, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('火山方舟 Seedance 结果 URL 无效')
  })

  test('forwards AbortSignal to create and poll requests', async () => {
    const controller = new AbortController()
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      expect(init?.signal).toBe(controller.signal)
      controller.abort()
      throw new DOMException('cancelled', 'AbortError')
    })

    await expect(
      createProvider(fetchFn).generate(seedanceVideoGenerationRequestFixture, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
