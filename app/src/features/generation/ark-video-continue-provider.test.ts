import { afterEach, describe, expect, test, vi } from 'vitest'
import { createArkVideoContinueProvider, buildArkVideoContinuePrompt, videoContinuationSourceFailure } from './ark-video-continue-provider'
import { createDefaultProviderRegistry, ProviderRegistry } from './model-provider-registry'
import { arkVideoContinueConfigFixture, arkVideoContinueRequestFixture as request, arkVideoContinueCreateFixture, arkVideoContinueQueuedFixture, arkVideoContinueRunningFixture, arkVideoContinueSuccessFixture, arkVideoContinueFailedFixture, arkVideoContinueExpiredFixture, arkVideoContinueInvalidUrlFixture } from './fixtures/ark-video-continue.fixture'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const context = () => ({ signal: new AbortController().signal })
const provider = (fetchFn: typeof fetch, overrides = {}) => createArkVideoContinueProvider({ ...arkVideoContinueConfigFixture, fetchFn, pollIntervalMs: 0, maxPollAttempts: 4, ...overrides })
afterEach(() => vi.useRealTimers())

describe('Ark video continuation: fixture-only contract', () => {
  test('uses one video reference with the official role, existing poller and project-persistent result', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(arkVideoContinueCreateFixture))
      .mockResolvedValueOnce(response(arkVideoContinueQueuedFixture))
      .mockResolvedValueOnce(response(arkVideoContinueRunningFixture))
      .mockResolvedValueOnce(response(arkVideoContinueSuccessFixture))
    const progress: number[] = []
    const result = await new ProviderRegistry([provider(fetchFn)]).generate(request, { ...context(), onProgress: value => progress.push(value) })
    expect(fetchFn).toHaveBeenCalledTimes(4)
    expect(fetchFn.mock.calls[0]![0]).toBe('https://fixture.ark.invalid/api/v3/contents/generations/tasks')
    expect(fetchFn.mock.calls[0]![1]?.headers).toMatchObject({ Authorization: 'Bearer fixture-ark-api-key' })
    expect(JSON.parse(String(fetchFn.mock.calls[0]![1]?.body))).toEqual({
      model: 'doubao-seedance-2-0-260128',
      content: [{ type: 'text', text: buildArkVideoContinuePrompt(request) }, { type: 'video_url', video_url: { url: request.referenceAssets[0]!.url }, role: 'reference_video' }],
      duration: 5, ratio: 'adaptive', resolution: '720p', generate_audio: true, watermark: false,
    })
    expect(buildArkVideoContinuePrompt(request)).toContain('延长@视频1')
    expect(fetchFn.mock.calls[1]![0]).toBe('https://fixture.ark.invalid/api/v3/contents/generations/tasks/cgt-fixture-continue')
    expect(progress).toEqual([10, 55, 55, 100])
    expect(result).toMatchObject({ persistence: 'project', version: { prompt: request.prompt },
      asset: { kind: 'video', url: arkVideoContinueSuccessFixture.content.video_url, durationSeconds: 5 },
      usage: { providerId: 'ark-video-continue', cost: 135, outputTokens: 216000, estimatedCostCny: 6.048 } })
    expect(result.version.assetId).toBe(result.asset.id)
  })

  test.each([['480P', 28], ['720P', 28], ['1080P', 31], ['4K', 16]])('maps %s and charges the input-video tariff', async (quality, rate) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(response(arkVideoContinueCreateFixture)).mockResolvedValue(response({ ...arkVideoContinueSuccessFixture, resolution: quality.toLowerCase() }))
    const result = await provider(fetchFn).generate({ ...request, parameters: { ...request.parameters, quality, sound: false, duration: 10 } }, context())
    expect(JSON.parse(String(fetchFn.mock.calls[0]![1]?.body))).toMatchObject({ resolution: quality.toLowerCase(), generate_audio: false, duration: 10 })
    expect(result.usage?.estimatedCostCny).toBe(Number((216000 / 1e6 * rate).toFixed(4)))
  })

  test.each([
    { referenceAssets: [] }, { referenceAssets: [...request.referenceAssets, ...request.referenceAssets] },
    { referenceAssets: [{ kind: 'image' as const, mimeType: 'image/png', url: 'https://media.fixture.invalid/a.png' }] },
    { referenceAssets: [{ kind: 'video' as const, mimeType: 'video/webm', url: 'https://media.fixture.invalid/a.webm' }] },
    { referenceAssets: [{ kind: 'video' as const, mimeType: 'video/mp4', url: 'data:video/mp4;base64,eA==' }] },
    { prompt: ' ' }, { parameters: { ...request.parameters, videoPostOperation: 'reshoot' } },
    { parameters: { ...request.parameters, videoPostOperation: 'subtitle-erase' } },
    { parameters: { ...request.parameters, duration: 16 } }, { parameters: { ...request.parameters, duration: 4.5 } },
    { parameters: { ...request.parameters, quality: '8K' } }, { parameters: { ...request.parameters, count: 2 } },
    { parameters: { ...request.parameters, sourceDuration: 16 } }, { parameters: { ...request.parameters, sourceDuration: 1 } },
    { parameters: { ...request.parameters, sourceWidth: 100, sourceHeight: 100 } },
    { parameters: { ...request.parameters, sourceWidth: 4000, sourceHeight: 4000 } },
    { parameters: { ...request.parameters, start: 0, end: 3 } }, { parameters: { ...request.parameters, mask: 'mask.png' } },
  ])('rejects invalid or unsupported operations before POST: %j', async (patch) => {
    const fetchFn = vi.fn<typeof fetch>()
    await expect(provider(fetchFn).generate({ ...request, ...patch }, context())).rejects.toThrow()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  test('keeps the tool out of selectors and disabled when config or model contract is missing', async () => {
    const registry = createDefaultProviderRegistry({ seedanceVideo: arkVideoContinueConfigFixture })
    expect(registry.require('ark-video-continue').disabledReason).toBeUndefined()
    expect(registry.menuProvidersFor(['text-to-video', 'image-to-video', 'video-continue']).map(p => p.id)).not.toContain('ark-video-continue')
    const fetchFn = vi.fn<typeof fetch>()
    for (const overrides of [{ mode: 'mock' }, { apiKey: '' }, { modelId: '' }, { modelId: 'doubao-seedance-2-5-260628' }]) {
      const disabled = provider(fetchFn, overrides)
      expect(disabled.disabledReason).toBeTruthy()
      await expect(disabled.generate(request, context())).rejects.toThrow(disabled.disabledReason!)
    }
    expect(fetchFn).not.toHaveBeenCalled()
  })

  test.each([400, 401, 403, 429, 500])('sanitizes create and polling HTTP %s errors', async (status) => {
    for (const polling of [false, true]) {
      const fetchFn = vi.fn<typeof fetch>()
      if (polling) fetchFn.mockResolvedValueOnce(response(arkVideoContinueCreateFixture))
      fetchFn.mockResolvedValue(response({ message: 'SECRET api key' }, status))
      await expect(provider(fetchFn).generate(request, context())).rejects.toThrow(String(status))
    }
  })

  test.each([
    [arkVideoContinueFailedFixture, '生成失败'], [arkVideoContinueExpiredFixture, '超时'],
    [{ status: 'cancelled' }, '取消'], [arkVideoContinueInvalidUrlFixture, 'URL 无效'],
    [{ status: 'unknown' }, '状态响应格式异常'],
  ])('handles terminal or invalid responses without raw provider details: %j', async (body, message) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(response(arkVideoContinueCreateFixture)).mockResolvedValue(response(body))
    const failure = await provider(fetchFn).generate(request, context()).catch(error => error as Error)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain(message)
    expect((failure as Error).message).not.toContain('SECRET')
  })

  test('sanitizes malformed JSON, missing task ID and network errors', async () => {
    for (const fetchFn of [vi.fn<typeof fetch>().mockResolvedValue(new Response('bad json')), vi.fn<typeof fetch>().mockResolvedValue(response({})), vi.fn<typeof fetch>().mockRejectedValue(new Error('SECRET'))]) {
      const failure = await provider(fetchFn).generate(request, context()).catch(error => error as Error)
      expect((failure as Error).message).toMatch(/异常/)
      expect((failure as Error).message).not.toContain('SECRET')
    }
  })

  test('bounds polling and stops a hung request on timeout without repeating POST', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(response(arkVideoContinueCreateFixture)).mockImplementation(async () => response(arkVideoContinueRunningFixture))
    await expect(provider(fetchFn, { maxPollAttempts: 2 }).generate(request, context())).rejects.toThrow('超时')
    expect(fetchFn).toHaveBeenCalledTimes(3)
    vi.useFakeTimers()
    const hung = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))))
    const assertion = expect(provider(hung, { timeoutMs: 10 }).generate(request, context())).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(11)
    await assertion
    expect(hung).toHaveBeenCalledOnce()
  })

  test('propagates user cancellation during create and poll, and never fills a cancelled result', async () => {
    for (const abortAt of [1, 2]) {
      const controller = new AbortController()
      let calls = 0
      const fetchFn = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal)
        if (++calls === abortAt) controller.abort()
        return response(calls === 1 ? arkVideoContinueCreateFixture : arkVideoContinueSuccessFixture)
      })
      await expect(provider(fetchFn).generate(request, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
      expect(calls).toBe(abortAt)
    }
  })

  test('validates source metadata separately for draft UI', () => {
    const source = { ...request.referenceAssets[0]!, durationSeconds: 5, width: 1280, height: 720 }
    expect(videoContinuationSourceFailure(source)).toBeUndefined()
    expect(videoContinuationSourceFailure({ ...source, durationSeconds: undefined })).toContain('时长')
    expect(videoContinuationSourceFailure({ ...source, url: 'blob:local' })).toContain('HTTPS')
    expect(videoContinuationSourceFailure({ ...source, width: 6000, height: 300 })).toContain('尺寸')
  })
})
