import type { WorkerBindings } from './bindings'
import { isAbortError, upstreamErrorResponse, upstreamTimeoutResponse } from './errors'
import type { UpstreamRequest } from './proxy-contracts'

export interface UpstreamOptions {
  fetchFn: typeof fetch
  timeoutMs?: number
}

function configuredTimeout(env: WorkerBindings, override: number | undefined) {
  if (override !== undefined) return Math.max(1, Math.min(120_000, override))
  const parsed = Number(env.UPSTREAM_TIMEOUT_MS)
  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 120_000
    ? parsed
    : 30_000
}

function forwardedHeaders(response: Response) {
  const headers = new Headers()
  const contentType = response.headers.get('Content-Type')
  const requestId = response.headers.get('X-Request-Id')
  if (contentType) headers.set('Content-Type', contentType)
  if (requestId) headers.set('X-Upstream-Request-Id', requestId)
  headers.set('Cache-Control', 'no-store')
  return headers
}

export async function forwardUpstream(
  request: UpstreamRequest,
  env: WorkerBindings,
  options: UpstreamOptions,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), configuredTimeout(env, options.timeoutMs))
  try {
    const response = await options.fetchFn(request.url, {
      ...request.init,
      signal: controller.signal,
    })
    if (!response.ok) return upstreamErrorResponse(response.status)
    return new Response(response.body, {
      status: response.status,
      headers: forwardedHeaders(response),
    })
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) return upstreamTimeoutResponse()
    return upstreamErrorResponse(502)
  } finally {
    clearTimeout(timeout)
  }
}
