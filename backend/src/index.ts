import { createApp } from './app'
import type { WorkerBindings } from './bindings'

const app = createApp()

export interface EdgeFetchEvent {
  request: Request
  respondWith(value: Promise<Response>): void
}

export interface EdgeFetchTarget {
  env?: WorkerBindings
  addEventListener?(type: 'fetch', listener: (event: EdgeFetchEvent) => void): void
}

export const worker = {
  fetch(request: Request, env: WorkerBindings, executionContext?: ExecutionContext) {
    return app.fetch(request, env, executionContext)
  },
}

export function installEdgeFetchListener(target: EdgeFetchTarget) {
  if (typeof target.addEventListener !== 'function') return false
  target.addEventListener('fetch', (event) => {
    const bindings = target.env ?? target as unknown as WorkerBindings
    event.respondWith(Promise.resolve(app.fetch(event.request, bindings)))
  })
  return true
}

installEdgeFetchListener(globalThis as unknown as EdgeFetchTarget)

export default worker
