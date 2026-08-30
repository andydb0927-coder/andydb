import { Hono } from 'hono'
import { deviceAuthMiddleware, inviteCodeAllowed, issueDeviceToken, parseDeviceRegistration } from './auth'
import type { AppEnv } from './bindings'
import { errorResponse } from './errors'
import {
  imageUpstreamRequest,
  textUpstreamRequest,
  ttsUpstreamRequest,
  videoTaskUpstreamRequest,
  videoUpstreamRequest,
  type UpstreamRequest,
} from './proxy-contracts'
import { forwardUpstream } from './upstream'
import { registerDataRoutes, type DataRouteOptions } from './data/data-routes'

export interface AppOptions extends Omit<DataRouteOptions, 'now'> {
  fetchFn?: typeof fetch
  now?: () => number
  timeoutMs?: number
}

async function requestJson(request: Request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
    return undefined
  }
  try {
    return await request.json() as unknown
  } catch {
    return undefined
  }
}

function requiredConfiguration(
  route: 'image' | 'video' | 'text' | 'tts',
  env: AppEnv['Bindings'],
) {
  if (route === 'tts') {
    return Boolean(env.OPENSPEECH_API_KEY?.trim() && env.OPENSPEECH_RESOURCE_ID?.trim())
  }
  const modelId = route === 'image'
    ? env.SEEDREAM_MODEL_ID
    : route === 'video'
      ? env.SEEDANCE_MODEL_ID
      : env.ARK_TEXT_MODEL_ID
  return Boolean(env.ARK_API_KEY?.trim() && modelId?.trim())
}

type ProxyBuilder = (value: unknown, env: AppEnv['Bindings']) => UpstreamRequest | undefined

export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppEnv>()
  const fetchFn = options.fetchFn ?? fetch
  const now = options.now ?? Date.now

  app.get('/api/health', (context) => context.json({ status: 'ok' }))

  app.post('/api/auth/device', async (context) => {
    if (!context.env.DEVICE_TOKEN_SECRET?.trim() || !context.env.INVITE_CODES?.trim()) {
      return errorResponse(503, 'AUTH_NOT_CONFIGURED', '设备鉴权服务尚未配置。')
    }
    const registration = parseDeviceRegistration(await requestJson(context.req.raw))
    if (!registration) {
      return errorResponse(400, 'INVALID_REQUEST', '设备标识或邀请码格式不正确。')
    }
    if (!inviteCodeAllowed(registration.inviteCode, context.env.INVITE_CODES)) {
      return errorResponse(403, 'INVITE_CODE_INVALID', '邀请码无效或已停用。')
    }
    const token = await issueDeviceToken(registration.deviceId, context.env, now())
    return context.json({
      token,
      tokenType: 'Bearer',
      expiresIn: Number(context.env.DEVICE_TOKEN_TTL_SECONDS) || 86_400,
    })
  })

  app.use('/api/proxy/*', deviceAuthMiddleware(now))

  const registerProxy = (
    path: string,
    route: 'image' | 'video' | 'text' | 'tts',
    buildRequest: ProxyBuilder,
  ) => {
    app.post(path, async (context) => {
      if (!requiredConfiguration(route, context.env)) {
        return errorResponse(503, 'PROVIDER_NOT_CONFIGURED', '上游服务配置未完成。')
      }
      const upstream = buildRequest(await requestJson(context.req.raw), context.env)
      if (!upstream) {
        return errorResponse(400, 'INVALID_REQUEST', '请求参数不合法，请检查后重试。')
      }
      return forwardUpstream(upstream, context.env, {
        fetchFn,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      })
    })
  }

  registerProxy('/api/proxy/image', 'image', imageUpstreamRequest)
  registerProxy('/api/proxy/video', 'video', videoUpstreamRequest)
  registerProxy('/api/proxy/text', 'text', textUpstreamRequest)
  registerProxy('/api/proxy/tts', 'tts', ttsUpstreamRequest)

  app.get('/api/proxy/video/:taskId', async (context) => {
    if (!requiredConfiguration('video', context.env)) {
      return errorResponse(503, 'PROVIDER_NOT_CONFIGURED', '上游服务配置未完成。')
    }
    const upstream = videoTaskUpstreamRequest(context.req.param('taskId'), context.env)
    if (!upstream) {
      return errorResponse(400, 'INVALID_REQUEST', '视频任务 ID 不合法。')
    }
    return forwardUpstream(upstream, context.env, {
      fetchFn,
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    })
  })

  registerDataRoutes(app, {
    now,
    ...(options.dataRepository === undefined ? {} : { dataRepository: options.dataRepository }),
    ...(options.snapshotStore === undefined ? {} : { snapshotStore: options.snapshotStore }),
    ...(options.snapshotThresholdBytes === undefined
      ? {}
      : { snapshotThresholdBytes: options.snapshotThresholdBytes }),
  })

  app.notFound(() => errorResponse(404, 'ROUTE_NOT_FOUND', '请求的接口不存在。'))
  app.onError((error) => {
    console.error('worker_unhandled_error', { name: error.name })
    return errorResponse(500, 'INTERNAL_ERROR', '服务暂时不可用，请稍后重试。')
  })

  return app
}
