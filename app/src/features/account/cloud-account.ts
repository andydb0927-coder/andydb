import {
  CLOUD_DEVICE_TOKEN_KEY,
  CLOUD_RUNTIME_INVITE_CODE_KEY,
  DeviceTokenManager,
  cloudStorageConfiguration,
} from '../project/cloud-storage'

export const CLOUD_ACCOUNT_CACHE_KEY = 'wireless-canvas.cloud.account'
export const CLOUD_ACCOUNT_USAGE_EVENT = 'wireless-canvas:account-usage-changed'

export interface QuotaSummary {
  used: number
  limit: number
  remaining: number
}

export interface CloudAccount {
  userId: string
  createdAt: string
  usage: {
    imageCount: number
    videoSeconds: number
    textTokens: number
    audioCharacters: number
  }
  quota: {
    imageCount: QuotaSummary
    videoSeconds: QuotaSummary
    textTokens: QuotaSummary
    audioCharacters: QuotaSummary
  }
}

export interface CloudAccountClientOptions {
  backendUrl?: string
  inviteCode?: string
  fetchFn?: typeof fetch
  storage?: Storage
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function quotaSummary(value: unknown): QuotaSummary | undefined {
  const candidate = record(value)
  const used = nonNegativeInteger(candidate?.used)
  const limit = nonNegativeInteger(candidate?.limit)
  const remaining = nonNegativeInteger(candidate?.remaining)
  return used === undefined || limit === undefined || remaining === undefined
    ? undefined
    : { used, limit, remaining }
}

export function parseCloudAccount(value: unknown): CloudAccount | undefined {
  const candidate = record(value)
  const usage = record(candidate?.usage)
  const quota = record(candidate?.quota)
  const imageCount = nonNegativeInteger(usage?.imageCount)
  const videoSeconds = nonNegativeInteger(usage?.videoSeconds)
  const textTokens = nonNegativeInteger(usage?.textTokens)
  const audioCharacters = nonNegativeInteger(usage?.audioCharacters)
  const imageQuota = quotaSummary(quota?.imageCount)
  const videoQuota = quotaSummary(quota?.videoSeconds)
  const textQuota = quotaSummary(quota?.textTokens)
  const audioQuota = quotaSummary(quota?.audioCharacters)
  if (
    typeof candidate?.userId !== 'string' ||
    typeof candidate.createdAt !== 'string' ||
    imageCount === undefined || videoSeconds === undefined || textTokens === undefined ||
    audioCharacters === undefined || !imageQuota || !videoQuota || !textQuota || !audioQuota
  ) return undefined
  return {
    userId: candidate.userId,
    createdAt: candidate.createdAt,
    usage: { imageCount, videoSeconds, textTokens, audioCharacters },
    quota: {
      imageCount: imageQuota,
      videoSeconds: videoQuota,
      textTokens: textQuota,
      audioCharacters: audioQuota,
    },
  }
}

async function json(response: Response) {
  try {
    return await response.json() as unknown
  } catch {
    return undefined
  }
}

async function responseError(response: Response, fallback: string) {
  const body = record(await json(response))
  const error = record(body?.error)
  return new Error(typeof error?.message === 'string' ? error.message : fallback)
}

export class CloudAccountClient {
  readonly configured: boolean
  private readonly backendUrl: string
  private readonly inviteCode: string
  private readonly fetchFn: typeof fetch
  private readonly storage: Storage

  constructor(options: CloudAccountClientOptions = {}) {
    const configuration = cloudStorageConfiguration()
    this.backendUrl = (options.backendUrl ?? configuration.backendUrl).trim().replace(/\/+$/u, '')
    this.inviteCode = (options.inviteCode ?? configuration.inviteCode).trim()
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
    this.storage = options.storage ?? window.localStorage
    this.configured = Boolean(this.backendUrl)
  }

  cached() {
    try {
      return parseCloudAccount(JSON.parse(this.storage.getItem(CLOUD_ACCOUNT_CACHE_KEY) ?? 'null'))
    } catch {
      return undefined
    }
  }

  private save(account: CloudAccount | undefined) {
    if (account) this.storage.setItem(CLOUD_ACCOUNT_CACHE_KEY, JSON.stringify(account))
    else this.storage.removeItem(CLOUD_ACCOUNT_CACHE_KEY)
  }

  private tokenManager(inviteCode = this.inviteCode) {
    return new DeviceTokenManager({
      backendUrl: this.backendUrl,
      inviteCode,
      fetchFn: this.fetchFn,
      storage: this.storage,
    })
  }

  private async accountRequest(path: string, init: RequestInit, inviteCode = this.inviteCode) {
    const manager = this.tokenManager(inviteCode)
    const response = await this.fetchFn(`${this.backendUrl}${path}`, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers).entries()),
        Authorization: await manager.authorizationHeader(),
      },
    })
    if (response.status !== 401) return response
    await manager.token(true)
    return this.fetchFn(`${this.backendUrl}${path}`, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers).entries()),
        Authorization: await manager.authorizationHeader(),
      },
    })
  }

  async register(inviteCode: string) {
    if (!this.configured) throw new Error('云端账号服务未配置')
    const normalized = inviteCode.trim().toUpperCase()
    if (!normalized) throw new Error('请输入邀请码')
    const response = await this.accountRequest('/api/account/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode: normalized }),
    }, normalized)
    if (!response.ok) throw await responseError(response, '云端账号登录失败')
    const account = parseCloudAccount(await json(response))
    if (!account) throw new Error('云端账号响应格式不正确')
    this.storage.setItem(CLOUD_RUNTIME_INVITE_CODE_KEY, normalized)
    this.save(account)
    return account
  }

  async me() {
    if (!this.configured || !this.storage.getItem(CLOUD_DEVICE_TOKEN_KEY)) return undefined
    const response = await this.accountRequest('/api/account/me', { method: 'GET' })
    if (response.status === 403) {
      this.save(undefined)
      return undefined
    }
    if (!response.ok) throw await responseError(response, '无法读取云端账号')
    const account = parseCloudAccount(await json(response))
    if (!account) throw new Error('云端账号响应格式不正确')
    this.save(account)
    return account
  }
}
