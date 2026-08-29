export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
) {
  return new Response(JSON.stringify({ error: { code, message } } satisfies ApiErrorBody), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  })
}

const upstreamStatusMessages = new Map<number, { code: string; message: string }>([
  [401, {
    code: 'UPSTREAM_AUTH_FAILED',
    message: '上游服务鉴权失败，请检查服务配置。',
  }],
  [403, {
    code: 'UPSTREAM_ACCESS_DENIED',
    message: '上游服务拒绝访问，请确认资源已开通。',
  }],
  [404, {
    code: 'UPSTREAM_NOT_FOUND',
    message: '上游模型或接口不存在，请检查服务配置。',
  }],
  [408, {
    code: 'UPSTREAM_TIMEOUT',
    message: '上游服务响应超时，请稍后重试。',
  }],
  [429, {
    code: 'UPSTREAM_RATE_LIMITED',
    message: '上游服务请求过于频繁，请稍后重试。',
  }],
])

export function upstreamErrorResponse(status: number) {
  const mapped = upstreamStatusMessages.get(status)
  if (mapped) return errorResponse(status === 408 ? 504 : 502, mapped.code, mapped.message)
  return errorResponse(502, 'UPSTREAM_FAILED', '上游服务暂时不可用，请稍后重试。')
}

export function upstreamTimeoutResponse() {
  return errorResponse(
    504,
    'UPSTREAM_TIMEOUT',
    '上游服务响应超时，请稍后重试。',
  )
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}
