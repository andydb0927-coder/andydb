// @vitest-environment node

import { Readable } from 'node:stream'

import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Plugin } from 'vite'

import type { LibTvCatalog } from '../../src/features/generation/libtv-contract.js'
import type { LibTvHttpHandler } from './http-handler.js'
import type { CliRunner, LibTvGeneratedAsset } from './types.js'

const mocks = vi.hoisted(() => ({
  defaultRunner: {
    run: vi.fn().mockRejectedValue(new Error('default runner must not execute')),
  },
  createCliRunner: vi.fn(),
}))

vi.mock('./cli-runner.js', () => ({
  createCliRunner: mocks.createCliRunner,
}))

import { libTvGenerationBridgePlugin } from './vite-plugin.js'

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
      new Error('real CLI must never run in Vite tests'),
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

type Middleware = (
  request: TrackedIncomingRequest,
  response: {
    statusCode: number
    setHeader(name: string, value: string | string[]): void
    end(body?: Uint8Array | string): void
  },
  next: () => void,
) => void

class TrackedIncomingRequest extends Readable {
  url?: string
  method?: string
  headers: Record<string, string>
  complete: boolean
  readCalls = 0

  readonly #body: Buffer | undefined
  #sent = false

  constructor(options: {
    path: string
    method: string
    headers: Record<string, string>
    body?: string
    complete?: boolean
  }) {
    super()
    this.url = options.path
    this.method = options.method
    this.headers = options.headers
    this.complete = options.complete ?? false
    this.#body = options.body === undefined ? undefined : Buffer.from(options.body)
  }

  override _read(): void {
    this.readCalls += 1
    if (this.#sent) {
      return
    }
    this.#sent = true
    if (this.#body) {
      this.push(this.#body)
    }
    this.complete = true
    this.push(null)
  }
}

function installMiddleware(plugin: Plugin, hook: 'configureServer' | 'configurePreviewServer') {
  const use = vi.fn()
  const install = plugin[hook]
  if (typeof install !== 'function') {
    throw new Error(`${hook} must be a function`)
  }
  Reflect.apply(install, {}, [{ middlewares: { use } }])
  expect(use).toHaveBeenCalledTimes(1)
  return use.mock.calls[0]![0] as Middleware
}

async function invokeMiddleware(
  middleware: Middleware,
  options: {
    path: string
    method?: string
    body?: string
    headers?: Record<string, string>
    complete?: boolean
    afterStart?: (request: TrackedIncomingRequest) => void
  },
) {
  const request = new TrackedIncomingRequest({
    path: options.path,
    method: options.method ?? 'GET',
    headers: options.headers ?? {},
    ...(options.body === undefined ? {} : { body: options.body }),
    ...(options.complete === undefined ? {} : { complete: options.complete }),
  })
  const onSpy = vi.spyOn(request, 'on')

  const headers = new Map<string, string | string[]>()
  let body = ''
  let ended = false
  let nextCalled = false
  let resolveCompletion: (() => void) | undefined
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve
  })
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string | string[]) {
      headers.set(name.toLowerCase(), value)
    },
    end(value?: Uint8Array | string) {
      body = value === undefined ? '' : Buffer.from(value).toString('utf8')
      ended = true
      resolveCompletion?.()
    },
  }
  const next = vi.fn(() => {
    nextCalled = true
    resolveCompletion?.()
  })

  middleware(request, response, next)
  options.afterStart?.(request)
  await completion

  return {
    status: response.statusCode,
    headers,
    body,
    ended,
    nextCalled,
    next,
    request,
    dataListenerAdds: onSpy.mock.calls.filter(([event]) => event === 'data').length,
  }
}

afterEach(() => {
  vi.clearAllMocks()
  mocks.createCliRunner.mockReturnValue(mocks.defaultRunner)
})

