export interface ApiErrorBody {
  error: {
    code: string
    message: string
    upstreamStatus?: number
  }
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  upstreamStatus?: number,
) {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
    },
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  })
}

const upstreamStatusMessages = new Map<number, { code: string; message: string }>([
  [401, {
    code: 'UPSTREAM_AUTH_FAILED',
    message: '上游鉴权失败，请检查服务端Key配置。',
  }],
  [403, {
    code: 'UPSTREAM_ACCESS_DENIED',
    message: '上游服务拒绝访问，请确认资源已开通。',
  }],
  [404, {
    code: 'UPSTREAM_NOT_FOUND',
    message: '模型或接入点不可用。',
  }],
  [408, {
    code: 'UPSTREAM_TIMEOUT',
    message: '上游服务响应超时，请稍后重试。',
  }],
  [429, {
    code: 'UPSTREAM_RATE_LIMITED',
    message: '请求过于频繁。',
  }],
])

const upstreamCodeMessages = new Map<string, { code: string; message: string }>([
  ['accountoverdueerror', {
    code: 'UPSTREAM_ACCOUNT_OVERDUE',
    message: '火山方舟账号余额不足，请前往控制台充值后重试。',
  }],
  ['authenticationerror', {
    code: 'UPSTREAM_AUTH_FAILED',
    message: '上游鉴权失败，请检查服务端Key配置。',
  }],
])

export function upstreamErrorResponse(status: number, upstreamCode?: string) {
  const codeMapped = upstreamCodeMessages.get(upstreamCode?.trim().toLowerCase() ?? '')
  if (codeMapped) return errorResponse(502, codeMapped.code, codeMapped.message, status)
  const mapped = upstreamStatusMessages.get(status)
  if (mapped) {
    return errorResponse(status === 408 ? 504 : 502, mapped.code, mapped.message, status)
  }
  return errorResponse(
    502,
    'UPSTREAM_FAILED',
    '上游服务暂时不可用，请稍后重试。',
    status,
  )
}

export function upstreamNetworkErrorResponse() {
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
