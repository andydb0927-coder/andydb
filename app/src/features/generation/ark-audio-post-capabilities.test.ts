import { afterEach, describe, expect, test, vi } from 'vitest'
import { createDefaultProviderRegistry, isProviderEnabled } from './model-provider-registry'
import { GenerationQueue } from './generation-queue'
import { RegistryGenerationAdapter } from './registry-generation-adapter'
import { arkAudioPostFixtures, arkAudioPostRequestFixture } from './fixtures/ark-audio-post.fixture'

afterEach(() => vi.unstubAllGlobals())

describe('Ark audio post-processing boundaries (no live transport)', () => {
  test.each(arkAudioPostFixtures)('$name stays unavailable even with configured Ark credentials', async ({ id, capability, alternative }) => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected network call'))
    vi.stubGlobal('fetch', fetchFn)
    for (const mode of ['mock', 'seedream-direct-dev', 'ark-audio-dev']) {
      const options = { mode, apiKey: 'fixture-only-not-a-real-key', apiBase: 'https://fixture.ark.invalid/api/v3', fetchFn }
      const registry = createDefaultProviderRegistry({ arkTts: options, arkAudio: options, seedream: options })
      const provider = registry.require(id)
      expect(provider.kind).toBe('placeholder')
      expect(provider.capabilities).toEqual([capability])
      expect(provider.officialApiEndpoint).toBe(`pending://${id}`)
      expect(provider.disabledReason).toContain('当前 Ark 接口不支持')
      expect(provider.disabledReason).toContain(alternative)
      expect(isProviderEnabled(provider)).toBe(false)
      expect(registry.defaultFor(['audio'])?.id).not.toBe(id)

      const onProgress = vi.fn()
      const context = { signal: new AbortController().signal, onProgress }
      await expect(provider.generate(arkAudioPostRequestFixture(id), context)).rejects.toThrow(provider.disabledReason!)
      await expect(provider.export({ projectId: 'fixture-project', settings: { width: 1920, height: 1080, aspectRatio: '16:9', frameRate: 24, watermark: false } }, context)).rejects.toThrow(provider.disabledReason!)
      expect(onProgress).not.toHaveBeenCalled()
    }
    expect(fetchFn).not.toHaveBeenCalled()
  })

  test.each(arkAudioPostFixtures)('$name cannot create a history job or persist an invented result via the queue', async ({ id }) => {
    const onJobChange = vi.fn()
    const onSuccess = vi.fn()
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected network call'))
    vi.stubGlobal('fetch', fetchFn)
    const queue = new GenerationQueue({ adapter: new RegistryGenerationAdapter(createDefaultProviderRegistry()), onJobChange, onSuccess })
    try {
      // Tool menu placement does not grant the ordinary audio-generation capability.
      expect(() => queue.enqueue(arkAudioPostRequestFixture(id))).toThrow()
      await Promise.resolve()
      expect(onJobChange).not.toHaveBeenCalled()
      expect(onSuccess).not.toHaveBeenCalled()
      expect(fetchFn).not.toHaveBeenCalled()
    } finally {
      queue.dispose()
    }
  })

  test.each(arkAudioPostFixtures)('$name honors cancellation without network or results', async ({ id }) => {
    const controller = new AbortController()
    controller.abort()
    const provider = createDefaultProviderRegistry().require(id)
    await expect(provider.generate(arkAudioPostRequestFixture(id), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
