import { expect, test, vi } from 'vitest'
import { createArkSubjectExtractionProvider, parseSubjectDescription } from './ark-subject-extraction-provider'
import { createDefaultProviderRegistry } from './model-provider-registry'
import { arkFinalConfigFixture as config, subjectDescriptionFixture, subjectRequestFixture as request, subjectResponseFixture } from './fixtures/ark-final.fixture'

const context = () => ({ signal: new AbortController().signal })

test('sends a single image to the existing Chat transport and parses structured description with actual usage', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(subjectResponseFixture))
  const provider = createArkSubjectExtractionProvider({ ...config, fetchFn })
  const result = await provider.generate(request, context())
  expect(fetchFn).toHaveBeenCalledTimes(1)
  const [url, init] = fetchFn.mock.calls[0]
  expect(url).toBe(`${config.apiBase}/chat/completions`)
  expect(init?.headers).toMatchObject({ Authorization: 'Bearer fixture-final-key' })
  const body = JSON.parse(String(init?.body))
  expect(body).toMatchObject({ model: 'doubao-seed-2-1-pro-260628', stream: false, thinking: { type: 'disabled' }, temperature: 0.2, max_tokens: 1200 })
  expect(body.messages[1].content[0]).toEqual({ type: 'image_url', image_url: { url: request.referenceAssets[0].url } })
  expect(body.messages[0].content).toContain('不推断真实姓名')
  expect(parseSubjectDescription(result.version.textContent!)).toEqual(subjectDescriptionFixture)
  expect(result.usage).toMatchObject({ providerId: provider.id, inputTokens: 2000, outputTokens: 300, estimatedCostCny: 0.021 })
  expect(result.asset.kind).toBe('text')
})

test.each(['mock', ''])('never falls back to demo when configuration is unavailable (%s)', async mode => {
  const fetchFn = vi.fn<typeof fetch>()
  const registry = createDefaultProviderRegistry({ arkText: { ...config, mode, fetchFn } })
  const provider = registry.require('ai-subject-extraction')
  expect(provider).toMatchObject({ kind: 'live', selectorVisible: false, disabledReason: expect.stringContaining('配置未完成') })
  expect(registry.menuProvidersFor(['text'])).not.toContainEqual(expect.objectContaining({ id: provider.id }))
  await expect(provider.generate(request, context())).rejects.toThrow('配置未完成')
  expect(fetchFn).not.toHaveBeenCalled()
})

test.each(['blob:local', '/demo/image.png', 'http://example.com/source.png', 'https://user:pass@example.com/a.png', 'data:image/svg+xml;base64,PHN2Zz4='])('rejects unsafe or unsupported source %s without requests', async url => {
  const fetchFn = vi.fn<typeof fetch>()
  const provider = createArkSubjectExtractionProvider({ ...config, fetchFn })
  await expect(provider.generate({ ...request, referenceAssets: [{ ...request.referenceAssets[0], url }] }, context())).rejects.toThrow('图片')
  expect(fetchFn).not.toHaveBeenCalled()
})

test('accepts uploaded base64 and rejects missing, mismatched, oversized or non-image inputs', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(subjectResponseFixture))
  const provider = createArkSubjectExtractionProvider({ ...config, fetchFn })
  await provider.generate({ ...request, referenceAssets: [{ kind: 'image', mimeType: 'image/png', url: 'data:image/png;base64,YQ==' }] }, context())
  for (const references of [[], [{ kind: 'video' as const, mimeType: 'video/mp4', url: request.referenceAssets[0].url }], [{ kind: 'image' as const, mimeType: 'image/png', url: 'data:image/jpeg;base64,YQ==' }], [{ kind: 'image' as const, mimeType: 'image/png', url: `data:image/png;base64,${'A'.repeat(13_333_336)}` }]]) {
    await expect(provider.generate({ ...request, referenceAssets: references }, context())).rejects.toThrow('图片')
  }
  expect(fetchFn).toHaveBeenCalledTimes(1)
})

test.each(['{}', 'null', 'not json', '{"name":"x","appearance":"x","clothing":"x","tags":[1]}', JSON.stringify({ ...subjectDescriptionFixture, name: 'x'.repeat(81) })])('rejects incomplete or invalid output without inventing fields: %s', async content => {
  const provider = createArkSubjectExtractionProvider({ ...config, fetchFn: vi.fn(async () => Response.json({ choices: [{ message: { content } }] })) })
  await expect(provider.generate(request, context())).rejects.toThrow('主体提取结果格式')
})

test.each([401, 403, 429, 500])('sanitizes HTTP %s without leaking response or credentials', async status => {
  const provider = createArkSubjectExtractionProvider({ ...config, fetchFn: vi.fn(async () => new Response('fixture-final-key private-image-url', { status })) })
  await expect(provider.generate(request, context())).rejects.toThrow(/^主体提取/)
  await expect(provider.generate(request, context())).rejects.not.toThrow('fixture-final-key')
})

test.each(['timeout', 'abort'] as const)('stops in-flight analysis on %s without retry', async action => {
  vi.useFakeTimers()
  try {
    const controller = new AbortController()
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('secret', 'AbortError')))))
    const pending = createArkSubjectExtractionProvider({ ...config, fetchFn, timeoutMs: 25 }).generate(request, { signal: controller.signal })
    const assertion = action === 'timeout' ? expect(pending).rejects.toThrow('超时') : expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    if (action === 'abort') controller.abort()
    await vi.advanceTimersByTimeAsync(26)
    await assertion
    expect(fetchFn).toHaveBeenCalledTimes(1)
  } finally { vi.useRealTimers() }
})

test('keeps voice cloning disabled with Ark credentials and distinguishes the local prompt optimizer', async () => {
  const fetchFn = vi.fn<typeof fetch>()
  const registry = createDefaultProviderRegistry({ arkText: { ...config, fetchFn }, arkTts: { ...config, fetchFn } })
  const voice = registry.require('voice-clone-api')
  expect(voice).toMatchObject({ kind: 'placeholder', selectorVisible: false, capabilities: ['voice-clone'] })
  expect(voice.disabledReason).toMatch(/openspeech.*专用.*槽位/)
  await expect(voice.generate(request, context())).rejects.toThrow('待接入')
  expect(fetchFn).not.toHaveBeenCalled()
  expect(registry.require('seedance-prompt-optimization-api').disabledReason).toContain('未提供独立优化端点')
})
