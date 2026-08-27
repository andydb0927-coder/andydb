export type GenerationService = 'seedream' | 'seedance' | 'ark-text' | 'ark-tts' | 'ark-audio'
export type GenerationErrorCode =
  | 'invalid-request' | 'unauthorized' | 'forbidden' | 'rate-limited'
  | 'http-error' | 'sensitive-content' | 'network' | 'invalid-response'

interface GenerationErrorDetails extends ErrorOptions {
  service?: GenerationService
  status?: number
}

/** Only message/code/status are presentation data. Never persist or render cause. */
export class GenerationServiceError extends Error {
  readonly code: GenerationErrorCode
  readonly service?: GenerationService
  readonly status?: number

  constructor(message: string, code: GenerationErrorCode, details: GenerationErrorDetails = {}) {
    super(message, { cause: details.cause })
    this.name = 'GenerationServiceError'
    this.code = code
    this.service = details.service
    this.status = details.status
  }
}

export const HTTP_ERROR_CODES: Readonly<Record<number, GenerationErrorCode>> = {
  400: 'invalid-request', 401: 'unauthorized', 403: 'forbidden', 429: 'rate-limited',
}

const commonMessages: Readonly<Partial<Record<GenerationErrorCode, string>>> = {
  'invalid-request': '请求参数无效',
  unauthorized: '鉴权失败',
  forbidden: '访问被拒绝',
  'rate-limited': '请求过于频繁',
}

const serviceMessages: Record<GenerationService, {
  label: string
  fallback: string
  overrides?: Partial<Record<GenerationErrorCode, string>>
}> = {
  seedream: { label: 'Seedream ', fallback: '请求失败', overrides: { 'rate-limited': '请求过于频繁或额度不足' } },
  seedance: { label: '火山方舟 Seedance ', fallback: '请求失败' },
  'ark-text': { label: '火山方舟文本', fallback: '生成服务暂不可用', overrides: { forbidden: '模型无访问权限', 'rate-limited': '生成请求过于频繁' } },
  'ark-tts': { label: '豆包语音合成', fallback: '服务暂不可用' },
  'ark-audio': { label: '豆包音频生成', fallback: '服务暂不可用' },
}

export const SEEDREAM_ERROR_CODES: Readonly<Record<string, string>> = {
  InputTextSensitiveContentDetected: '提示词未通过安全检查',
  InputImageSensitiveContentDetected: '参考图片未通过安全检查',
  OutputImageSensitiveContentDetected: '生成结果未通过安全检查',
}

export const LIBTV_BRIDGE_ERROR_CODES: Readonly<Record<string, string>> = {
  WRITES_DISABLED: 'LibTV 写入未启用，请在画布的模型设置中检查写入门禁。',
  PAYLOAD_TOO_LARGE: 'LibTV 生成请求过大，请减少参考素材后重试。',
  UNSUPPORTED_MEDIA_TYPE: 'LibTV 生成请求无效，请检查模型与参考素材。',
  INVALID_JSON: 'LibTV 生成请求无效，请检查模型与参考素材。',
}

export function libtvBridgeErrorMessage(code: string | undefined) {
  return code && Object.hasOwn(LIBTV_BRIDGE_ERROR_CODES, code)
    ? LIBTV_BRIDGE_ERROR_CODES[code]
    : 'LibTV 生成请求失败，请检查本地桥接状态后重试。'
}

export function isGenerationAbort(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function preserveAbort(error: unknown) {
  if (isGenerationAbort(error)) throw error
}

function upstreamCode(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('error' in body)) return undefined
  const error = body.error
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code : undefined
}

export async function assertProviderResponse(response: Response, service: GenerationService): Promise<void> {
  if (response.ok) return
  let code = HTTP_ERROR_CODES[response.status] ?? 'http-error'
  let cause: unknown
  let detail: string | undefined
  if (service === 'seedream' && response.status === 400) {
    try {
      const nativeCode = upstreamCode(await response.json())
      if (nativeCode && Object.hasOwn(SEEDREAM_ERROR_CODES, nativeCode)) {
        code = 'sensitive-content'
        detail = SEEDREAM_ERROR_CODES[nativeCode]
      }
    } catch (error) {
      preserveAbort(error)
      // A malformed error body still fails; preserve the parsing cause without exposing it.
      cause = error
    }
  }
  const profile = serviceMessages[service]
  const message = detail ?? profile.overrides?.[code] ?? commonMessages[code] ?? profile.fallback
  throw new GenerationServiceError(`${profile.label}${message}（${response.status}）`, code, {
    service, status: response.status, cause,
  })
}

/** Transport wrapper only: URL, request body, headers, signal and response remain untouched. */
export async function fetchProviderResponse(
  fetchFn: typeof fetch,
  service: GenerationService,
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  try {
    return await fetchFn(input, init)
  } catch (cause) {
    preserveAbort(cause)
    throw new GenerationServiceError(`${serviceMessages[service].label}网络异常，请检查网络和服务配置后重试。`, 'network', { service, cause })
  }
}

export async function readProviderJson(response: Response, message: string): Promise<unknown> {
  try {
    return await response.json() as unknown
  } catch (cause) {
    preserveAbort(cause)
    throw new GenerationServiceError(message, 'invalid-response', { cause })
  }
}