describe('LibTV Vite bridge plugin', () => {
  test('creates the default libtv runner once and installs one shared middleware for dev and preview', () => {
    mocks.createCliRunner.mockReturnValue(mocks.defaultRunner)
    const plugin = libTvGenerationBridgePlugin({
      environment: {},
      loadCatalog: vi.fn().mockResolvedValue(catalog),
    })

    const devMiddleware = installMiddleware(plugin, 'configureServer')
    const previewMiddleware = installMiddleware(plugin, 'configurePreviewServer')

    expect(mocks.createCliRunner).toHaveBeenCalledTimes(1)
    expect(mocks.createCliRunner).toHaveBeenCalledWith({ binary: 'libtv' })
    expect(devMiddleware).toBe(previewMiddleware)
  })

  test('delegates non-API paths to the next middleware', async () => {
    const runner = createRunner()
    const loadCatalog = vi.fn()
    const plugin = libTvGenerationBridgePlugin({ runner, loadCatalog })
    const middleware = installMiddleware(plugin, 'configureServer')

    const result = await invokeMiddleware(middleware, { path: '/app/project-1' })

    expect(result.nextCalled).toBe(true)
    expect(result.ended).toBe(false)
    expect(loadCatalog).not.toHaveBeenCalled()
    expect(runner.run).not.toHaveBeenCalled()
  })

  test.each([
    {
      name: 'an unknown LibTV path',
      path: '/api/libtv/private',
      method: 'POST',
      environment: { WIRELESS_CANVAS_ENABLE_LIBTV_WRITES: '1' },
      headers: { 'content-type': 'application/json' },
      status: undefined,
      delegates: true,
    },
    {
      name: 'a method rejected with 405',
      path: '/api/libtv/generate',
      method: 'PUT',
      environment: { WIRELESS_CANVAS_ENABLE_LIBTV_WRITES: '1' },
      headers: { 'content-type': 'application/json' },
      status: 405,
      delegates: false,
    },
    {
      name: 'a writes-disabled generation',
      path: '/api/libtv/generate',
      method: 'POST',
      environment: {},
      headers: { 'content-type': 'application/json' },
      status: 403,
      delegates: false,
    },
    {
      name: 'an unsupported content type',
      path: '/api/libtv/generate',
      method: 'POST',
      environment: { WIRELESS_CANVAS_ENABLE_LIBTV_WRITES: '1' },
      headers: { 'content-type': 'text/plain' },
      status: 415,
      delegates: false,
    },
    {
      name: 'a known oversized Content-Length',
      path: '/api/libtv/generate',
      method: 'POST',
      environment: { WIRELESS_CANVAS_ENABLE_LIBTV_WRITES: '1' },
      headers: {
        'content-type': 'application/json',
        'content-length': String(90 * 1024 * 1024 + 1),
      },
      status: 413,
      delegates: false,
    },
  ])('does not disturb the raw request body for $name', async (testCase) => {
    const runner = createRunner()
    const plugin = libTvGenerationBridgePlugin({
      runner,
      environment: testCase.environment,
      loadCatalog: vi.fn(),
      executeGeneration: vi.fn(),
    })
    const middleware = installMiddleware(plugin, 'configureServer')

    const result = await invokeMiddleware(middleware, {
      path: testCase.path,
      method: testCase.method,
      headers: testCase.headers as Record<string, string>,
      body: JSON.stringify(generationBody()),
      complete: true,
    })

    expect(result.nextCalled).toBe(testCase.delegates)
    expect(result.status).toBe(testCase.status ?? 200)
    expect(result.request.readCalls).toBe(0)
    expect(result.dataListenerAdds).toBe(0)
  })

  test('handles catalog in middleware with no-store and no wildcard CORS', async () => {
    const runner = createRunner()
    const loadCatalog = vi.fn().mockResolvedValue(catalog)
    const plugin = libTvGenerationBridgePlugin({ runner, loadCatalog })
    const middleware = installMiddleware(plugin, 'configurePreviewServer')

    const result = await invokeMiddleware(middleware, {
      path: '/api/libtv/catalog?refresh=1',
    })

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual(catalog)
    expect(result.headers.get('cache-control')).toBe('no-store')
    expect(result.headers.has('access-control-allow-origin')).toBe(false)
    expect(result.nextCalled).toBe(false)
    expect(loadCatalog).toHaveBeenCalledTimes(1)
    expect(runner.run).not.toHaveBeenCalled()
  })

  test.each([undefined, '', 'true', '01', 'TRUE']) (
    'keeps writes disabled unless the environment value is exactly 1 (%s)',
    async (value) => {
      const runner = createRunner()
      const loadCatalog = vi.fn()
      const executeGeneration = vi.fn()
      const plugin = libTvGenerationBridgePlugin({
        runner,
        environment: { WIRELESS_CANVAS_ENABLE_LIBTV_WRITES: value },
        loadCatalog,
        executeGeneration,
      })
      const middleware = installMiddleware(plugin, 'configureServer')

      const result = await invokeMiddleware(middleware, {
        path: '/api/libtv/generate',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(generationBody()),
      })

      expect(result.status).toBe(403)
      expect(loadCatalog).not.toHaveBeenCalled()
      expect(executeGeneration).not.toHaveBeenCalled()
      expect(runner.run).not.toHaveBeenCalled()
    },
  )

  test('enables writes only for an exact environment value of 1', async () => {
    const runner = createRunner()
    const loadCatalog = vi.fn().mockResolvedValue(catalog)
    const executeGeneration = vi.fn().mockResolvedValue(generatedAsset)
    const plugin = libTvGenerationBridgePlugin({
      runner,
      environment: { WIRELESS_CANVAS_ENABLE_LIBTV_WRITES: '1' },
      loadCatalog,
      executeGeneration,
      fileWorkspace: '/tmp/libtv-vite-test',
    })
    const middleware = installMiddleware(plugin, 'configureServer')

    const result = await invokeMiddleware(middleware, {
      path: '/api/libtv/generate',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(generationBody()),
    })

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual(generatedAsset)
    expect(executeGeneration).toHaveBeenCalledTimes(1)
    expect(runner.run).not.toHaveBeenCalled()
    expect(result.request.readCalls).toBeGreaterThan(0)
  })

  test.each([
    ['aborted', true, true],
    ['close', false, true],
    ['close', true, false],
  ] as const)(
    'maps raw %s with complete=%s to signal.aborted=%s and removes its listener',
    async (event, complete, shouldAbort) => {
      let capturedSignal: AbortSignal | undefined
      let signalBeforeEvent: boolean | undefined
      let signalAfterEvent: boolean | undefined
      let lifecycleListener: ((...args: unknown[]) => void) | undefined
      let resolveHandler: ((response: Response) => void) | undefined
      const handler: LibTvHttpHandler = vi.fn((request) => {
        capturedSignal = request.signal
        return new Promise<Response>((resolve) => {
          resolveHandler = resolve
        })
      })
      const plugin = libTvGenerationBridgePlugin({
        handler,
        environment: { WIRELESS_CANVAS_ENABLE_LIBTV_WRITES: '1' },
      })
      const middleware = installMiddleware(plugin, 'configureServer')

      const result = await invokeMiddleware(middleware, {
        path: '/api/libtv/generate',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(generationBody()),
        complete,
        afterStart(request) {
          signalBeforeEvent = capturedSignal?.aborted
          lifecycleListener = request.listeners(event).at(-1) as
            | ((...args: unknown[]) => void)
            | undefined
          request.emit(event)
          signalAfterEvent = capturedSignal?.aborted
          resolveHandler?.(new Response('{}'))
        },
      })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(signalBeforeEvent).toBe(false)
      expect(signalAfterEvent).toBe(shouldAbort)
      expect(lifecycleListener).toBeTypeOf('function')
      expect(result.request.listeners(event)).not.toContain(lifecycleListener)
      expect(result.status).toBe(200)
    },
  )

  test('preserves multiple Set-Cookie response values as a header array', async () => {
    const responseHeaders = new Headers()
    responseHeaders.append('set-cookie', 'session=one; Path=/; HttpOnly')
    responseHeaders.append('set-cookie', 'preferences=two; Path=/; SameSite=Lax')
    const handler: LibTvHttpHandler = vi.fn().mockResolvedValue(
      new Response('{}', { headers: responseHeaders }),
    )
    const plugin = libTvGenerationBridgePlugin({ handler })
    const middleware = installMiddleware(plugin, 'configurePreviewServer')

    const result = await invokeMiddleware(middleware, {
      path: '/api/libtv/catalog',
    })

    expect(result.headers.get('set-cookie')).toEqual([
      'session=one; Path=/; HttpOnly',
      'preferences=two; Path=/; SameSite=Lax',
    ])
  })

  test('maps asynchronous bridge failures to a fixed response without leaking details', async () => {
    const runner = createRunner()
    const loadCatalog = vi.fn().mockRejectedValue(
      new Error('PRIVATE_TOKEN /private/tmp/secret-reference.png'),
    )
    const plugin = libTvGenerationBridgePlugin({
      runner,
      environment: { WIRELESS_CANVAS_ENABLE_LIBTV_WRITES: '1' },
      loadCatalog,
    })
    const middleware = installMiddleware(plugin, 'configurePreviewServer')

    const result = await invokeMiddleware(middleware, {
      path: '/api/libtv/catalog',
    })

    expect(result.status).toBe(500)
    expect(JSON.parse(result.body)).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'LibTV bridge request failed' },
    })
    expect(result.body).not.toContain('PRIVATE_TOKEN')
    expect(result.body).not.toContain('/private/tmp')
    expect(result.headers.has('access-control-allow-origin')).toBe(false)
  })
})
