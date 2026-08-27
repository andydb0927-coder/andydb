import { describe, expect, test, vi } from 'vitest'
import {
  createDefaultProviderRegistry,
  groupProvidersForMenu,
  isProviderEnabled,
  managedAiPlaceholderCatalog,
} from './model-provider-registry'

describe('public model catalog without demo models', () => {
  test('offers only the five official Ark providers and retains the managed placeholders', () => {
    const registry = createDefaultProviderRegistry()
    const visible = registry.matching(['text-to-image', 'image-to-image', 'text-to-video', 'image-to-video', 'text', 'audio'])
    expect(visible.map(({ id }) => id)).toEqual([
      'seedream-5-pro-api', 'seedance-api', 'ark-text-llm', 'ark-tts', 'ark-audio-gen',
    ])
    expect(visible.every(({ kind }) => kind !== 'demo')).toBe(true)
    expect(visible.every((provider) => !isProviderEnabled(provider) && provider.disabledReason)).toBe(true)
    for (const { id } of managedAiPlaceholderCatalog) {
      expect(registry.require(id).kind).toBe('placeholder')
    }
    expect(registry.list().filter(({ kind }) => kind === 'demo')).toEqual([
      expect.objectContaining({ id: 'internal-demo', selectorVisible: false }),
    ])
  })

  test('cannot leak a hidden test provider through any model menu group', () => {
    const registry = createDefaultProviderRegistry()
    const menuProviders = groupProvidersForMenu(registry.list()).flatMap(({ providers }) => providers)
    expect(menuProviders.every(({ selectorVisible, kind }) => selectorVisible !== false && kind !== 'demo')).toBe(true)
    expect(menuProviders.filter(({ kind }) => kind === 'placeholder')).toHaveLength(12)
  })

  test('keeps image presets addressable without adding them to the image model menu', () => {
    const registry = createDefaultProviderRegistry()
    const imageMenu = registry.menuProvidersFor(['text-to-image', 'image-to-image'])
    expect(imageMenu.map(({ id }) => id)).toEqual(['seedream-5-pro-api'])
    for (const id of ['panorama-720-api', 'multi-camera-grid-api', 'plot-four-grid-api', 'storyboard-25-grid-api', 'cinematic-lighting-api', 'setting-image-api']) {
      expect(registry.require(id)).toMatchObject({ kind: 'placeholder', menuCapabilities: [] })
      expect(isProviderEnabled(registry.require(id))).toBe(false)
    }
    expect(registry.defaultFor(['text-to-image'])?.id).toBe('seedream-5-pro-api')
    expect(registry.matching(['text-to-image'])).toHaveLength(1)
  })

  test.each(['image', 'video', 'text', 'audio'] as const)('does not fall back to demo generation for %s without configuration', async (targetKind) => {
    const registry = createDefaultProviderRegistry()
    const request = { projectId: 'p', nodeId: 'n', operation: 'regenerate' as const, targetKind, prompt: 'test', referenceAssets: [] }
    expect(registry.resolve(request).kind).toBe('live')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(registry.generate(request, { signal: new AbortController().signal })).rejects.toThrow(/配置未完成|未启用/)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
