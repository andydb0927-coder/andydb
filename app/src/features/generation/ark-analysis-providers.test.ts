import { describe, expect, test, vi } from 'vitest'
import { createArkImageAnalysisProviders, imageAnalysisPlan } from './ark-image-analysis-provider'
import { createArkFrameAnalysisProvider, parseFrameAnalysisReport } from './ark-frame-analysis-provider'
import { createDefaultProviderRegistry } from './model-provider-registry'
import { GenerationQueue } from './generation-queue'
import { RegistryGenerationAdapter } from './registry-generation-adapter'
import type { GenerationRequest } from './generation-adapter'
import { arkAnalysisConfigFixture as config, arkAnalysisImageRequest as imageRequest, arkAnalysisVideoRequest as videoRequest, arkFrameResponseFixture, arkFrameReportFixture } from './fixtures/ark-analysis.fixture'

const context = () => ({ signal: new AbortController().signal, onProgress: vi.fn() })
const imageFetch = () => vi.fn<typeof fetch>(async (_url, init) => {
  const body = JSON.parse(String(init?.body))
  return Response.json({ data: [{ url: 'https://media.fixture.invalid/result.png', size: body.size }] })
})

describe('Ark image analysis composition', () => {
  test.each([['panorama-720-api', 1, 1], ['multi-camera-grid-api', 9, 3], ['plot-four-grid-api', 4, 2], ['storyboard-25-grid-api', 25, 5], ['cinematic-lighting-api', 1, 1]] as const)('%s freezes request count, layout, and full cost', async (id, count, columns) => {
    const fetchFn = imageFetch()
    const provider = createArkImageAnalysisProviders({ ...config, fetchFn }).find(p => p.id === id)!
    const request = { ...imageRequest, providerId: id }
    const plan = imageAnalysisPlan(request)
    expect(plan).toMatchObject({ count, columns, credits: count * 18 })
    expect(plan.costCny).toBeCloseTo(count * 0.3)
    expect(new Set(plan.prompts).size).toBe(count)
    const result = await provider.generate(request, context())
    expect(fetchFn).toHaveBeenCalledTimes(count)
    expect(result.assets).toHaveLength(count)
    expect(new Set(result.assets!.map(a => a.id)).size).toBe(count)
    expect(result.usage).toMatchObject({ cost: count * 18, estimatedCostCny: Number((count * 0.3).toFixed(2)) })
    expect(result.persistence).toBe('project')
    for (const [, init] of fetchFn.mock.calls) {
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({ model: 'doubao-seedream-5-0-pro-260628', image: [imageRequest.referenceAssets[0].url] })
      expect(body).not.toHaveProperty('sequential_image_generation')
      expect(body).not.toHaveProperty('reference_image')
    }
    if (id === 'panorama-720-api') {
      expect(plan.width! / plan.height!).toBe(2)
      expect(plan.notice).toContain('不保证')
      expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body)).prompt).toContain('equirectangular')
    }
  })
  test('serializes requests and stops after partial failure, retaining completed outputs and billing', async () => {
    let running = 0
    const fetchFn = vi.fn<typeof fetch>(async (_url, init): Promise<Response> => {
      expect(running++).toBe(0)
      await Promise.resolve()
      running--
      return fetchFn.mock.calls.length === 3 ? new Response('{}', { status: 429 }) : Response.json({ data: [{ url: 'https://media.fixture.invalid/result.png', size: JSON.parse(String(init?.body)).size }] })
    })
    const registry = createDefaultProviderRegistry({ seedream: { ...config, fetchFn } })
    const saved = vi.fn()
    const queue = new GenerationQueue({ adapter: new RegistryGenerationAdapter(registry), onJobChange: vi.fn(), onSuccess: saved })
    const job = queue.enqueue(imageRequest)
    await vi.waitFor(() => expect(queue.get(job.id)?.status).toBe('failed'))
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(saved.mock.calls[0][1].assets).toHaveLength(2)
    expect(queue.get(job.id)).toMatchObject({ creditsSpent: 36, estimatedCostCny: 0.6, error: expect.stringContaining('2/9') })
    queue.dispose()
  })
  test('validates lighting source/box before any request and maps bbox into prompt only', async () => {
    const fetchFn = imageFetch()
    const provider = createArkImageAnalysisProviders({ ...config, fetchFn }).find(p => p.id === 'cinematic-lighting-api')!
    const request = { ...imageRequest, providerId: provider.id, parameters: { resolution: '1K', useBox: true, editX1: 10, editY1: 20, editX2: 600, editY2: 900 } }
    await expect(provider.generate({ ...request, referenceAssets: [] }, context())).rejects.toThrow('源图片')
    await expect(provider.generate({ ...request, parameters: { ...request.parameters, editX1: 700 } }, context())).rejects.toThrow('区域')
    expect(fetchFn).not.toHaveBeenCalled()
    await provider.generate(request, context())
    const body = JSON.parse(String(fetchFn.mock.calls[0][1]?.body))
    expect(body.prompt).toContain('<bbox>10 20 600 900</bbox>')
    expect(body).not.toHaveProperty('mask')
    expect(body).not.toHaveProperty('bbox')
  })
  test('configuration, count, target and cancelled calls never fall back or spend', async () => {
    const fetchFn = imageFetch()
    const disabled = createArkImageAnalysisProviders({ ...config, mode: 'mock', fetchFn })[0]
    await expect(disabled.generate({ ...imageRequest, providerId: disabled.id }, context())).rejects.toThrow('配置未完成')
    const provider = createArkImageAnalysisProviders({ ...config, fetchFn })[0]
    await expect(provider.generate({ ...imageRequest, providerId: provider.id, parameters: { count: 25 } }, context())).rejects.toThrow('数量')
    await expect(provider.generate({ ...imageRequest, providerId: provider.id, targetKind: 'video' }, context())).rejects.toThrow('图片')
    const controller = new AbortController(); controller.abort()
    await expect(provider.generate({ ...imageRequest, providerId: provider.id }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchFn).not.toHaveBeenCalled()
  })
  test.each([401, 403, 429, 500])('safe first-request HTTP %s never returns a fake result', async status => {
    const provider = createArkImageAnalysisProviders({ ...config, fetchFn: vi.fn(async () => new Response('secret-fixture-key', { status })) })[0]
    await expect(provider.generate({ ...imageRequest, providerId: provider.id }, context())).rejects.toThrow(/全景.*(?:失败|拒绝|频繁|异常)/)
  })
  test('times out a stalled image request without dispatching more cells or exposing upstream errors', async () => {
    vi.useFakeTimers()
    try {
      const fetchFn = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('fixture-secret', 'AbortError')))))
      const provider = createArkImageAnalysisProviders({ ...config, fetchFn, timeoutMs: 25 }).find(p => p.id === 'multi-camera-grid-api')!
      const result = expect(provider.generate(imageRequest, context())).rejects.toThrow('超时')
      await vi.advanceTimersByTimeAsync(26)
      await result
      expect(fetchFn).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
})

