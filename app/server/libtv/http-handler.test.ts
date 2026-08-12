// @vitest-environment node

import { afterEach, describe, expect, test, vi } from 'vitest'

import type { LibTvCatalog } from '../../src/features/generation/libtv-contract.js'
import type { CliRunner, LibTvGeneratedAsset } from './types.js'
import { createLibTvHttpHandler } from './http-handler.js'

const MAX_BODY_BYTES = 90 * 1024 * 1024

const catalog: LibTvCatalog = {
  cliInstalled: true,
  cliVersion: '1.1.1',
  authenticated: true,
  writesEnabled: true,
  projects: [
    { uuid: '11111111-2222-3333-4444-555555555555', name: '低成本验收' },
  ],
  imageModels: [
    {
      modelKey: 'image-key',
      modelName: 'Image Model',
      description: '图片',
    },
  ],
  videoModels: [
    {
      modelKey: 'video-key',
      modelName: 'Video Model',
      description: '视频',
      pricingRule: '以提交为准',
      vip: false,
    },
  ],
}

const generatedAsset: LibTvGeneratedAsset = {
  kind: 'image',
  url: 'https://assets.example.test/generated.png',
  mimeType: 'image/png',
  width: 1920,
  height: 1080,
}

function createRunner(): CliRunner {
  return {
    run: vi.fn<CliRunner['run']>().mockRejectedValue(
      new Error('real CLI must never run in HTTP tests'),
    ),
  }
}

function generationBody(): Record<string, unknown> {
  return {
    confirmed: true,
    selection: {
      projectUuid: '11111111-2222-3333-4444-555555555555',
      projectName: '低成本验收',
      imageModelName: 'Image Model',
      videoModelName: 'Video Model',
    },
    request: {
      projectId: 'local-project',
      nodeId: 'local-node',
      operation: 'regenerate',
      targetKind: 'image',
      prompt: '雨夜人物特写',
      referenceAssets: [],
    },
  }
}

function postRequest(
  body: string | ReadableStream<Uint8Array>,
  headers: Record<string, string> | Headers = { 'content-type': 'application/json' },
): Request {
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  }
  return new Request('http://localhost/api/libtv/generate', init)
}

