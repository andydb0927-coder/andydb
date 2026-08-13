import { describe, expect, test, vi } from 'vitest'

import type { GenerationRequest } from './generation-adapter'
import type { GenerationProviderPreferenceStore } from './generation-provider-preference'
import type { LibTvCatalog } from './libtv-contract'
import {
  fetchLibTvCatalog,
  LibTvGenerationAdapter,
} from './libtv-generation-adapter'

const selection = {
  projectUuid: '11111111-2222-3333-4444-555555555555',
  projectName: '低成本验收',
  imageModelKey: 'image-key',
  imageModelName: 'Image Model',
  videoModelKey: 'video-key',
  videoModelName: 'Video Model',
}

const catalog: LibTvCatalog = {
  cliInstalled: true,
  cliVersion: '1.1.1',
  authenticated: true,
  writesEnabled: true,
  projects: [{ uuid: selection.projectUuid, name: selection.projectName }],
  imageModels: [
    {
      modelKey: 'image-key',
      modelName: selection.imageModelName,
      description: '图片模型',
    },
  ],
  videoModels: [
    {
      modelKey: 'video-key',
      modelName: selection.videoModelName,
      description: '视频模型',
      pricingRule: '每次提交按服务端规则计费',
      vip: false,
    },
  ],
}

const imageRequest: GenerationRequest = {
  projectId: 'local-project',
  nodeId: 'local-node',
  operation: 'regenerate',
  targetKind: 'image',
  prompt: '雨夜人物特写',
  referenceAssets: [],
}

function preferenceStore(
  preference: ReturnType<GenerationProviderPreferenceStore['read']> = {
    provider: 'libtv',
    selection,
  },
): GenerationProviderPreferenceStore {
  return {
    read: () => preference,
    write: vi.fn(),
  }
}

function generatedResponse(
  body: Record<string, unknown> = {
    kind: 'image',
    url: 'https://assets.example.test/generated.png',
    mimeType: 'image/png',
    width: 1920,
    height: 1080,
  },
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function adapterOptions(fetchImpl: typeof fetch) {
  const ids = ['asset-local-1', 'version-local-1']
  return {
    preferenceStore: preferenceStore(),
    fetch: fetchImpl,
    origin: 'http://canvas.test',
    createId: () => ids.shift() ?? 'unexpected-extra-id',
    now: () => '2026-08-11T12:00:00.000Z',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('fetchLibTvCatalog', () => {
  test('uses the same-origin no-store endpoint and returns a fresh allowlisted catalog', async () => {
    const serverBody = {
      ...catalog,
      userEmail: 'private@example.test',
      token: 'PRIVATE_TOKEN',
      projects: [{ ...catalog.projects[0], ownerId: 'private-owner' }],
      imageModels: [{ ...catalog.imageModels[0], privateSchema: 'PRIVATE_SCHEMA' }],
    }
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(serverBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await fetchLibTvCatalog({ fetch: fetchImpl })

    expect(result).toEqual(catalog)
    expect(result).not.toBe(serverBody)
    expect(fetchImpl).toHaveBeenCalledWith('/api/libtv/catalog', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal: undefined,
    })
    expect(JSON.stringify(result)).not.toContain('PRIVATE_TOKEN')
    expect(JSON.stringify(result)).not.toContain('private@example.test')
  })

  test('replaces an untrusted catalog error and rejects malformed data with fixed messages', async () => {
    const unsafeErrorFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ ...catalog, error: 'PRIVATE_TOKEN account@example.test' }),
        { status: 200 },
      ),
    )
    const malformedFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...catalog, projects: [{ uuid: 42 }] }), {
        status: 200,
      }),
    )

    await expect(fetchLibTvCatalog({ fetch: unsafeErrorFetch })).resolves.toMatchObject({
      error: 'LibTV 目录当前不可用，请检查 CLI 状态后重试。',
    })
    await expect(fetchLibTvCatalog({ fetch: malformedFetch })).rejects.toThrow(
      'LibTV 目录响应无效，请重试。',
    )
  })
})

