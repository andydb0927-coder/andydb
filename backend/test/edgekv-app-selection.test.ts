import { describe, expect, it } from 'vitest'

import { createApp, storageBackend } from '../src/app'
import { EdgeKvAccountRepository } from '../src/account/edgekv-account-repository'
import { issueDeviceToken } from '../src/auth'
import type { AccountUsage } from '../src/account/account-repository'
import type { WorkerBindings } from '../src/bindings'
import { MemoryEdgeKv } from './edgekv-fixture'

const quota: AccountUsage = {
  imageCount: 10,
  videoSeconds: 60,
  textTokens: 10_000,
  audioCharacters: 1_000,
}
const now = Date.parse('2026-08-30T12:00:00.000Z')

function bindings(edgeKv: MemoryEdgeKv): WorkerBindings {
  return {
    DEVICE_TOKEN_SECRET: 'fixture-device-secret-with-enough-entropy',
    INVITE_CODES: '',
    ADMIN_TOKEN: 'fixture-admin-secret',
    ARK_API_KEY: 'fixture-ark-key',
    OPENSPEECH_API_KEY: 'fixture-openspeech-key',
    EDGEKV: edgeKv,
  }
}

describe('EdgeKV 运行时存储选择', () => {
  it('DB 与 EDGEKV 同时存在时保持 D1 优先', () => {
    const edgeKv = new MemoryEdgeKv()
    const env = { ...bindings(edgeKv), DB: {} as D1Database }
    expect(storageBackend(env)).toBe('d1')
    expect(storageBackend(bindings(edgeKv))).toBe('edgekv')
  })

  it('只有 EDGEKV 绑定时账号与项目路由共用 EdgeKV', async () => {
    const edgeKv = new MemoryEdgeKv()
    const env = bindings(edgeKv)
    const accounts = new EdgeKvAccountRepository(edgeKv)
    const timestamp = new Date(now).toISOString()
    await accounts.createInvite({ code: 'EDGE-APP', enabled: true, quota, createdAt: timestamp, updatedAt: timestamp })
    const app = createApp({ now: () => now })

    const device = await app.request('/api/auth/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'device-edge-app', inviteCode: 'EDGE-APP' }),
    }, env)
    expect(device.status).toBe(200)
    const token = await issueDeviceToken('device-edge-app', env, now)
    const registered = await app.request('/api/account/register', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode: 'EDGE-APP' }),
    }, env)
    expect(registered.status).toBe(201)

    const created = await app.request('/api/data/projects', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'project-edge-app', name: 'EdgeOne 项目', data: { nodes: [], edges: [] } }),
    }, env)
    expect(created.status).toBe(201)
    const listed = await app.request('/api/data/projects', {
      headers: { Authorization: `Bearer ${token}` },
    }, env)
    await expect(listed.json()).resolves.toMatchObject({
      projects: [{ id: 'project-edge-app', name: 'EdgeOne 项目', version: 1 }],
    })
  })
})
