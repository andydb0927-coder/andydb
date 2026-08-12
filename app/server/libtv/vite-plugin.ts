import { Readable } from 'node:stream'

import type { Connect, Plugin } from 'vite'

import { createCliRunner } from './cli-runner.js'
import {
  classifyLibTvContentLength,
  createLibTvHttpHandler,
  isLibTvJsonContentType,
  LIBTV_CATALOG_PATH,
  LIBTV_GENERATE_PATH,
  type LibTvHttpHandler,
  type LibTvHttpHandlerOptions,
} from './http-handler.js'
import type { CliRunner } from './types.js'

export interface LibTvGenerationBridgePluginOptions
  extends Omit<LibTvHttpHandlerOptions, 'runner' | 'writesEnabled'> {
  runner?: CliRunner
  environment?: Readonly<Record<string, string | undefined>>
  handler?: LibTvHttpHandler
}

export function libTvGenerationBridgePlugin(
  options: LibTvGenerationBridgePluginOptions = {},
): Plugin {
  const environment = options.environment ?? process.env
  const writesEnabled =
    environment.WIRELESS_CANVAS_ENABLE_LIBTV_WRITES === '1'
  const handler = options.handler ?? createDefaultHandler(options, writesEnabled)
  const middleware = createNodeMiddleware(handler, writesEnabled)

  return {
    name: 'libtv-generation-bridge',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

function createDefaultHandler(
  options: LibTvGenerationBridgePluginOptions,
  writesEnabled: boolean,
): LibTvHttpHandler {
  const runner = options.runner ?? createCliRunner({ binary: 'libtv' })
  return createLibTvHttpHandler({
    runner,
    writesEnabled,
    ...(options.fileWorkspace === undefined
      ? {}
      : { fileWorkspace: options.fileWorkspace }),
    ...(options.loadCatalog === undefined
      ? {}
      : { loadCatalog: options.loadCatalog }),
    ...(options.executeGeneration === undefined
      ? {}
      : { executeGeneration: options.executeGeneration }),
  })
}

function createNodeMiddleware(
  handler: LibTvHttpHandler,
  writesEnabled: boolean,
): Connect.NextHandleFunction {
  return (request, response, next) => {
    const rawUrl = request.url ?? '/'
    let url: URL
    try {
      url = new URL(rawUrl, 'http://localhost')
    } catch {
      next()
      return
    }

    if (url.pathname !== LIBTV_CATALOG_PATH && url.pathname !== LIBTV_GENERATE_PATH) {
      next()
      return
    }

    void handleNodeRequest(
      handler,
      request,
      response,
      next,
      url,
      writesEnabled,
    ).catch(() => {
      writeInternalError(response)
    })
  }
}

async function handleNodeRequest(
  handler: LibTvHttpHandler,
  request: Parameters<Connect.NextHandleFunction>[0],
  response: Parameters<Connect.NextHandleFunction>[1],
  next: Connect.NextFunction,
  url: URL,
  writesEnabled: boolean,
): Promise<void> {
  const method = request.method ?? 'GET'
  const headers = requestHeaders(request.headers)
  const init: RequestInit & { duplex?: 'half' } = { method, headers }
  if (shouldAttachRequestBody(url.pathname, method, headers, writesEnabled)) {
    init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>
    init.duplex = 'half'
  }
  const abortController = new AbortController()
  const abortRequest = () => abortController.abort()
  const abortPrematureClose = () => {
    if (!request.complete) {
      abortController.abort()
    }
  }
  request.once('aborted', abortRequest)
  request.once('close', abortPrematureClose)
  init.signal = abortController.signal

  try {
    const webRequest = new Request(
      `http://localhost${url.pathname}${url.search}`,
      init,
    )
    const webResponse = await handler(webRequest)
    if (!webResponse) {
      next()
      return
    }

    const body = Buffer.from(await webResponse.arrayBuffer())
    response.statusCode = webResponse.status
    const responseHeaders = webResponse.headers as Headers & {
      getSetCookie?: () => string[]
    }
    const setCookies = responseHeaders.getSetCookie?.()
    webResponse.headers.forEach((value, name) => {
      if (name.toLowerCase() === 'set-cookie' && setCookies) {
        return
      }
      response.setHeader(name, value)
    })
    if (setCookies && setCookies.length > 0) {
      response.setHeader('set-cookie', setCookies)
    }
    response.end(body)
  } finally {
    request.removeListener('aborted', abortRequest)
    request.removeListener('close', abortPrematureClose)
  }
}

function shouldAttachRequestBody(
  pathname: string,
  method: string,
  headers: Headers,
  writesEnabled: boolean,
): boolean {
  return pathname === LIBTV_GENERATE_PATH &&
    method === 'POST' &&
    writesEnabled &&
    isLibTvJsonContentType(headers.get('content-type')) &&
    classifyLibTvContentLength(headers.get('content-length')) === 'valid'
}

function requestHeaders(
  incoming: Parameters<Connect.NextHandleFunction>[0]['headers'],
): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(name, entry)
      }
    } else if (value !== undefined) {
      headers.set(name, value)
    }
  }
  return headers
}

function writeInternalError(response: Parameters<Connect.NextHandleFunction>[1]): void {
  const body = JSON.stringify({
    error: { code: 'INTERNAL_ERROR', message: 'LibTV bridge request failed' },
  })
  response.statusCode = 500
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(body)
}
