import { beforeEach, describe, expect, test, vi } from 'vitest'

import {
  CloudAccountClient,
  CLOUD_ACCOUNT_CACHE_KEY,
  type CloudAccount,
} from './cloud-account'

const account: CloudAccount = {
  userId: 'user-fixture-0001',
  createdAt: '2026-08-30T09:00:00.000Z',
  usage: { imageCount: 1, videoSeconds: 5, textTokens: 120, audioCharacters: 30 },
  quota: {
    imageCount: { used: 1, limit: 10, remaining: 9 },
    videoSeconds: { used: 5, limit: 60, remaining: 55 },
    textTokens: { used: 120, limit: 10_000, remaining: 9_880 },
    audioCharacters: { used: 30, limit: 5_000, remaining: 4_970 },
  },
}

describe('cloud account client', () => {
  beforeEach(() => localStorage.clear())

  test('registers a device with an invite, persists the user and reuses the bearer for me', async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/auth/device')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ inviteCode: 'CREATOR-001' })
        return Response.json({ token: 'fixture-device-token' })
      }
      if (url.endsWith('/api/account/register')) {
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-device-token')
        return Response.json(account, { status: 201 })
      }
      if (url.endsWith('/api/account/me')) return Response.json(account)
      throw new Error(`unexpected request ${url}`)
    })
    const client = new CloudAccountClient({
      backendUrl: 'https://cloud.example',
      inviteCode: '',
      fetchFn,
      storage: localStorage,
    })

    await expect(client.register('CREATOR-001')).resolves.toEqual(account)
    expect(JSON.parse(localStorage.getItem(CLOUD_ACCOUNT_CACHE_KEY) ?? '{}')).toMatchObject({ userId: account.userId })
    await expect(client.me()).resolves.toEqual(account)
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  test('returns guest on account-required without deleting the existing device token', async () => {
    localStorage.setItem('wireless-canvas.cloud.device-token', 'fixture-device-token')
    const fetchFn = vi.fn().mockResolvedValue(Response.json({
      error: { code: 'ACCOUNT_REQUIRED', message: '请先使用邀请码登录云端账号。' },
    }, { status: 403 }))
    const client = new CloudAccountClient({
      backendUrl: 'https://cloud.example',
      inviteCode: '',
      fetchFn,
      storage: localStorage,
    })

    await expect(client.me()).resolves.toBeUndefined()
    expect(localStorage.getItem('wireless-canvas.cloud.device-token')).toBe('fixture-device-token')
    expect(localStorage.getItem(CLOUD_ACCOUNT_CACHE_KEY)).toBeNull()
  })
})
