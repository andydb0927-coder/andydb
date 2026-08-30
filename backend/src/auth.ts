import type { MiddlewareHandler } from 'hono'
import type { AppEnv, WorkerBindings } from './bindings'
import { errorResponse } from './errors'

interface DeviceTokenPayload {
  deviceId: string
  issuedAt: number
  expiresAt: number
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function byteString(bytes: Uint8Array) {
  let value = ''
  for (const byte of bytes) value += String.fromCharCode(byte)
  return value
}

function base64UrlEncode(bytes: Uint8Array) {
  return btoa(byteString(bytes))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/gu, '')
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(`${normalized}${padding}`)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!
  }
  return difference === 0
}

function tokenTtlSeconds(env: WorkerBindings) {
  const parsed = Number(env.DEVICE_TOKEN_TTL_SECONDS)
  return Number.isInteger(parsed) && parsed >= 300 && parsed <= 604_800
    ? parsed
    : 86_400
}

function validDeviceId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,128}$/u.test(value)
}

export function inviteCodeAllowed(value: unknown, configuredCodes?: string) {
  if (typeof value !== 'string' || !value.trim()) return false
  const allowedCodes = (configuredCodes ?? '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
  return allowedCodes.includes(value.trim())
}

export async function issueDeviceToken(
  deviceId: string,
  env: WorkerBindings,
  nowMs = Date.now(),
) {
  const issuedAt = Math.floor(nowMs / 1_000)
  const payload: DeviceTokenPayload = {
    deviceId,
    issuedAt,
    expiresAt: issuedAt + tokenTtlSeconds(env),
  }
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const signature = base64UrlEncode(await hmac(`v1.${encodedPayload}`, env.DEVICE_TOKEN_SECRET))
  return `v1.${encodedPayload}.${signature}`
}

function parsedPayload(value: Uint8Array): DeviceTokenPayload | undefined {
  try {
    const parsed = JSON.parse(decoder.decode(value)) as unknown
    if (!parsed || typeof parsed !== 'object') return undefined
    const candidate = parsed as Record<string, unknown>
    if (
      !validDeviceId(candidate.deviceId) ||
      typeof candidate.issuedAt !== 'number' ||
      typeof candidate.expiresAt !== 'number'
    ) return undefined
    return {
      deviceId: candidate.deviceId,
      issuedAt: candidate.issuedAt,
      expiresAt: candidate.expiresAt,
    }
  } catch {
    return undefined
  }
}

export async function verifyDeviceToken(
  token: string,
  env: WorkerBindings,
  nowMs = Date.now(),
) {
  const [version, encodedPayload, encodedSignature, extra] = token.split('.')
  if (version !== 'v1' || !encodedPayload || !encodedSignature || extra) return undefined
  try {
    const supplied = base64UrlDecode(encodedSignature)
    const expected = await hmac(`v1.${encodedPayload}`, env.DEVICE_TOKEN_SECRET)
    if (!equalBytes(supplied, expected)) return undefined
    const payload = parsedPayload(base64UrlDecode(encodedPayload))
    if (!payload || payload.expiresAt <= Math.floor(nowMs / 1_000)) return undefined
    return payload
  } catch {
    return undefined
  }
}

export function deviceAuthMiddleware(now: () => number): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    if (!context.env.DEVICE_TOKEN_SECRET?.trim()) {
      return errorResponse(503, 'AUTH_NOT_CONFIGURED', '设备鉴权服务尚未配置。')
    }
    const authorization = context.req.header('Authorization') ?? ''
    const match = /^Bearer\s+(.+)$/iu.exec(authorization)
    if (!match?.[1]) {
      return errorResponse(401, 'AUTH_REQUIRED', '请先完成设备验证。')
    }
    const payload = await verifyDeviceToken(match[1], context.env, now())
    if (!payload) {
      return errorResponse(401, 'DEVICE_TOKEN_INVALID', '设备凭证无效或已过期。')
    }
    context.set('deviceId', payload.deviceId)
    await next()
  }
}

export function parseDeviceRegistration(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Record<string, unknown>
  if (!validDeviceId(candidate.deviceId) || typeof candidate.inviteCode !== 'string') {
    return undefined
  }
  return { deviceId: candidate.deviceId, inviteCode: candidate.inviteCode }
}