async function responseJson(response: Response): Promise<unknown> {
  return response.json() as Promise<unknown>
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LibTV HTTP handler', () => {
  test('returns only allowlisted catalog fields with no-store caching', async () => {
    const runner = createRunner()
    const loadCatalog = vi.fn().mockResolvedValue({
      ...catalog,
      userEmail: 'private@example.test',
      token: 'PRIVATE_TOKEN',
      projects: [{ ...catalog.projects[0], ownerId: 'private-owner' }],
      imageModels: [{ ...catalog.imageModels[0], privateSchema: 'secret' }],
    })
    const handler = createLibTvHttpHandler({
      runner,
      writesEnabled: true,
      loadCatalog,
    })

    const response = await handler(
      new Request('http://localhost/api/libtv/catalog'),
    )

    expect(response).toBeInstanceOf(Response)
    expect(response?.status).toBe(200)
    expect(response?.headers.get('cache-control')).toBe('no-store')
    expect(await responseJson(response!)).toEqual(catalog)
    expect(runner.run).not.toHaveBeenCalled()
  })

  test.each([
    ['/api/libtv/catalog', 'POST', 'GET'],
    ['/api/libtv/generate', 'GET', 'POST'],
  ])('returns 405 for %s with the wrong method', async (path, method, allow) => {
    const handler = createLibTvHttpHandler({
      runner: createRunner(),
      writesEnabled: true,
    })

    const response = await handler(new Request(`http://localhost${path}`, { method }))

    expect(response?.status).toBe(405)
    expect(response?.headers.get('allow')).toBe(allow)
    expect(await responseJson(response!)).toEqual({
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
    })
  })

  test('delegates an unknown path without loading catalog or running the CLI', async () => {
    const runner = createRunner()
    const loadCatalog = vi.fn()
    const executeGeneration = vi.fn()
    const handler = createLibTvHttpHandler({
      runner,
      writesEnabled: true,
      loadCatalog,
      executeGeneration,
    })

    await expect(
      handler(new Request('http://localhost/api/libtv/private?token=secret')),
    ).resolves.toBeUndefined()
    expect(loadCatalog).not.toHaveBeenCalled()
    expect(executeGeneration).not.toHaveBeenCalled()
    expect(runner.run).not.toHaveBeenCalled()
  })

  test('rejects generation while writes are disabled before any dependency call', async () => {
    const runner = createRunner()
    const loadCatalog = vi.fn()
    const executeGeneration = vi.fn()
    const handler = createLibTvHttpHandler({
      runner,
      writesEnabled: false,
      loadCatalog,
      executeGeneration,
    })
    const secretBody = JSON.stringify({
      ...generationBody(),
      token: 'PRIVATE_BODY_TOKEN',
    })

    const response = await handler(
      postRequest(secretBody, {
        'content-type': 'application/json',
        'x-private-header': 'PRIVATE_HEADER_TOKEN',
      }),
    )

    expect(response?.status).toBe(403)
    const responseText = await response!.text()
    expect(JSON.parse(responseText)).toEqual({
      error: { code: 'WRITES_DISABLED', message: 'LibTV writes are disabled' },
    })
    expect(responseText).not.toContain('PRIVATE_BODY_TOKEN')
    expect(responseText).not.toContain('PRIVATE_HEADER_TOKEN')
    expect(loadCatalog).not.toHaveBeenCalled()
    expect(executeGeneration).not.toHaveBeenCalled()
    expect(runner.run).not.toHaveBeenCalled()
  })

  test('requires application/json before reading the body', async () => {
    const marker = new Uint8Array([42])
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(marker)
        controller.close()
      },
    })
    const handler = createLibTvHttpHandler({
      runner: createRunner(),
      writesEnabled: true,
    })

    const response = await handler(
      postRequest(body, { 'content-type': 'text/plain' }),
    )

    expect(response?.status).toBe(415)
    await expect(body.getReader().read()).resolves.toEqual({
      done: false,
      value: marker,
    })
    expect(await responseJson(response!)).toEqual({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content-Type must be application/json',
      },
    })
  })

  test.each([
    'application/json; charset=iso-8859-1',
    'application/json; charset',
    'application/json; profile=example',
    'application/json; charset=utf-8; profile=example',
    'application/json; charset=utf-8; charset=utf-8',
  ])('rejects unsupported or extra JSON media type parameters: %s', async (contentType) => {
    const loadCatalog = vi.fn()
    const executeGeneration = vi.fn()
    const handler = createLibTvHttpHandler({
      runner: createRunner(),
      writesEnabled: true,
      loadCatalog,
      executeGeneration,
    })

    const response = await handler(
      postRequest(JSON.stringify(generationBody()), {
        'content-type': contentType,
      }),
    )

    expect(response?.status).toBe(415)
    expect(await responseJson(response!)).toEqual({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content-Type must be application/json',
      },
    })
    expect(loadCatalog).not.toHaveBeenCalled()
    expect(executeGeneration).not.toHaveBeenCalled()
  })

  test.each([
    'application/json',
    'Application/JSON; Charset=UTF-8',
    'application/json ; charset = utf-8',
  ])('accepts only bare JSON or one UTF-8 charset parameter: %s', async (contentType) => {
    const executeGeneration = vi.fn().mockResolvedValue(generatedAsset)
    const handler = createLibTvHttpHandler({
      runner: createRunner(),
      writesEnabled: true,
      loadCatalog: vi.fn().mockResolvedValue(catalog),
      executeGeneration,
    })

    const response = await handler(
      postRequest(JSON.stringify(generationBody()), {
        'content-type': contentType,
      }),
    )

    expect(response?.status).toBe(200)
    expect(executeGeneration).toHaveBeenCalledTimes(1)
  })

  test('fast-rejects an oversized Content-Length before pulling the body stream', async () => {
    const marker = new Uint8Array([42])
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(marker)
        controller.close()
      },
    })
    const handler = createLibTvHttpHandler({
      runner: createRunner(),
      writesEnabled: true,
    })

    const response = await handler(
      postRequest(body, {
        'content-type': 'application/json',
        'content-length': String(MAX_BODY_BYTES + 1),
      }),
    )

    expect(response?.status).toBe(413)
    await expect(body.getReader().read()).resolves.toEqual({
      done: false,
      value: marker,
    })
    expect(await responseJson(response!)).toEqual({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds 90 MiB',
      },
    })
  })

  test.each([
    ['negative', '-1', 400, 'INVALID_CONTENT_LENGTH'],
    ['overflowing', '999999999999999999999999999999', 413, 'PAYLOAD_TOO_LARGE'],
  ])(
    'rejects a %s Content-Length before consuming the body',
    async (_name, contentLength, status, code) => {
      const marker = new Uint8Array([42])
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(marker)
          controller.close()
        },
      })
      const handler = createLibTvHttpHandler({
        runner: createRunner(),
        writesEnabled: true,
      })

      const response = await handler(
        postRequest(body, {
          'content-type': 'application/json',
          'content-length': contentLength,
        }),
      )

      expect(response?.status).toBe(status)
      expect((await responseJson(response!)) as { error: { code: string } }).toMatchObject({
        error: { code },
      })
      await expect(body.getReader().read()).resolves.toEqual({
        done: false,
        value: marker,
      })
    },
  )

  test('rejects duplicate Content-Length values before consuming the body', async () => {
    const marker = new Uint8Array([42])
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(marker)
        controller.close()
      },
    })
    const headers = new Headers({ 'content-type': 'application/json' })
    headers.append('content-length', '1')
    headers.append('content-length', '2')
    const handler = createLibTvHttpHandler({
      runner: createRunner(),
      writesEnabled: true,
    })

    const response = await handler(postRequest(body, headers))

    expect(response?.status).toBe(400)
    expect(await responseJson(response!)).toEqual({
      error: { code: 'INVALID_CONTENT_LENGTH', message: 'Content-Length is invalid' },
    })
    await expect(body.getReader().read()).resolves.toEqual({
      done: false,
      value: marker,
    })
  })

  test('stops a chunked body once streamed bytes exceed 90 MiB', async () => {
    const oversizedChunk = new Uint8Array(MAX_BODY_BYTES + 1)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversizedChunk)
      },
      cancel() {
        throw new Error('PRIVATE_CANCEL_FAILURE')
      },
    })
    const runner = createRunner()
    const loadCatalog = vi.fn()
    const executeGeneration = vi.fn()
    const handler = createLibTvHttpHandler({
      runner,
      writesEnabled: true,
      loadCatalog,
      executeGeneration,
    })

    const response = await handler(postRequest(body))

    expect(response?.status).toBe(413)
    expect(await responseJson(response!)).toEqual({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds 90 MiB',
      },
    })
    expect(loadCatalog).not.toHaveBeenCalled()
    expect(executeGeneration).not.toHaveBeenCalled()
    expect(runner.run).not.toHaveBeenCalled()
  })

  test('does not retain one object per single-byte request chunk', async () => {
    const encodedBody = new TextEncoder().encode(JSON.stringify(generationBody()))
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of encodedBody) {
          controller.enqueue(new Uint8Array([byte]))
        }
        controller.close()
      },
    })
    const originalConcat = Buffer.concat.bind(Buffer)
    vi.spyOn(Buffer, 'concat').mockImplementation((chunks, totalLength) => {
      if (chunks.length > 64) {
        throw new Error('request retained one object per chunk')
      }
      return originalConcat(chunks, totalLength)
    })
    const executeGeneration = vi.fn().mockResolvedValue(generatedAsset)
    const handler = createLibTvHttpHandler({
      runner: createRunner(),
      writesEnabled: true,
      loadCatalog: vi.fn().mockResolvedValue(catalog),
      executeGeneration,
    })

    const response = await handler(postRequest(body))

    expect(response?.status).toBe(200)
    expect(await responseJson(response!)).toEqual(generatedAsset)
    expect(executeGeneration).toHaveBeenCalledTimes(1)
  })

  test('ignores zero-length request chunks instead of retaining them', async () => {
    const encodedBody = new TextEncoder().encode(JSON.stringify(generationBody()))
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 1_000; index += 1) {
          controller.enqueue(new Uint8Array())
        }
        controller.enqueue(encodedBody)
        controller.close()
      },
    })
    const originalConcat = Buffer.concat.bind(Buffer)
    vi.spyOn(Buffer, 'concat').mockImplementation((chunks, totalLength) => {
      if (chunks.length > 64) {
        throw new Error('request retained zero-length chunks')
      }
      return originalConcat(chunks, totalLength)
    })
    const executeGeneration = vi.fn().mockResolvedValue(generatedAsset)
    const handler = createLibTvHttpHandler({
      runner: createRunner(),
      writesEnabled: true,
      loadCatalog: vi.fn().mockResolvedValue(catalog),
      executeGeneration,
    })

    const response = await handler(postRequest(body))

    expect(response?.status).toBe(200)
    expect(await responseJson(response!)).toEqual(generatedAsset)
    expect(executeGeneration).toHaveBeenCalledTimes(1)
  })

  test('returns a fixed structured error for malformed JSON without leaking input', async () => {
    const runner = createRunner()
    const loadCatalog = vi.fn()
    const executeGeneration = vi.fn()
    const handler = createLibTvHttpHandler({
      runner,
      writesEnabled: true,
      loadCatalog,
      executeGeneration,
    })

    const response = await handler(
      postRequest('{"token":"PRIVATE_JSON_TOKEN",'),
    )

    expect(response?.status).toBe(400)
    const responseText = await response!.text()
    expect(JSON.parse(responseText)).toEqual({
      error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' },
    })
    expect(responseText).not.toContain('PRIVATE_JSON_TOKEN')
    expect(loadCatalog).not.toHaveBeenCalled()
    expect(executeGeneration).not.toHaveBeenCalled()
    expect(runner.run).not.toHaveBeenCalled()
  })

  test('returns only allowlisted generated asset fields on success', async () => {
    const runner = createRunner()
    const loadCatalog = vi.fn().mockResolvedValue(catalog)
    const executeGeneration = vi.fn().mockResolvedValue({
      ...generatedAsset,
      privateTaskEnvelope: 'PRIVATE_TASK_TOKEN',
    })
    const handler = createLibTvHttpHandler({
      runner,
      writesEnabled: true,
      loadCatalog,
      executeGeneration,
      fileWorkspace: '/tmp/libtv-http-test',
    })

    const response = await handler(
      postRequest(JSON.stringify(generationBody())),
    )

    expect(response?.status).toBe(200)
    expect(response?.headers.get('cache-control')).toBe('no-store')
    expect(await responseJson(response!)).toEqual(generatedAsset)
    expect(executeGeneration).toHaveBeenCalledWith(
      generationBody(),
      catalog,
      runner,
      '/tmp/libtv-http-test',
    )
    expect(runner.run).not.toHaveBeenCalled()
  })

  test('maps unexpected dependency failures to a fixed 500 without leaking details', async () => {
    const runner = createRunner()
    const loadCatalog = vi.fn().mockRejectedValue(
      new Error('PRIVATE_TOKEN prompt path=/private/tmp/reference.png'),
    )
    const handler = createLibTvHttpHandler({
      runner,
      writesEnabled: true,
      loadCatalog,
    })

    const response = await handler(
      postRequest(JSON.stringify(generationBody())),
    )

    expect(response?.status).toBe(500)
    const responseText = await response!.text()
    expect(JSON.parse(responseText)).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'LibTV bridge request failed' },
    })
    expect(responseText).not.toContain('PRIVATE_TOKEN')
    expect(responseText).not.toContain('/private/tmp')
    expect(runner.run).not.toHaveBeenCalled()
  })
})
