import type {
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'
import type {
  ModelProvider,
} from './model-provider-registry'

const configurationError = '可灵开发验证配置未完成'
const defaultApiBase = 'https://api.klingai.com'
const defaultModelId = 'kling-2.6'

export interface KlingLiveProviderOptions {
  mode?: string
  apiKey?: string
  apiBase?: string
  modelId?: string
  fetchFn?: typeof fetch
  pollIntervalMs?: number
  maxPollAttempts?: number
  requestIdFactory?: () => string
}

interface KlingCreateResponse {
  code?: unknown
  message?: unknown
  data?: {
    id?: unknown
    status?: unknown
  }
}

interface KlingOutput {
  type?: unknown
  url?: unknown
  duration?: unknown
}

interface KlingTask {
  id?: unknown
  external_task_id?: unknown
  status?: unknown
  message?: unknown
  outputs?: KlingOutput[]
}

interface KlingTasksResponse {
  code?: unknown
  message?: unknown
  data?: KlingTask[]
}

function envValue(name: string) {
  const env = import.meta.env as Record<string, string | undefined>
  const value = env[name]
  return typeof value === 'string' ? value.trim() : ''
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

function durationSetting(value: unknown): 5 | 10 {
  return Number(value) === 10 ? 10 : 5
}

function aspectRatioSetting(value: unknown): '16:9' | '9:16' | '1:1' {
  return value === '9:16' || value === '1:1' ? value : '16:9'
}

function resolutionSetting(value: unknown): '720p' | '1080p' {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === '1080p' || normalized === '1920×1080'
    ? '1080p'
    : '720p'
}

function booleanSetting(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function liveResult(
  request: GenerationRequest,
  video: KlingOutput,
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
  const apiKey = options.apiKey ?? envValue('VITE_KLING_API_KEY')
  const apiBase = options.apiBase ?? envValue('VITE_KLING_API_BASE')
  const modelId = options.modelId ?? envValue('VITE_KLING_MODEL_ID')
  const enabled = Boolean(
    mode === 'kling-direct-dev' &&
      apiKey &&
      apiBase &&
      modelId,
  )
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
  const pollIntervalMs = options.pollIntervalMs ?? 1500
  const maxPollAttempts = options.maxPollAttempts ?? 80
  const requestIdFactory =
    options.requestIdFactory ?? (() => crypto.randomUUID())
  const resolvedModelId = modelId || defaultModelId
  const resolvedApiBase = normalizedBaseUrl(apiBase || defaultApiBase)
  const createUrl = `${resolvedApiBase}/text-to-video/${encodeURIComponent(resolvedModelId)}`

  const provider: ModelProvider = {
    id: 'kling-api',
    name: 'Kling',
    modelName: modelId || 'Kling 2.6 官方 API',
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
      resolution: {
        type: 'enum',
        defaultValue: '720p',
        options: ['720p', '1080p'],
      },
      sound: { type: 'boolean', defaultValue: false },
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

      const requestId = requestIdFactory()
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }
      const createResponse = await fetchFn(createUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: request.prompt,
          settings: {
            audio: booleanSetting(request.parameters?.sound, false)
              ? 'native'
              : 'off',
            resolution: resolutionSetting(request.parameters?.resolution),
            aspect_ratio: aspectRatioSetting(request.parameters?.aspectRatio),
            duration: durationSetting(request.parameters?.duration),
          },
          options: {
            external_task_id: requestId,
            watermark_info: {
              enabled: booleanSetting(request.parameters?.watermark, false),
            },
          },
        }),
        signal: context.signal,
      })
      assertSuccessfulResponse(createResponse)
      const createBody = await readJson(createResponse) as KlingCreateResponse
      const taskId = createBody.data?.id
      const createStatus = createBody.data?.status
      if (
        createBody.code !== 0 ||
        typeof taskId !== 'string' ||
        !taskId ||
        typeof createStatus !== 'string' ||
        !createStatus
      ) {
        throw new Error('可灵创建任务响应格式异常')
      }
      context.onProgress?.(10)

      const statusUrl = `${resolvedApiBase}/tasks?external_task_ids=${encodeURIComponent(requestId)}`
      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        await waitForPoll(pollIntervalMs, context.signal)
        const statusResponse = await fetchFn(statusUrl, {
          method: 'GET',
          headers,
          signal: context.signal,
        })
        assertSuccessfulResponse(statusResponse)
        const statusBody = await readJson(statusResponse) as KlingTasksResponse
        const tasks = statusBody.data
        const task = Array.isArray(tasks)
          ? tasks.find(({ external_task_id }) => external_task_id === requestId) ??
            tasks.find(({ id }) => id === taskId)
          : undefined
        if (
          statusBody.code !== 0 ||
          !task ||
          typeof task.status !== 'string'
        ) {
          throw new Error('可灵任务状态响应格式异常')
        }
        if (task.status === 'failed') {
          throw new Error(
            `可灵生成失败：${safeFailureMessage(task.message ?? statusBody.message)}`,
          )
        }
        if (
          task.status === 'succeed' ||
          task.status === 'succeeded' ||
          task.status === 'completed'
        ) {
          const video = task.outputs?.find(({ type }) => type === 'video')
          if (!video) throw new Error('可灵结果 URL 无效')
          const result = liveResult(request, video)
          context.onProgress?.(100)
          return result
        }
        if (
          task.status !== 'submitted' &&
          task.status !== 'pending' &&
          task.status !== 'queued' &&
          task.status !== 'processing' &&
          task.status !== 'running'
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