describe('LibTvGenerationAdapter', () => {
  test('rejects Demo or malformed current preferences without issuing a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const demoAdapter = new LibTvGenerationAdapter({
      ...adapterOptions(fetchImpl),
      preferenceStore: preferenceStore({ provider: 'demo' }),
    })
    const malformedAdapter = new LibTvGenerationAdapter({
      ...adapterOptions(fetchImpl),
      preferenceStore: preferenceStore({
        provider: 'libtv',
        selection: { ...selection, imageModelName: '' },
      }),
    })

    await expect(
      demoAdapter.start(imageRequest, new AbortController().signal),
    ).rejects.toThrow('请先在画布的模型设置中启用 LibTV 实际生成。')
    await expect(
      malformedAdapter.start(imageRequest, new AbortController().signal),
    ).rejects.toThrow('请先在画布的模型设置中启用 LibTV 实际生成。')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('passes a validated base64 Data URL unchanged and maps output with fresh local identity', async () => {
    const dataUrl = 'data:image/png;base64,AQIDBA=='
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      generatedResponse({
        kind: 'image',
        url: 'https://assets.example.test/generated.png',
        mimeType: 'image/png',
        width: 1920,
        height: 1080,
        poster: 'PRIVATE_POSTER',
        privateTaskEnvelope: 'PRIVATE_TASK',
      }),
    )
    const adapter = new LibTvGenerationAdapter(adapterOptions(fetchImpl))
    const request = {
      ...imageRequest,
      referenceAssets: [
        { url: dataUrl, kind: 'image' as const, mimeType: 'image/png' },
      ],
    }

    const result = await adapter.start(request, new AbortController().signal)

    expect(result).toEqual({
      asset: {
        id: 'asset-local-1',
        kind: 'image',
        url: 'https://assets.example.test/generated.png',
        mimeType: 'image/png',
        width: 1920,
        height: 1080,
      },
      version: {
        id: 'version-local-1',
        createdAt: '2026-08-11T12:00:00.000Z',
        prompt: '雨夜人物特写',
        assetId: 'asset-local-1',
      },
    })
    const postBody = JSON.parse(
      String((fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    )
    expect(postBody).toEqual({
      confirmed: true,
      selection,
      request: {
        ...imageRequest,
        referenceAssets: [
          { dataUrl, kind: 'image', mimeType: 'image/png' },
        ],
      },
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/libtv/generate',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    )
    expect(JSON.stringify(result)).not.toContain('PRIVATE')
  })

  test.each([
    ['relative', '/assets/reference.png'],
    ['same-origin', 'http://canvas.test/assets/reference.png'],
  ])('fetches and base64-encodes a %s reference URL before POST', async (_case, url) => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'content-type': 'image/png', 'content-length': '4' },
        }),
      )
      .mockResolvedValueOnce(generatedResponse())
    const adapter = new LibTvGenerationAdapter(adapterOptions(fetchImpl))

    await adapter.start(
      {
        ...imageRequest,
        referenceAssets: [{ url, kind: 'image', mimeType: 'image/png' }],
      },
      new AbortController().signal,
    )

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'http://canvas.test/assets/reference.png',
    )
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      cache: 'no-store',
      credentials: 'same-origin',
    })
    const postBody = JSON.parse(
      String((fetchImpl.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    )
    expect(postBody.request.referenceAssets).toEqual([
      {
        dataUrl: 'data:image/png;base64,AQIDBA==',
        kind: 'image',
        mimeType: 'image/png',
      },
    ])
  })

  test('completes every reference fetch before issuing the generation POST', async () => {
    const firstReference = deferred<Response>()
    const fetchImpl = vi.fn<typeof fetch>((input) => {
      const url = String(input)
      if (url.endsWith('/first.png')) return firstReference.promise
      if (url.endsWith('/second.png')) {
        return Promise.resolve(
          new Response(new Uint8Array([2]), {
            status: 200,
            headers: { 'content-type': 'image/png' },
          }),
        )
      }
      return Promise.resolve(generatedResponse())
    })
    const adapter = new LibTvGenerationAdapter(adapterOptions(fetchImpl))
    const generation = adapter.start(
      {
        ...imageRequest,
        referenceAssets: [
          { url: '/first.png', kind: 'image', mimeType: 'image/png' },
          { url: '/second.png', kind: 'image', mimeType: 'image/png' },
        ],
      },
      new AbortController().signal,
    )

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
    expect(fetchImpl.mock.calls.some(([url]) => url === '/api/libtv/generate')).toBe(false)
    firstReference.resolve(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    )
    await generation

    expect(fetchImpl.mock.calls[2]?.[0]).toBe('/api/libtv/generate')
  })

  test('rejects a cross-origin reference before any reference or generation fetch', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const adapter = new LibTvGenerationAdapter(adapterOptions(fetchImpl))

    await expect(
      adapter.start(
        {
          ...imageRequest,
          referenceAssets: [
            {
              url: 'https://remote.example.test/private.png',
              kind: 'image',
              mimeType: 'image/png',
            },
          ],
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('LibTV 参考素材必须使用相对地址或当前站点地址。')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('uses fixed reference errors for CORS, MIME mismatch, and oversized responses', async () => {
    const corsFetch = vi.fn<typeof fetch>().mockRejectedValue(
      new TypeError('PRIVATE_TOKEN CORS path=/private/reference.png'),
    )
    const mimeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      }),
    )
    const sizeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': String(20 * 1024 * 1024 + 1),
        },
      }),
    )
    const request = {
      ...imageRequest,
      referenceAssets: [
        { url: '/reference.png', kind: 'image' as const, mimeType: 'image/png' },
      ],
    }

    await expect(
      new LibTvGenerationAdapter(adapterOptions(corsFetch)).start(
        request,
        new AbortController().signal,
      ),
    ).rejects.toThrow('无法读取 LibTV 参考素材，请确认素材仍可访问。')
    await expect(
      new LibTvGenerationAdapter(adapterOptions(mimeFetch)).start(
        request,
        new AbortController().signal,
      ),
    ).rejects.toThrow('LibTV 参考素材类型不受支持或与素材种类不匹配。')
    await expect(
      new LibTvGenerationAdapter(adapterOptions(sizeFetch)).start(
        request,
        new AbortController().signal,
      ),
    ).rejects.toThrow('LibTV 单个参考素材不能超过 20 MiB。')
  })

  test('preserves AbortError identity from a reference fetch', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(abortError)
    const adapter = new LibTvGenerationAdapter(adapterOptions(fetchImpl))

    await expect(
      adapter.start(
        {
          ...imageRequest,
          referenceAssets: [
            { url: '/reference.png', kind: 'image', mimeType: 'image/png' },
          ],
        },
        new AbortController().signal,
      ),
    ).rejects.toBe(abortError)
  })

  test('stops reading a reference stream once its actual bytes exceed 20 MiB', async () => {
    let pulls = 0
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (pulls > 330) {
          controller.close()
          return
        }
        controller.enqueue(new Uint8Array(64 * 1024))
      },
      cancel() {
        cancelled = true
      },
    })
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': '1',
        },
      }),
    )
    const adapter = new LibTvGenerationAdapter(adapterOptions(fetchImpl))

    await expect(
      adapter.start(
        {
          ...imageRequest,
          referenceAssets: [
            { url: '/lying-size.png', kind: 'image', mimeType: 'image/png' },
          ],
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('LibTV 单个参考素材不能超过 20 MiB。')
    expect(cancelled).toBe(true)
    // The stream may prefetch one chunk, but the adapter retains at most 20 MiB.
    expect(pulls).toBeLessThanOrEqual(322)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('maps a structured non-2xx bridge response to a fixed actionable error', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'WRITES_DISABLED',
            message: 'PRIVATE_TOKEN account@example.test /private/path',
          },
        }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      ),
    )
    const adapter = new LibTvGenerationAdapter(adapterOptions(fetchImpl))

    await expect(
      adapter.start(imageRequest, new AbortController().signal),
    ).rejects.toThrow('LibTV 写入未启用，请在画布的模型设置中检查写入门禁。')
    await adapter
      .start(imageRequest, new AbortController().signal)
      .catch((error: unknown) => {
        expect(String(error)).not.toContain('PRIVATE_TOKEN')
        expect(String(error)).not.toContain('/private/path')
      })
  })

  test('preserves AbortError identity while reading a non-2xx bridge body', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    const body = new ReadableStream<Uint8Array>({
      pull() {
        throw abortError
      },
    })
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const adapter = new LibTvGenerationAdapter(adapterOptions(fetchImpl))

    await expect(
      adapter.start(imageRequest, new AbortController().signal),
    ).rejects.toBe(abortError)
  })

  test.each([
    ['image', 'image/*', imageRequest],
    [
      'video',
      'video/*',
      {
        ...imageRequest,
        operation: 'generate-video' as const,
        targetKind: 'video' as const,
      },
    ],
  ])('accepts the real bridge %s wildcard MIME contract', async (kind, mimeType, request) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      generatedResponse({
        kind,
        url: `https://assets.example.test/generated.${kind === 'image' ? 'png' : 'mp4'}`,
        mimeType,
      }),
    )
    const adapter = new LibTvGenerationAdapter(adapterOptions(fetchImpl))

    await expect(
      adapter.start(request, new AbortController().signal),
    ).resolves.toMatchObject({ asset: { kind, mimeType } })
  })

  test('allowlists request fields before serializing the generation POST', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(generatedResponse())
    const adapter = new LibTvGenerationAdapter(adapterOptions(fetchImpl))
    const request = {
      ...imageRequest,
      privateToken: 'PRIVATE_TOKEN',
      accountEmail: 'private@example.test',
    } as GenerationRequest

    await adapter.start(request, new AbortController().signal)

    const postBody = JSON.parse(
      String((fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    )
    expect(postBody.request).toEqual(imageRequest)
    expect(JSON.stringify(postBody)).not.toContain('PRIVATE_TOKEN')
    expect(JSON.stringify(postBody)).not.toContain('private@example.test')
  })

  test.each([
    ['wrong kind', { kind: 'video', url: 'https://assets.example.test/out.mp4', mimeType: 'video/mp4' }],
    ['cross-origin scheme', { kind: 'image', url: 'data:image/png;base64,AQID', mimeType: 'image/png' }],
    ['mismatched MIME', { kind: 'image', url: 'https://assets.example.test/out.png', mimeType: 'video/mp4' }],
    ['invalid optional number', { kind: 'image', url: 'https://assets.example.test/out.png', mimeType: 'image/png', width: -1 }],
  ])('rejects an invalid bridge result: %s', async (_case, body) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(generatedResponse(body))
    const adapter = new LibTvGenerationAdapter(adapterOptions(fetchImpl))

    await expect(
      adapter.start(imageRequest, new AbortController().signal),
    ).rejects.toThrow('LibTV 生成结果无效，请重试。')
  })

  test('preserves video target and selected model names in the exact POST body', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      generatedResponse({
        kind: 'video',
        url: 'https://assets.example.test/generated.mp4',
        mimeType: 'video/mp4',
        durationSeconds: 4.5,
      }),
    )
    const adapter = new LibTvGenerationAdapter(adapterOptions(fetchImpl))
    const videoRequest: GenerationRequest = {
      ...imageRequest,
      operation: 'generate-video',
      targetKind: 'video',
    }

    const result = await adapter.start(videoRequest, new AbortController().signal)

    const postBody = JSON.parse(
      String((fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    )
    expect(postBody.selection).toEqual(selection)
    expect(postBody.request.targetKind).toBe('video')
    expect(result.asset).toMatchObject({
      kind: 'video',
      mimeType: 'video/mp4',
      durationSeconds: 4.5,
    })
  })
})
