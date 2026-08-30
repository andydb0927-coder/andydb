import type { Hono, MiddlewareHandler } from 'hono'

import { deviceAuthMiddleware } from '../auth'
import type { AppEnv } from '../bindings'
import { errorResponse } from '../errors'
import {
  defaultAccountQuota,
  type AccountProfile,
  type AccountRepository,
  type AccountUsage,
} from './account-repository'

export interface AccountRouteOptions {
  repository(env: AppEnv['Bindings']): AccountRepository | undefined
  now: () => number
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  })
}

async function requestJson(request: Request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) return undefined
  try {
    return await request.json() as unknown
  } catch {
    return undefined
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function inviteCode(value: unknown) {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toUpperCase()
  return /^[A-Z0-9_-]{4,64}$/u.test(normalized) ? normalized : undefined
}

function quotaValue(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10_000_000
    ? value
    : undefined
}

function quotaInput(value: unknown, fallback = defaultAccountQuota): AccountUsage | undefined {
  const candidate = record(value)
  if (!candidate) return undefined
  const imageCount = quotaValue(candidate.imageCount)
  const videoSeconds = quotaValue(candidate.videoSeconds)
  const textTokens = quotaValue(candidate.textTokens)
  const audioCharacters = quotaValue(candidate.audioCharacters)
  if ([imageCount, videoSeconds, textTokens, audioCharacters].some((item) => item === undefined)) {
    return undefined
  }
  return {
    imageCount: imageCount ?? fallback.imageCount,
    videoSeconds: videoSeconds ?? fallback.videoSeconds,
    textTokens: textTokens ?? fallback.textTokens,
    audioCharacters: audioCharacters ?? fallback.audioCharacters,
  }
}

function remaining(limit: number, used: number) {
  return { used, limit, remaining: Math.max(0, limit - used) }
}

export function publicAccount(account: AccountProfile) {
  return {
    userId: account.userId,
    createdAt: account.createdAt,
    usage: account.usage,
    quota: {
      imageCount: remaining(account.quota.imageCount, account.usage.imageCount),
      videoSeconds: remaining(account.quota.videoSeconds, account.usage.videoSeconds),
      textTokens: remaining(account.quota.textTokens, account.usage.textTokens),
      audioCharacters: remaining(account.quota.audioCharacters, account.usage.audioCharacters),
    },
  }
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

function adminAuth(): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const configured = context.env.ADMIN_TOKEN?.trim()
    if (!configured) return errorResponse(503, 'ADMIN_NOT_CONFIGURED', '管理端鉴权尚未配置。')
    const authorization = context.req.header('Authorization') ?? ''
    const supplied = /^Bearer\s+(.+)$/iu.exec(authorization)?.[1] ?? ''
    if (!secureEqual(supplied, configured)) {
      return errorResponse(401, 'ADMIN_AUTH_REQUIRED', '需要管理端凭证。')
    }
    await next()
  }
}

export function registerAccountRoutes(app: Hono<AppEnv>, options: AccountRouteOptions) {
  const repository = (env: AppEnv['Bindings']) => options.repository(env)
  const requiredRepository = (env: AppEnv['Bindings']) => {
    const value = repository(env)
    return value ?? errorResponse(503, 'ACCOUNT_STORE_NOT_CONFIGURED', '账号存储服务尚未配置。')
  }

  app.use('/api/account/*', deviceAuthMiddleware(options.now))
  app.use('/api/admin/*', adminAuth())

  app.post('/api/account/register', async (context) => {
    const store = requiredRepository(context.env)
    if (store instanceof Response) return store
    const input = record(await requestJson(context.req.raw))
    const code = inviteCode(input?.inviteCode)
    if (!code) return errorResponse(400, 'INVALID_REQUEST', '邀请码格式不正确。')
    const before = await store.getInvite(code)
    const result = await store.registerDevice(
      code,
      context.get('deviceId'),
      `user-${crypto.randomUUID()}`,
      new Date(options.now()).toISOString(),
    )
    if (result.status === 'invalid-invite') {
      return errorResponse(403, 'INVITE_CODE_INVALID', '邀请码无效或已停用。')
    }
    if (result.status === 'device-conflict') {
      return errorResponse(409, 'DEVICE_ACCOUNT_CONFLICT', '当前设备已绑定其他账号。')
    }
    return jsonResponse(publicAccount(result.account), before?.userId ? 200 : 201)
  })

  app.get('/api/account/me', async (context) => {
    const store = requiredRepository(context.env)
    if (store instanceof Response) return store
    const account = await store.getAccountByDevice(context.get('deviceId'))
    return account
      ? jsonResponse(publicAccount(account))
      : errorResponse(403, 'ACCOUNT_REQUIRED', '请先使用邀请码登录云端账号。')
  })

  app.get('/api/admin/invites', async (context) => {
    const store = requiredRepository(context.env)
    if (store instanceof Response) return store
    return jsonResponse({ invites: await store.listInvites() })
  })

  app.post('/api/admin/invites', async (context) => {
    const store = requiredRepository(context.env)
    if (store instanceof Response) return store
    const input = record(await requestJson(context.req.raw))
    const code = inviteCode(input?.code)
    const quota = quotaInput(input?.quota)
    if (!code || !quota) return errorResponse(400, 'INVALID_REQUEST', '邀请码或配额格式不正确。')
    const timestamp = new Date(options.now()).toISOString()
    const invite = { code, enabled: true, quota, createdAt: timestamp, updatedAt: timestamp }
    if (!await store.createInvite(invite)) {
      return errorResponse(409, 'INVITE_EXISTS', '邀请码已存在。')
    }
    return jsonResponse(invite, 201)
  })

  app.put('/api/admin/invites/:code', async (context) => {
    const store = requiredRepository(context.env)
    if (store instanceof Response) return store
    const code = inviteCode(context.req.param('code'))
    const current = code ? await store.getInvite(code) : undefined
    const input = record(await requestJson(context.req.raw))
    const quota = quotaInput(input?.quota)
    if (!current || !quota || (input?.enabled !== undefined && typeof input.enabled !== 'boolean')) {
      return current
        ? errorResponse(400, 'INVALID_REQUEST', '邀请码配额格式不正确。')
        : errorResponse(404, 'INVITE_NOT_FOUND', '邀请码不存在。')
    }
    const updated = {
      ...current,
      enabled: typeof input?.enabled === 'boolean' ? input.enabled : current.enabled,
      quota,
      updatedAt: new Date(options.now()).toISOString(),
    }
    await store.updateInvite(updated)
    return jsonResponse(updated)
  })

  app.delete('/api/admin/invites/:code', async (context) => {
    const store = requiredRepository(context.env)
    if (store instanceof Response) return store
    const code = inviteCode(context.req.param('code'))
    if (!code || !await store.disableInvite(code, new Date(options.now()).toISOString())) {
      return errorResponse(404, 'INVITE_NOT_FOUND', '邀请码不存在。')
    }
    return new Response(null, { status: 204 })
  })
}