describe('Ark visual video analysis', () => {
  test.each(['timeout', 'abort'] as const)('stops a pending visual request on %s', async action => {
    vi.useFakeTimers()
    try {
      const fetchFn = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('fixture-secret', 'AbortError')))))
      const controller = new AbortController()
      const provider = createArkFrameAnalysisProvider({ ...config, fetchFn, timeoutMs: 25 })
      const pending = provider.generate(videoRequest, { signal: controller.signal })
      const assertion = action === 'timeout' ? expect(pending).rejects.toThrow('超时') : expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      if (action === 'abort') controller.abort()
      await vi.advanceTimersByTimeAsync(26)
      await assertion
      expect(fetchFn).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
  test('uses existing Chat transport with video_url/fps and strict persisted report', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json(arkFrameResponseFixture))
    const result = await createArkFrameAnalysisProvider({ ...config, fetchFn }).generate(videoRequest, context())
    expect(fetchFn.mock.calls[0][0]).toBe(`${config.apiBase}/chat/completions`)
    const body = JSON.parse(String(fetchFn.mock.calls[0][1]?.body))
    expect(body).toMatchObject({ model: 'doubao-seed-2-1-pro-260628', stream: false, thinking: { type: 'disabled' } })
    expect(body.messages[1].content[0]).toEqual({ type: 'video_url', video_url: { url: videoRequest.referenceAssets[0].url, fps: 1 } })
    expect(body.messages[1].content[1].text).toContain('分镜')
    expect(parseFrameAnalysisReport(result.version.textContent!)).toEqual(arkFrameReportFixture)
    expect(result).toMatchObject({ persistence: 'project', asset: { kind: 'text' }, usage: { cost: 1, inputTokens: 2000, outputTokens: 300, estimatedCostCny: 0.021 } })
  })
  test.each([
    { referenceAssets: [] }, { referenceAssets: [{ kind: 'video' as const, mimeType: 'video/mp4', url: 'blob:local' }] },
    { parameters: { fps: 6 } }, { parameters: { fps: 0.1 } }, { parameters: { fps: 1, music: true } },
    { parameters: { fps: 1, storyboard: false, motion: false } },
  ])('rejects unsupported inputs before networking: %j', async overrides => {
    const fetchFn = vi.fn<typeof fetch>()
    await expect(createArkFrameAnalysisProvider({ ...config, fetchFn }).generate({ ...videoRequest, ...overrides } as GenerationRequest, context())).rejects.toThrow()
    expect(fetchFn).not.toHaveBeenCalled()
  })
  test.each([401, 403, 429, 500])('sanitizes HTTP %s', async status => {
    const provider = createArkFrameAnalysisProvider({ ...config, fetchFn: vi.fn(async () => new Response('fixture-secret', { status })) })
    await expect(provider.generate(videoRequest, context())).rejects.toThrow(/拉片分析/)
  })
  test.each(['{}', 'not json', '{"summary":"x","shots":[{"start":2,"end":1,"description":"x","motion":"x"}]}'])('rejects malformed report %s', async content => {
    const provider = createArkFrameAnalysisProvider({ ...config, fetchFn: vi.fn(async () => Response.json({ choices: [{ message: { content } }] })) })
    await expect(provider.generate(videoRequest, context())).rejects.toThrow('分析结果格式')
  })
  test('keeps explicit mock-disabled tools hidden and smart cut honestly unavailable', () => {
    const registry = createDefaultProviderRegistry({ seedream: { mode: 'mock' }, arkText: { mode: 'mock' } })
    for (const id of ['panorama-720-api', 'multi-camera-grid-api', 'plot-four-grid-api', 'storyboard-25-grid-api', 'cinematic-lighting-api', 'frame-analysis-api']) {
      expect(registry.require(id)).toMatchObject({ kind: 'live', selectorVisible: false, disabledReason: expect.any(String) })
    }
    expect(registry.require('smart-edit-api')).toMatchObject({ kind: 'placeholder', disabledReason: expect.stringContaining('AI MediaKit') })
  })
})
