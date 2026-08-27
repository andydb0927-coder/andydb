import { afterEach, describe, expect, test, vi } from 'vitest'
import { createArkImageEditProvider, buildArkImageEditPrompt, estimateArkImageEditCny } from './ark-image-edit-provider'
import { createDefaultProviderRegistry, ProviderRegistry } from './model-provider-registry'
import { arkImageEditConfigFixture, arkImageEditRequestFixture as request, arkImageEditSuccessFixture } from './fixtures/ark-image-edit.fixture'

const response = (body: unknown = arkImageEditSuccessFixture, status = 200) => new Response(JSON.stringify(body), { status })
const provider = (fetchFn: typeof fetch, options = {}) => createArkImageEditProvider({ ...arkImageEditConfigFixture, fetchFn, ...options })
const context = () => ({ signal: new AbortController().signal })
afterEach(() => vi.useRealTimers())

describe('Ark image edit contract (network fixtures only)', () => {
  test('uses the official Pro model, bbox prompt, image and generations endpoint, without invented fields', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response())
    const result = await new ProviderRegistry([provider(fetchFn)]).generate(request, context())
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('https://fixture.seedream.invalid/api/v3/images/generations')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer fixture-image-edit-key' })
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'doubao-seedream-5-0-pro-260628', prompt: buildArkImageEditPrompt(request),
      image: [request.referenceAssets[0]!.url], size: '2816x1584', response_format: 'url', output_format: 'png', watermark: false,
    })
    expect(result).toMatchObject({ persistence: 'project', version: { prompt: '移除路牌' },
      asset: { kind: 'image', width: 2816, height: 1584 }, usage: { providerId: 'ark-image-edit', cost: 18, estimatedCostCny: 0.6 } })
    expect(buildArkImageEditPrompt(request)).toContain('<bbox>100 200 600 800</bbox>')
  })
  test('outpainting is explicit prompt editing with target size, not a mask or scale API', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response())
    const edit = { ...request, prompt: '延续山谷', parameters: { imageEditOperation: 'outpaint', expandDirection: '左侧', aspectRatio: '21:9', resolution: '2K', count: 1 } }
    await provider(fetchFn).generate(edit, context())
    const body = JSON.parse(String(fetchFn.mock.calls[0]![1]?.body))
    expect(body.size).toBe('3136x1344')
    expect(body.prompt).toContain('左侧')
    expect(body.prompt).toContain('延续山谷')
    expect(body).not.toHaveProperty('outpainting')
  })
  test('returns every serial result and records per-image cost', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => response())
    const result = await new ProviderRegistry([provider(fetchFn)]).generate({ ...request, parameters: { ...request.parameters, count: 2 } }, context())
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(result.assets).toHaveLength(2)
    expect(result.usage).toMatchObject({ cost: 36, estimatedCostCny: 1.2 })
    expect(estimateArkImageEditCny({ width: 2048, height: 1152 }, 1)).toBe(0.3)
  })
  test.each([
    { referenceAssets: [] },
    { referenceAssets: [...request.referenceAssets, ...request.referenceAssets] },
    { prompt: ' ' },
    { parameters: { ...request.parameters, editX2: 99 } },
    { parameters: { ...request.parameters, editY2: 1000 } },
    { parameters: { ...request.parameters, editX1: 1.5 } },
    { parameters: { ...request.parameters, imageEditOperation: 'upscale' } },
    { parameters: { ...request.parameters, mask: 'data:image/png;base64,eA==' } },
    { parameters: { ...request.parameters, upscaleScale: '4x' } },
    { parameters: { ...request.parameters, resolution: '4K' } },
    { parameters: { ...request.parameters, count: 3 } },
    { parameters: { ...request.parameters, aspectRatio: '自定义', customWidth: 512, customHeight: 512 } },
  ])('rejects invalid or unsupported edit configuration before transport: %j', async (patch) => {
    const fetchFn = vi.fn<typeof fetch>()
    await expect(provider(fetchFn).generate({ ...request, ...patch }, context())).rejects.toThrow()
    expect(fetchFn).not.toHaveBeenCalled()
  })
  test.each([401, 403, 429, 500])('sanitizes upstream %s without credentials or payloads', async (status) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response({ error: { message: 'SECRET upstream private data' } }, status))
    await expect(provider(fetchFn).generate(request, context())).rejects.toThrow(String(status))
    await expect(provider(vi.fn<typeof fetch>().mockResolvedValue(response({}, status))).generate(request, context())).rejects.not.toThrow('SECRET')
  })
  test.each([
    { body: {}, status: 200, message: '未返回图片结果' },
    { body: { data: [{ url: 'javascript:alert(1)' }] }, status: 200, message: 'URL 无效' },
    { body: { error: { code: 'InputImageSensitiveContentDetected' } }, status: 400, message: '安全检查' },
  ])('handles invalid response safely: $message', async ({ body, status, message }) => {
    await expect(provider(vi.fn<typeof fetch>().mockResolvedValue(response(body, status))).generate(request, context())).rejects.toThrow(message)
  })
  test('sanitizes network and malformed JSON errors', async () => {
    await expect(provider(vi.fn<typeof fetch>().mockRejectedValue(new Error('SECRET'))).generate(request, context())).rejects.toThrow('网络异常')
    await expect(provider(vi.fn<typeof fetch>().mockResolvedValue(new Response('bad'))).generate(request, context())).rejects.toThrow('响应格式异常')
  })
  test('aborts on timeout, forwards explicit cancellation, never retries billable requests', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))))
    const pending = provider(fetchFn, { timeoutMs: 10 }).generate(request, context())
    const assertion = expect(pending).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(11)
    await assertion
    expect(fetchFn).toHaveBeenCalledOnce()
    const controller = new AbortController()
    controller.abort()
    await expect(provider(fetchFn).generate(request, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchFn).toHaveBeenCalledOnce()
  })
  test('requires explicit dev configuration and stays out of ordinary model menus', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    const registry = createDefaultProviderRegistry({ seedream: { ...arkImageEditConfigFixture, fetchFn } })
    expect(registry.require('ark-image-edit').disabledReason).toBeUndefined()
    expect(registry.menuProvidersFor(['image-edit', 'text-to-image']).map(({ id }) => id)).not.toContain('ark-image-edit')
    for (const options of [{ mode: 'mock' }, { apiKey: '' }]) {
      const disabled = provider(fetchFn, options)
      expect(disabled.disabledReason).toContain('配置未完成')
      await expect(disabled.generate(request, context())).rejects.toThrow('配置未完成')
    }
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
