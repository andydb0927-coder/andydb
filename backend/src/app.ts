import { Hono } from 'hono'
import { deviceAuthMiddleware, inviteCodeAllowed, issueDeviceToken, parseDeviceRegistration } from './auth'
import type { AppEnv } from './bindings'
import { registerAccountRoutes } from './account/account-routes'
import type { AccountRepository } from './account/account-repository'
import { D1AccountRepository } from './account/d1-account-repository'
import {
  actualUsageAmount,
  releaseUnusedReservation,
  usageReservation,
  type MeteredProxyRoute,
} from './account/account-usage'
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
  accountRepository?: AccountRepository
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
  const accountRepository = (env: AppEnv['Bindings']) =>
    options.accountRepository ?? (env.DB ? new D1AccountRepository(env.DB) : undefined)

  app.get('/api/health', (context) => context.json({ status: 'ok' }))

  app.post('/api/auth/device', async (context) => {
    if (!context.env.DEVICE_TOKEN_SECRET?.trim()) {
      return errorResponse(503, 'AUTH_NOT_CONFIGURED', '设备鉴权服务尚未配置。')
    }
    const registration = parseDeviceRegistration(await requestJson(context.req.raw))
    if (!registration) {
      return errorResponse(400, 'INVALID_REQUEST', '设备标识或邀请码格式不正确。')
    }
    const accountInvite = await accountRepository(context.env)?.getInvite(registration.inviteCode.trim().toUpperCase())
    if (!inviteCodeAllowed(registration.inviteCode, context.env.INVITE_CODES) && !accountInvite?.enabled) {
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
    route: MeteredProxyRoute,
    buildRequest: ProxyBuilder,
  ) => {
    app.post(path, async (context) => {
      if (!requiredConfiguration(route, context.env)) {
        return errorResponse(503, 'PROVIDER_NOT_CONFIGURED', '上游服务配置未完成。')
      }
      const input = await requestJson(context.req.raw)
      const upstream = buildRequest(input, context.env)
      if (!upstream) {
        return errorResponse(400, 'INVALID_REQUEST', '请求参数不合法，请检查后重试。')
      }
      const accounts = accountRepository(context.env)
      const account = accounts
        ? await accounts.getAccountByDevice(context.get('deviceId'))
        : undefined
      if (accounts && !account) {
        return errorResponse(403, 'ACCOUNT_REQUIRED', '请先使用邀请码登录云端账号。')
      }
      const reservation = account ? usageReservation(route, input, account.userId) : undefined
      if (accounts && reservation && !await accounts.reserveUsage(
        reservation.userId,
        reservation.modality,
        reservation.amount,
      )) {
        return errorResponse(
          403,
          'QUOTA_EXCEEDED',
          `${reservation.label}额度不足，请查看账号用量。`,
        )
      }
      const response = await forwardUpstream(upstream, context.env, {
        fetchFn,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      })
      if (accounts && reservation) {
        if (!response.ok) {
          await accounts.releaseUsage(reservation.userId, reservation.modality, reservation.amount)
        } else {
          await releaseUnusedReservation(
            accounts,
            reservation,
            await actualUsageAmount(route, response, reservation.amount),
          )
        }
      }
      return response
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
    const accounts = accountRepository(context.env)
    if (accounts && !await accounts.getAccountByDevice(context.get('deviceId'))) {
      return errorResponse(403, 'ACCOUNT_REQUIRED', '请先使用邀请码登录云端账号。')
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

  registerAccountRoutes(app, { repository: accountRepository, now })

  registerDataRoutes(app, {
    now,
    ...(options.dataRepository === undefined ? {} : { dataRepository: options.dataRepository }),
    ...(options.snapshotStore === undefined ? {} : { snapshotStore: options.snapshotStore }),
    ...(options.snapshotThresholdBytes === undefined
      ? {}
      : { snapshotThresholdBytes: options.snapshotThresholdBytes }),
    resolveOwnerId: async (env, deviceId) =>
      (await accountRepository(env)?.getAccountByDevice(deviceId))?.userId ?? deviceId,
  })

  app.notFound(() => errorResponse(404, 'ROUTE_NOT_FOUND', '请求的接口不存在。'))
  app.onError((error) => {
    console.error('worker_unhandled_error', { name: error.name })
    return errorResponse(500, 'INTERNAL_ERROR', '服务暂时不可用，请稍后重试。')
  })

  return app
}
