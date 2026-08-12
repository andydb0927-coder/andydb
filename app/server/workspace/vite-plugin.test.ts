// @vitest-environment node

import { Readable } from 'node:stream'

import { describe, expect, test, vi } from 'vitest'
import type { Plugin } from 'vite'

import { workspaceCliBridgePlugin } from './vite-plugin.js'

type Middleware = (
  request: Readable & { url?: string; method?: string; headers: Record<string, string>; complete: boolean },
  response: { statusCode: number; setHeader(name: string, value: string | string[]): void; end(body?: Uint8Array | string): void },
  next: () => void,
) => void

function middlewareFrom(plugin: Plugin, hook: 'configureServer' | 'configurePreviewServer') {
  const use = vi.fn()
  const install = plugin[hook]
  if (typeof install !== 'function') throw new Error('missing Vite hook')
  Reflect.apply(install, {}, [{ middlewares: { use } }])
  return use.mock.calls[0]![0] as Middleware
}

async function invoke(middleware: Middleware, path: string) {
  const incoming = new Readable({ read() { this.push(null) } }) as Parameters<Middleware>[0]
  incoming.url = path
  incoming.method = 'GET'
  incoming.headers = {}
  incoming.complete = true
  const headers = new Map<string, string | string[]>()
  let status = 200
  let body = ''
  const next = vi.fn()
  await new Promise<void>((resolve) => {
    middleware(incoming, {
      get statusCode() { return status },
      set statusCode(value) { status = value },
      setHeader(name, value) { headers.set(name.toLowerCase(), value) },
      end(value) { body = value ? Buffer.from(value).toString('utf8') : ''; resolve() },
    }, () => { next(); resolve() })
  })
  return { status, body, headers, next }
}

describe('workspace CLI Vite bridge', () => {
  test('installs one shared middleware for dev and preview', () => {
    const plugin = workspaceCliBridgePlugin()
    expect(middlewareFrom(plugin, 'configureServer')).toBe(middlewareFrom(plugin, 'configurePreviewServer'))
  })

  test('serves the manifest and delegates unknown paths', async () => {
    const middleware = middlewareFrom(workspaceCliBridgePlugin(), 'configureServer')
    const manifest = await invoke(middleware, '/api/workspace/manifest')
    expect(manifest.status).toBe(200)
    expect(JSON.parse(manifest.body)).toMatchObject({ schemaVersion: 1, data: { namespace: 'wireless-canvas.workspace' } })
    expect(manifest.next).not.toHaveBeenCalled()

    const delegated = await invoke(middleware, '/api/workspace/private')
    expect(delegated.next).toHaveBeenCalledTimes(1)
    expect(delegated.body).toBe('')
  })
})
