import { afterEach, describe, expect, test, vi } from 'vitest'
import type { GenerationRequest } from './generation-adapter'
import { GenerationQueue } from './generation-queue'
import { ProviderRegistry, createDefaultProviderRegistry, managedAiPlaceholderCatalog, resolveVideoGenerationMode, providerGenerationCost } from './model-provider-registry'
import { RegistryGenerationAdapter } from './registry-generation-adapter'
import { resolveModelParameterManifest } from './model-parameter-semantics'
import { createFixtureProviderRegistry } from '../../test/provider-fixtures'

const imageRequest: GenerationRequest = { projectId: 'p', nodeId: 'n', operation: 'regenerate', targetKind: 'image', providerId: 'seedream-5-pro-api', prompt: '雨夜电影感人像', referenceAssets: [] }
afterEach(() => vi.useRealTimers())

describe('model provider registry', () => {
  test('compiles all manifests', () => {
    for (const p of createDefaultProviderRegistry().list()) expect(p.parameterSchema).toEqual(resolveModelParameterManifest(p.parameterManifest))
  })
  test.each([
    ['text-to-image', ['seedream-5-pro-api']], ['image-to-image', ['seedream-5-pro-api']],
    ['text-to-video', ['seedance-api']], ['image-to-video', ['seedance-api']],
    ['text', ['ark-text-llm']], ['audio', ['ark-tts', 'ark-audio-gen']],
  ] as const)('filters %s without legacy models', (capability, ids) => {
    expect(createDefaultProviderRegistry().matching([capability]).map(({ id }) => id)).toEqual(ids)
  })
  test('keeps Seedream size policy and per-image billing', () => {
    const p = createDefaultProviderRegistry().require('seedream-5-pro-api')
    expect(p.sizePolicy).toMatchObject({ multiImageStrategy: 'serial', costMode: { amount: 18, per: 'image' }, pixelConstraints: { minTotalPixels: 921600, maxTotalPixels: 4624220, minRatio: 1 / 16, maxRatio: 16 } })
    expect(p.parameterSchema.count).toMatchObject({ options: ['1', '2', '4'] })
    expect(p.parameterSchema.quality).toBeUndefined()
    expect(providerGenerationCost(p, { count: 4 })).toBe(72)
  })
  test('keeps official video parameters and modes', () => {
    const p = createDefaultProviderRegistry().require('seedance-api')
    expect(p.parameterSchema.duration).toMatchObject({ options: Array.from({ length: 12 }, (_, i) => String(i + 4)) })
    expect(p.parameterSchema.quality).toMatchObject({ defaultValue: '720P', options: ['480P', '720P', '1080P', '4K'] })
    expect(resolveVideoGenerationMode(p, '全能参考')).toBe('全能参考')
    expect(resolveVideoGenerationMode(p, '文生视频')).toBe('文生视频')
    expect(p.pricing.amount).toBe(135)
  })
  test('keeps text and audio pricing without demo variants', () => {
    const r = createDefaultProviderRegistry()
    expect(r.require('ark-text-llm').tokenPricing).toEqual({ inputPerMillionCny: 6, outputPerMillionCny: 30 })
    expect(r.require('ark-text-llm').variants).toBeUndefined()
    expect(r.require('ark-tts').variants).toBeUndefined()
    expect(providerGenerationCost(r.require('ark-tts'))).toBe(1)
    expect(providerGenerationCost(r.require('ark-audio-gen'), { duration: 12 })).toBe(12)
  })
  test.each(managedAiPlaceholderCatalog)('preserves $id reason and cost', (d) => {
    expect(createDefaultProviderRegistry().require(d.id)).toMatchObject({ kind: 'placeholder', menuCapabilities: d.menuCapabilities, disabledReason: d.disabledReason, capabilities: [d.capability], pricing: { amount: d.cost } })
  })
  test('migrates retired selections without silently executing them', () => {
    const r = createDefaultProviderRegistry()
    expect(r.defaultFor(['text-to-image'], 'mock-mj-image')?.id).toBe('seedream-5-pro-api')
    expect(r.defaultFor(['text-to-video'], 'mock-kling-o3')?.id).toBe('seedance-api')
    expect(r.defaultFor(['text'], 'internal-demo')?.id).toBe('ark-text-llm')
    expect(() => r.resolve({ ...imageRequest, providerId: 'mock-mj-image' })).toThrow('Unknown model provider')
  })
  test('rejects duplicate ids and unconfigured execution', async () => {
    const r = createDefaultProviderRegistry()
    expect(() => r.register(r.require('seedance-api'))).toThrow('Provider already registered')
    await expect(r.generate({ ...imageRequest, targetKind: 'video', providerId: 'seedance-api' }, { signal: new AbortController().signal })).rejects.toThrow('配置未完成')
  })
  test('dispatches intercepted real image requests and retains every result', async () => {
    const progress: number[] = []
    const result = await createFixtureProviderRegistry().generate({ ...imageRequest, parameters: { count: 2 } }, { signal: new AbortController().signal, onProgress: (p) => progress.push(p) })
    expect(result.assets).toHaveLength(2)
    expect(result.usage).toMatchObject({ providerId: 'seedream-5-pro-api', providerName: '火山方舟', modelName: 'Seedream 5.0 Pro', cost: 36 })
    expect(result.persistence).toBe('project')
    expect(progress.at(-1)).toBe(100)
  })
  test('propagates real identity and billing through queue history', async () => {
    const r = createFixtureProviderRegistry()
    const q = new GenerationQueue({ adapter: new RegistryGenerationAdapter(r), onJobChange: vi.fn(), onSuccess: vi.fn() })
    const job = q.enqueue(imageRequest)
    expect(job).toMatchObject({ providerId: 'seedream-5-pro-api', estimatedCost: 18 })
    await vi.waitFor(() => expect(q.get(job.id)).toMatchObject({ status: 'succeeded', creditsSpent: 18 }))
    q.dispose()
  })
  test('parses intercepted video output and metadata', async () => {
    const r = await createFixtureProviderRegistry().generate({ ...imageRequest, targetKind: 'video', providerId: 'seedance-api' }, { signal: new AbortController().signal })
    expect(r.asset).toMatchObject({ kind: 'video', durationSeconds: 5 })
    expect(r.usage).toMatchObject({ providerId: 'seedance-api', modelName: 'Seedance 2.0', cost: 135 })
  })
  test('dispatches deterministic generation only via an explicit internal id', async () => {
    vi.useFakeTimers()
    const progress: number[] = []
    const r = createDefaultProviderRegistry()
    const result = r.generate({ ...imageRequest, providerId: 'internal-demo' }, { signal: new AbortController().signal, onProgress: (p) => progress.push(p) })
    await vi.advanceTimersByTimeAsync(1200)
    await expect(result).resolves.toMatchObject({ usage: { providerId: 'internal-demo', cost: 0 } })
    expect(progress).toEqual([25, 55, 85, 100])
  })
  test('preserves local export without retired models', async () => {
    vi.useFakeTimers()
    const p = createDefaultProviderRegistry().export('internal-demo', { projectId: 'p', settings: { width: 1920, height: 1080, aspectRatio: '16:9', frameRate: 24, watermark: false } }, { signal: new AbortController().signal })
    await vi.advanceTimersByTimeAsync(1800)
    await expect(p).resolves.toMatchObject({ exportJobId: 'demo-export-p', downloadUrl: '/demo/exports/p.mp4', cost: 0 })
  })
  test('supports an empty registry', () => {
    const r = new ProviderRegistry()
    expect(r.list()).toEqual([])
    expect(() => r.require('missing')).toThrow('Unknown model provider: missing')
  })
})
