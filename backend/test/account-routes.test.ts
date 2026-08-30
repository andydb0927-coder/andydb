import { describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app'
import { issueDeviceToken } from '../src/auth'
import type {
  AccountProfile,
  AccountRepository,
  AccountUsage,
  InviteRecord,
  RegisterAccountResult,
  UsageModality,
} from '../src/account/account-repository'
import type { WorkerBindings } from '../src/bindings'
import { actualUsageAmount, usageReservation } from '../src/account/account-usage'

const quota: AccountUsage = {
  imageCount: 2,
  videoSeconds: 10,
  textTokens: 1_000,
  audioCharacters: 100,
}

const env: WorkerBindings = {
  DEVICE_TOKEN_SECRET: 'fixture-device-secret-with-enough-entropy',
  INVITE_CODES: '',
  ADMIN_TOKEN: 'fixture-admin-secret',
  ARK_API_KEY: 'fixture-ark-key',
  OPENSPEECH_API_KEY: 'fixture-openspeech-key',
  ARK_API_BASE: 'https://fixture.ark.invalid/api/v3',
  OPENSPEECH_API_BASE: 'https://fixture.speech.invalid/api/v3',
  SEEDREAM_MODEL_ID: 'fixture-seedream',
  SEEDANCE_MODEL_ID: 'fixture-seedance',
  ARK_TEXT_MODEL_ID: 'fixture-doubao',
  OPENSPEECH_RESOURCE_ID: 'fixture-tts-resource',
}

function emptyUsage(): AccountUsage {
  return { imageCount: 0, videoSeconds: 0, textTokens: 0, audioCharacters: 0 }
}

class MemoryAccountRepository implements AccountRepository {
  readonly invites = new Map<string, InviteRecord>()
  readonly devices = new Map<string, string>()
  readonly usages = new Map<string, AccountUsage>()

  async listInvites() {
    return [...this.invites.values()].map((invite) => structuredClone(invite))
  }

  async getInvite(code: string) {
    const invite = this.invites.get(code)
    return invite ? structuredClone(invite) : undefined
  }

  async createInvite(invite: InviteRecord) {
    if (this.invites.has(invite.code)) return false
    this.invites.set(invite.code, structuredClone(invite))
    return true
  }

  async updateInvite(invite: InviteRecord) {
    if (!this.invites.has(invite.code)) return false
    this.invites.set(invite.code, structuredClone(invite))
    return true
  }

  async disableInvite(code: string, updatedAt: string) {
    const invite = this.invites.get(code)
    if (!invite) return false
    this.invites.set(code, { ...invite, enabled: false, updatedAt })
    return true
  }

  async registerDevice(code: string, deviceId: string, userId: string, now: string): Promise<RegisterAccountResult> {
    const existingUserId = this.devices.get(deviceId)
    if (existingUserId) {
      const account = await this.getAccountByDevice(deviceId)
      return account?.inviteCode === code
        ? { status: 'registered', account }
        : { status: 'device-conflict' }
    }
    const invite = this.invites.get(code)
    if (!invite || !invite.enabled) return { status: 'invalid-invite' }
    const resolvedUserId = invite.userId ?? userId
    this.invites.set(code, { ...invite, userId: resolvedUserId, updatedAt: now })
    this.devices.set(deviceId, resolvedUserId)
    this.usages.set(resolvedUserId, this.usages.get(resolvedUserId) ?? emptyUsage())
    const account = await this.getAccountByDevice(deviceId)
    if (!account) throw new Error('fixture account missing')
    return { status: 'registered', account }
  }

  async getAccountByDevice(deviceId: string): Promise<AccountProfile | undefined> {
    const userId = this.devices.get(deviceId)
    if (!userId) return undefined
    const invite = [...this.invites.values()].find((candidate) => candidate.userId === userId)
    if (!invite) return undefined
    return {
      userId,
      inviteCode: invite.code,
      quota: structuredClone(invite.quota),
      usage: structuredClone(this.usages.get(userId) ?? emptyUsage()),
      createdAt: invite.createdAt,
    }
  }

  async reserveUsage(userId: string, modality: UsageModality, amount: number) {
    const invite = [...this.invites.values()].find((candidate) => candidate.userId === userId)
    if (!invite) return false
    const usage = this.usages.get(userId) ?? emptyUsage()
    if (usage[modality] + amount > invite.quota[modality]) return false
    this.usages.set(userId, { ...usage, [modality]: usage[modality] + amount })
    return true
  }

  async releaseUsage(userId: string, modality: UsageModality, amount: number) {
    const usage = this.usages.get(userId) ?? emptyUsage()
    this.usages.set(userId, { ...usage, [modality]: Math.max(0, usage[modality] - amount) })
  }
}

async function bearer(deviceId: string) {
  return issueDeviceToken(deviceId, env, Date.parse('2026-08-30T09:00:00.000Z'))
}

function authorization(token: string, body?: unknown): RequestInit {
  return {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }
}

describe('简单账号与邀请码', () => {
  it('只配置 D1 邀请码时仍可换取设备 token', async () => {
    const repository = new MemoryAccountRepository()
    const now = '2026-08-30T09:00:00.000Z'
    await repository.createInvite({ code: 'D1-ONLY', enabled: true, quota, createdAt: now, updatedAt: now })
    const app = createApp({ accountRepository: repository, now: () => Date.parse(now) })

    const response = await app.request('/api/auth/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'fixture-device-d1-only', inviteCode: 'D1-ONLY' }),
    }, env)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ tokenType: 'Bearer' })
  })

  it('管理端校验后完成邀请码 CRUD，普通设备 token 不能管理', async () => {
    const repository = new MemoryAccountRepository()
    const app = createApp({ accountRepository: repository, now: () => Date.parse('2026-08-30T09:00:00.000Z') })
    const denied = await app.request('/api/admin/invites', { method: 'GET' }, env)
    expect(denied.status).toBe(401)

    const created = await app.request('/api/admin/invites', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'CREATOR-001', quota }),
    }, env)
    expect(created.status).toBe(201)
    await expect(created.json()).resolves.toMatchObject({ code: 'CREATOR-001', enabled: true, quota })

    const updated = await app.request('/api/admin/invites/CREATOR-001', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quota: { ...quota, imageCount: 3 } }),
    }, env)
    expect(updated.status).toBe(200)
    await expect(updated.json()).resolves.toMatchObject({ quota: { imageCount: 3 } })

    const removed = await app.request('/api/admin/invites/CREATOR-001', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}` },
    }, env)
    expect(removed.status).toBe(204)
    expect((await repository.getInvite('CREATOR-001'))?.enabled).toBe(false)
  })

  it('同一邀请码把多个设备 token 绑定到同一 user_id，并返回相同配额', async () => {
    const repository = new MemoryAccountRepository()
    const now = '2026-08-30T09:00:00.000Z'
    await repository.createInvite({ code: 'TEAM-001', enabled: true, quota, createdAt: now, updatedAt: now })
    const app = createApp({ accountRepository: repository, now: () => Date.parse(now) })

    const register = async (deviceId: string) => app.request('/api/account/register', authorization(
      await bearer(deviceId),
      { inviteCode: 'TEAM-001' },
    ), env)
    const first = await register('fixture-device-0001')
    const second = await register('fixture-device-0002')
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    const firstBody = await first.json() as { userId: string }
    const secondBody = await second.json() as { userId: string }
    expect(secondBody.userId).toBe(firstBody.userId)

    const me = await app.request('/api/account/me', authorization(await bearer('fixture-device-0002')), env)
    await expect(me.json()).resolves.toMatchObject({
      userId: firstBody.userId,
      quota: {
        imageCount: { used: 0, limit: 2, remaining: 2 },
        videoSeconds: { used: 0, limit: 10, remaining: 10 },
      },
    })
  })
})

describe('账号用量与配额', () => {
  it('四类代理按声明单位预留用量，文本以上游实际 token 校准', async () => {
    expect(usageReservation('image', {}, 'user-fixture')).toMatchObject({
      modality: 'imageCount', amount: 1,
    })
    expect(usageReservation('video', { duration: 8 }, 'user-fixture')).toMatchObject({
      modality: 'videoSeconds', amount: 8,
    })
    expect(usageReservation('tts', { text: '你好，画布' }, 'user-fixture')).toMatchObject({
      modality: 'audioCharacters', amount: 5,
    })
    const textReservation = usageReservation('text', {
      prompt: '写一段开场', maxTokens: 500,
    }, 'user-fixture')
    expect(textReservation).toMatchObject({ modality: 'textTokens', amount: 505 })
    await expect(actualUsageAmount(
      'text',
      Response.json({ usage: { total_tokens: 137 } }),
      textReservation.amount,
    )).resolves.toBe(137)
  })

  it('代理成功才累计真实用量，失败会释放预留额度', async () => {
    const repository = new MemoryAccountRepository()
    const now = '2026-08-30T09:00:00.000Z'
    await repository.createInvite({ code: 'USAGE-001', enabled: true, quota, createdAt: now, updatedAt: now })
    await repository.registerDevice('USAGE-001', 'fixture-device-usage', 'user-fixture-usage', now)
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [{ url: 'https://fixture.invalid/image.png' }] }))
      .mockResolvedValueOnce(Response.json({ error: { message: 'upstream failed' } }, { status: 500 }))
    const app = createApp({ accountRepository: repository, fetchFn, now: () => Date.parse(now) })
    const token = await bearer('fixture-device-usage')

    const succeeded = await app.request('/api/proxy/image', authorization(token, {
      prompt: '清晨薄雾中的古桥', size: '1424x800',
    }), env)
    expect(succeeded.status).toBe(200)
    const failed = await app.request('/api/proxy/image', authorization(token, {
      prompt: '雨夜石桥', size: '1424x800',
    }), env)
    expect(failed.status).toBe(502)

    const me = await app.request('/api/account/me', authorization(token), env)
    await expect(me.json()).resolves.toMatchObject({
      usage: { imageCount: 1 },
      quota: { imageCount: { used: 1, limit: 2, remaining: 1 } },
    })
  })

  it('超过图片配额时返回中文 403 且不调用上游', async () => {
    const repository = new MemoryAccountRepository()
    const now = '2026-08-30T09:00:00.000Z'
    await repository.createInvite({ code: 'LIMIT-001', enabled: true, quota: { ...quota, imageCount: 1 }, createdAt: now, updatedAt: now })
    await repository.registerDevice('LIMIT-001', 'fixture-device-limit', 'user-fixture-limit', now)
    expect(await repository.reserveUsage('user-fixture-limit', 'imageCount', 1)).toBe(true)
    const fetchFn = vi.fn<typeof fetch>()
    const app = createApp({ accountRepository: repository, fetchFn, now: () => Date.parse(now) })
    const response = await app.request('/api/proxy/image', authorization(await bearer('fixture-device-limit'), {
      prompt: '超额请求', size: '1424x800',
    }), env)

    expect(response.status).toBe(403)
    expect(fetchFn).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      error: { code: 'QUOTA_EXCEEDED', message: '图片生成额度不足，请查看账号用量。' },
    })
  })
})