const sensitiveDetail = /(?:authorization\s*:|\bbearer\s+\S+|(?:api[-_ ]?key|access[-_ ]?key|secret|token|password)\s*[=:]|\b(?:sk-|ghp_|github_pat_)\S+|https?:\/\/|data:[^,]+,)/iu

export function safeProviderMessage(value: unknown, fallback = '任务未完成', maxLength = 160) {
  if (typeof value !== 'string' || sensitiveDetail.test(value)) return fallback
  const message = value.replace(/[\u0000-\u001f\u007f]+/gu, ' ').trim().slice(0, maxLength)
  return message || fallback
}

export function generationErrorMessage(error: unknown, fallback = '生成失败，请稍后重试。') {
  // Preserve full local recovery instructions; only raw provider details are capped.
  return safeProviderMessage(error instanceof Error ? error.message : undefined, fallback, Infinity)
}

type ToolErrorProfile = 'image-edit' | 'video-continue' | 'frame-analysis' | 'subject-extraction'

const seedreamSafeMessage = /^Seedream (?:鉴权失败（401）|访问被拒绝（403）|请求过于频繁或额度不足（429）|提示词未通过安全检查（400）|参考图片未通过安全检查（400）|生成结果未通过安全检查（400）|请求参数无效（400）|请求失败（\d+）|响应格式异常|结果 URL 无效|参考图片必须是 HTTPS 地址或本地上传图片|未返回图片结果)$/u
const textSafeMessage = /^火山方舟文本(?:请求参数无效（400）|鉴权失败（401）|模型无访问权限（403）|生成请求过于频繁（429）|生成服务暂不可用（\d+）)$/u
const seedanceSafeMessage = /^火山方舟 Seedance (?:鉴权失败（401）|访问被拒绝（403）|请求过于频繁（429）|请求参数无效（400）|请求失败（\d+）|响应格式异常|创建任务响应格式异常|任务状态响应格式异常|结果 URL 无效|任务已取消)$/u

const toolPolicies: Record<ToolErrorProfile, {
  from: string
  label: string
  safe: RegExp
  timeout: string
  fallback: string
  localErrors?: readonly string[]
}> = {
  'image-edit': {
    from: 'Seedream ', label: '图片编辑 ', safe: seedreamSafeMessage,
    timeout: '图片编辑请求超时；请先核对官方用量，避免重复付费。',
    fallback: '图片编辑网络异常，请检查网络和服务配置后重试。',
  },
  'video-continue': {
    from: '火山方舟 Seedance', label: '视频续写', safe: seedanceSafeMessage,
    timeout: '视频续写等待超时；远程任务可能仍在运行，请先核对官方任务与用量，避免重复付费。',
    fallback: '视频续写网络异常，请检查网络及服务配置；如已提交请先核对官方任务。',
  },
  'frame-analysis': {
    from: '火山方舟文本', label: '拉片分析', safe: textSafeMessage,
    timeout: '拉片分析超时，请核对官方用量后再试。',
    fallback: '拉片分析请求异常，请检查网络、视频格式及模型权限。',
    localErrors: ['分析结果格式无效，请重新检查模型输出。', '分析结果格式无效：分镜需有递增时间段与画面描述。'],
  },
  'subject-extraction': {
    from: '火山方舟文本', label: '主体提取', safe: textSafeMessage,
    timeout: '主体提取超时，请核对官方用量后重试，或手动填写。',
    fallback: '主体提取请求异常，请检查网络、图片格式与模型权限，或手动填写。',
    localErrors: ['主体提取结果格式无效，请手动填写或重试。'],
  },
}

/** Shared tool boundary replaces duplicated prefix tests; only known-safe messages pass through. */
export function mapToolGenerationError(error: unknown, profile: ToolErrorProfile, timedOut = false): Error {
  const policy = toolPolicies[profile]
  const message = generationErrorMessage(error, '')
  let result = policy.fallback
  if (timedOut || (profile === 'video-continue' && message.includes('超时'))) {
    result = policy.timeout
  } else if (profile === 'video-continue' && message.startsWith('火山方舟 Seedance 生成失败：')) {
    result = '视频续写生成失败，请检查素材权限、输入规范与官方任务状态。'
  } else if (policy.localErrors?.includes(message) && error instanceof Error) {
    return error
  } else if (policy.safe.test(message)) {
    result = message.replace(policy.from, policy.label)
  }
  return new Error(result, { cause: error })
}

export function imageAnalysisFailureDetail(error: unknown, timedOut = false) {
  if (timedOut) return '请求超时，请核对官方用量后重试。'
  const message = generationErrorMessage(error, '')
  if (seedreamSafeMessage.test(message)) return message.replace(/^Seedream /u, '')
  if (message.startsWith('图片编辑 ') && seedreamSafeMessage.test(message.replace(/^图片编辑 /u, 'Seedream '))) {
    return message.replace(/^图片编辑/u, '')
  }
  if (message === toolPolicies['image-edit'].timeout || message === toolPolicies['image-edit'].fallback) {
    return message.replace(/^图片编辑/u, '')
  }
  return '请求异常，请检查网络和模型权限。'
}
