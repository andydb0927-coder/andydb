import type { MiddlewareHandler } from 'hono'

import type { AppEnv } from './bindings'
import { errorResponse } from './errors'

const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] as const
const allowedRequestHeaders = ['authorization', 'content-type'] as const

function explicitOrigins(value?: string) {
  return new Set((value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => {
      if (!origin || origin === '*') return false
      try {
        const parsed = new URL(origin)
        return (parsed.protocol === 'https:' || parsed.protocol === 'http:')
          && parsed.origin === origin
      } catch {
        return false
      }
    }))
}

function requestedHeaders(value?: string) {
  if (!value?.trim()) return []
  return value.split(',').map((header) => header.trim().toLowerCase()).filter(Boolean)
}

export function explicitCorsMiddleware(): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const origin = context.req.header('Origin')
    if (!origin) {
      await next()
      return
    }

    if (!explicitOrigins(context.env.CORS_ALLOWED_ORIGINS).has(origin)) {
      return errorResponse(403, 'CORS_ORIGIN_FORBIDDEN', '该来源未获准访问云端服务。')
    }

    context.header('Access-Control-Allow-Origin', origin)
    context.header('Vary', 'Origin')

    if (context.req.method !== 'OPTIONS') {
      await next()
      return
    }

    const requestedMethod = context.req.header('Access-Control-Request-Method')?.toUpperCase()
    const headers = requestedHeaders(context.req.header('Access-Control-Request-Headers'))
    if (
      !requestedMethod ||
      !allowedMethods.includes(requestedMethod as typeof allowedMethods[number]) ||
      headers.some((header) => !allowedRequestHeaders.includes(
        header as typeof allowedRequestHeaders[number],
      ))
    ) {
      return errorResponse(403, 'CORS_PREFLIGHT_FORBIDDEN', '跨域预检请求不在允许范围内。')
    }

    context.header('Access-Control-Allow-Methods', allowedMethods.join(', '))
    context.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    context.header('Access-Control-Max-Age', '600')
    context.header('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers')
    return context.body(null, 204)
  }
}
