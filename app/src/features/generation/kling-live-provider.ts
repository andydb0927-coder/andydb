import type {
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'
import type {
  ModelProvider,
} from './model-provider-registry'

const configurationError = '可灵开发验证配置未完成'
const textToVideoPath = '/v1/videos/text2video'

export interface KlingLiveProviderOptions {
  mode?: string
  accessKey?: string
  secretKey?: string
  apiBase?: string
  modelId?: string
  fetchFn?: typeof fetch
  pollIntervalMs?: number
  maxPollAttempts?: number
  now?: () => number
  createAuthorization?: (
    accessKey: string,
    secretKey: string,
    now: number,
  ) => Promise<string>
}

interface KlingCreateResponse {
  code?: unknown
  data?: {
    task_id?: unknown
  }
}

interface KlingVideoResult {
  id?: unknown
  url?: unknown
  duration?: unknown
}

interface KlingStatusResponse {
  code?: unknown
  data?: {
    task_id?: unknown
    task_status?: unknown
    task_status_msg?: unknown
    task_result?: {
      videos?: KlingVideoResult[]
    }
  }
}

function envValue(name: string) {
  const env = import.meta.env as Record<string, string | undefined>
  const value = env[name]
  return typeof value === 'string' ? value.trim() : ''
}

function base64Url(value: Uint8Array | string) {
  const text =
    typeof value === 'string'
      ? value
      : String.fromCharCode(...value)
  return btoa(text)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

async function createKlingAuthorization(
  accessKey: string,
  secretKey: string,
  now: number,
) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const currentSeconds = Math.floor(now / 1000)
  const payload = base64Url(
    JSON.stringify({
      iss: accessKey,
      exp: currentSeconds + 1800,
      nbf: currentSeconds - 5,
    }),
  )
  const unsigned = `${header}.${payload}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned)),
  )
  return `Bearer ${unsigned}.${base64Url(signature)}`
}

function waitForPoll(delayMs: number, signal: AbortSignal) {
  signal.throwIfAborted()
  if (delayMs <= 0) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer)
      reject(new DOMException('Generation cancelled', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel)
      resolve()
    }, delayMs)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

function normalizedBaseUrl(apiBase: string) {
  return apiBase.replace(/\/+$/u, '')
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown
  } catch {
    throw new Error('可灵响应格式异常')
  }
}

function assertSuccessfulResponse(response: Response) {
  if (response.ok) return
  if (response.status === 401) throw new Error('可灵鉴权失败（401）')
  if (response.status === 403) throw new Error('可灵访问被拒绝（403）')
  if (response.status === 429) throw new Error('可灵请求过于频繁（429）')
  throw new Error(`可灵请求失败（${response.status}）`)
}

function safeFailureMessage(value: unknown) {
  if (typeof value !== 'string') return '任务未完成'
  const normalized = value.trim().slice(0, 160)
  return normalized || '任务未完成'
}

function httpsResultUrl(value: unknown) {
  if (typeof value !== 'string') throw new Error('可灵结果 URL 无效')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('可灵结果 URL 无效')
  }
  if (url.protocol !== 'https:') throw new Error('可灵结果 URL 无效')
  return url.toString()
}

function durationSeconds(value: unknown, fallback: unknown) {
  const duration = Number(value ?? fallback ?? 5)
  return Number.isFinite(duration) && duration > 0 ? duration : 5
}

function liveResult(
  request: GenerationRequest,
  video: KlingVideoResult,
): GenerationResult {
  const assetId = crypto.randomUUID()
  return {
    persistence: 'ephemeral',
    asset: {
      id: assetId,
      kind: 'video',
      url: httpsResultUrl(video.url),
      mimeType: 'video/mp4',
      durationSeconds: durationSeconds(video.duration, request.parameters?.duration),
    },
    version: {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      prompt: request.prompt,
      assetId,
    },
  }
}

export function createKlingLiveProvider(
  options: KlingLiveProviderOptions = {},
): ModelProvider {
  const mode = options.mode ?? envValue('VITE_GENERATION_MODE')
  const accessKey = options.accessKey ?? envValue('VITE_KLING_ACCESS_KEY')
  const secretKey = options.secretKey ?? envValue('VITE_KLING_SECRET_KEY')
  const apiBase = options.apiBase ?? envValue('VITE_KLING_API_BASE')
  const modelId = options.modelId ?? envValue('VITE_KLING_MODEL_ID')
  const enabled = Boolean(
    mode === 'kling-direct-dev' &&
      accessKey &&
      secretKey &&
      apiBase &&
      modelId,
  )
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
  const pollIntervalMs = options.pollIntervalMs ?? 1500
  const maxPollAttempts = options.maxPollAttempts ?? 80
  const now = options.now ?? Date.now
  const authorizationFactory =
    options.createAuthorization ?? createKlingAuthorization
  const createUrl = `${normalizedBaseUrl(apiBase || 'https://api.klingai.com')}${textToVideoPath}`

  const provider: ModelProvider = {
    id: 'kling-api',
    name: 'Kling',
    modelName: modelId || 'Kling 官方 API',
    kind: 'live',
    ...(enabled ? {} : { disabledReason: configurationError }),
    capabilities: ['text-to-video'],
    parameterSchema: {
      aspectRatio: {
        type: 'enum',
        defaultValue: '16:9',
        options: ['16:9', '9:16', '1:1'],
      },
      duration: {
        type: 'enum',
        defaultValue: '5',
        options: ['5', '10'],
      },
      count: { type: 'enum', defaultValue: '1', options: ['1'] },
    },
    pricing: { amount: 24, currency: 'credits', unit: 'generation' },
    officialApiEndpoint: createUrl,
    async generate(request, context) {
      if (!enabled) throw new Error(configurationError)
      context.signal.throwIfAborted()
      if (request.targetKind !== 'video' || request.referenceAssets.length > 0) {
        throw new Error('可灵最小闭环当前仅支持文生视频')
      }
      if (!request.prompt.trim()) throw new Error('可灵文生视频需要提示词')

      const authorization = await authorizationFactory(
        accessKey,
        secretKey,
        now(),
      )
      const headers = {
        Authorization: authorization,
        'Content-Type': 'application/json',
      }
      const createResponse = await fetchFn(createUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model_name: modelId,
          prompt: request.prompt,
          aspect_ratio: String(request.parameters?.aspectRatio ?? '16:9'),
          duration: String(request.parameters?.duration ?? '5'),
        }),
        signal: context.signal,
      })
      assertSuccessfulResponse(createResponse)
      const createBody = await readJson(createResponse) as KlingCreateResponse
      const taskId = createBody.data?.task_id
      if (createBody.code !== 0 || typeof taskId !== 'string' || !taskId) {
        throw new Error('可灵创建任务响应格式异常')
      }
      context.onProgress?.(10)

      const statusUrl = `${createUrl}/${encodeURIComponent(taskId)}`
      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        await waitForPoll(pollIntervalMs, context.signal)
        const statusResponse = await fetchFn(statusUrl, {
          method: 'GET',
          headers,
          signal: context.signal,
        })
        assertSuccessfulResponse(statusResponse)
        const statusBody = await readJson(statusResponse) as KlingStatusResponse
        const data = statusBody.data
        if (
          statusBody.code !== 0 ||
          !data ||
          data.task_id !== taskId ||
          typeof data.task_status !== 'string'
        ) {
          throw new Error('可灵任务状态响应格式异常')
        }
        if (data.task_status === 'failed') {
          throw new Error(
            `可灵生成失败：${safeFailureMessage(data.task_status_msg)}`,
          )
        }
        if (
          data.task_status === 'succeed' ||
          data.task_status === 'succeeded'
        ) {
          const video = data.task_result?.videos?.[0]
          if (!video) throw new Error('可灵结果 URL 无效')
          const result = liveResult(request, video)
          context.onProgress?.(100)
          return result
        }
        if (
          data.task_status !== 'submitted' &&
          data.task_status !== 'processing'
        ) {
          throw new Error('可灵任务状态响应格式异常')
        }
        context.onProgress?.(55)
      }
      throw new Error('可灵生成等待超时')
    },
    async export(_request, context) {
      context.signal.throwIfAborted()
      throw new Error('可灵最小闭环不支持导出')
    },
  }

  return provider
}
