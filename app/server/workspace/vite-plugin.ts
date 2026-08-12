import { Readable } from 'node:stream'

import type { Connect, Plugin } from 'vite'

import {
  createWorkspaceHttpHandler,
  WORKSPACE_EXECUTE_PATH,
  WORKSPACE_MANIFEST_PATH,
  type WorkspaceHttpHandler,
  type WorkspaceHttpHandlerOptions,
} from './http-handler.js'

export interface WorkspaceCliBridgePluginOptions extends WorkspaceHttpHandlerOptions {
  handler?: WorkspaceHttpHandler
}

export function workspaceCliBridgePlugin(
  options: WorkspaceCliBridgePluginOptions = {},
): Plugin {
  const handler = options.handler ?? createWorkspaceHttpHandler({ execute: options.execute })
  const middleware = createMiddleware(handler)
  return {
    name: 'wireless-canvas-workspace-cli-bridge',
    configureServer(server) { server.middlewares.use(middleware) },
    configurePreviewServer(server) { server.middlewares.use(middleware) },
  }
}

function createMiddleware(handler: WorkspaceHttpHandler): Connect.NextHandleFunction {
  return (request, response, next) => {
    let url: URL
    try {
      url = new URL(request.url ?? '/', 'http://localhost')
    } catch {
      next()
      return
    }
    if (url.pathname !== WORKSPACE_MANIFEST_PATH && url.pathname !== WORKSPACE_EXECUTE_PATH) {
      next()
      return
    }
    const method = request.method ?? 'GET'
    const headers = toHeaders(request.headers)
    const init: RequestInit & { duplex?: 'half' } = { method, headers }
    if (url.pathname === WORKSPACE_EXECUTE_PATH && method === 'POST') {
      init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>
      init.duplex = 'half'
    }
    void handler(new Request(`http://localhost${url.pathname}${url.search}`, init)).then(
      async (webResponse) => {
        if (!webResponse) {
          next()
          return
        }
        response.statusCode = webResponse.status
        webResponse.headers.forEach((value, name) => response.setHeader(name, value))
        response.end(Buffer.from(await webResponse.arrayBuffer()))
      },
      () => {
        response.statusCode = 500
        response.setHeader('cache-control', 'no-store')
        response.setHeader('content-type', 'application/json; charset=utf-8')
        response.end(JSON.stringify({
          schemaVersion: 1,
          error: { code: 'INTERNAL_ERROR', message: 'Workspace command failed' },
        }))
      },
    )
  }
}

function toHeaders(incoming: Parameters<Connect.NextHandleFunction>[0]['headers']) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item))
    else if (value !== undefined) headers.set(name, value)
  }
  return headers
}
