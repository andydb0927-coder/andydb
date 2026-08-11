import { describe, expect, test, vi } from 'vitest'

import type {
  GenerationAdapter,
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'
import type { GenerationProviderPreferenceStore } from './generation-provider-preference'
import { RuntimeGenerationAdapter } from './runtime-generation-adapter'

const request: GenerationRequest = {
  projectId: 'project-frost-river',
  nodeId: 'shot-1',
  operation: 'regenerate',
  targetKind: 'image',
  prompt: '近景，人物望向河面',
  referenceAssets: [],
}

function result(id: string): GenerationResult {
  return {
    asset: {
      id: `asset-${id}`,
      kind: 'image',
      url: `/generated/${id}.png`,
      mimeType: 'image/png',
    },
    version: {
      id: `version-${id}`,
      createdAt: '2026-08-11T00:00:00.000Z',
      prompt: request.prompt,
      assetId: `asset-${id}`,
    },
  }
}

function adapter(start: GenerationAdapter['start']): GenerationAdapter {
  return { start }
}

describe('runtime generation adapter', () => {
  test('uses Demo only when the persisted provider is Demo', async () => {
    const demoStart = vi.fn<GenerationAdapter['start']>().mockResolvedValue(result('demo'))
    const libtvStart = vi.fn<GenerationAdapter['start']>().mockResolvedValue(result('libtv'))
    const preferenceStore: GenerationProviderPreferenceStore = {
      read: () => ({ provider: 'demo' }),
      write: () => {},
    }
    const runtime = new RuntimeGenerationAdapter(
      preferenceStore,
      adapter(demoStart),
      adapter(libtvStart),
    )

    await expect(runtime.start(request, new AbortController().signal)).resolves.toEqual(
      result('demo'),
    )
    expect(demoStart).toHaveBeenCalledTimes(1)
    expect(libtvStart).not.toHaveBeenCalled()
  })

  test('uses LibTV only when the persisted provider is LibTV', async () => {
    const demoStart = vi.fn<GenerationAdapter['start']>().mockResolvedValue(result('demo'))
    const libtvStart = vi.fn<GenerationAdapter['start']>().mockResolvedValue(result('libtv'))
    const preferenceStore: GenerationProviderPreferenceStore = {
      read: () => ({
        provider: 'libtv',
        selection: {
          projectUuid: '11111111-2222-3333-4444-555555555555',
          projectName: '低成本验收',
          imageModelName: 'Image Model',
          videoModelName: 'Video Model',
        },
      }),
      write: () => {},
    }
    const runtime = new RuntimeGenerationAdapter(
      preferenceStore,
      adapter(demoStart),
      adapter(libtvStart),
    )

    await expect(runtime.start(request, new AbortController().signal)).resolves.toEqual(
      result('libtv'),
    )
    expect(libtvStart).toHaveBeenCalledTimes(1)
    expect(demoStart).not.toHaveBeenCalled()
  })

  test('returns a LibTV error without falling back to Demo', async () => {
    const demoStart = vi.fn<GenerationAdapter['start']>().mockResolvedValue(result('demo'))
    const libtvStart = vi
      .fn<GenerationAdapter['start']>()
      .mockRejectedValue(new Error('LibTV unavailable'))
    const preferenceStore: GenerationProviderPreferenceStore = {
      read: () => ({
        provider: 'libtv',
        selection: {
          projectUuid: '11111111-2222-3333-4444-555555555555',
          projectName: '低成本验收',
          imageModelName: 'Image Model',
          videoModelName: 'Video Model',
        },
      }),
      write: () => {},
    }
    const runtime = new RuntimeGenerationAdapter(
      preferenceStore,
      adapter(demoStart),
      adapter(libtvStart),
    )

    await expect(runtime.start(request, new AbortController().signal)).rejects.toThrow(
      'LibTV unavailable',
    )
    expect(libtvStart).toHaveBeenCalledTimes(1)
    expect(demoStart).not.toHaveBeenCalled()
  })
})
