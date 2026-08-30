import { describe, expect, it } from 'vitest'

import { EdgeKvAccountRepository } from '../src/account/edgekv-account-repository'
import type { AccountUsage } from '../src/account/account-repository'
import { MemoryEdgeKv } from './edgekv-fixture'

const quota: AccountUsage = {
  imageCount: 1,
  videoSeconds: 10,
  textTokens: 1_000,
  audioCharacters: 100,
}
const timestamp = '2026-08-30T11:00:00.000Z'

describe('EdgeKvAccountRepository', () => {
  it('完成邀请码、账号、多设备和停用生命周期', async () => {
    const kv = new MemoryEdgeKv()
    const repository = new EdgeKvAccountRepository(kv)
    const invite = { code: 'EDGE-001', enabled: true, quota, createdAt: timestamp, updatedAt: timestamp }

    await expect(repository.createInvite(invite)).resolves.toBe(true)
    await expect(repository.createInvite(invite)).resolves.toBe(false)
    const first = await repository.registerDevice('EDGE-001', 'device-edge-1', 'user-edge-1', timestamp)
    const second = await repository.registerDevice('EDGE-001', 'device-edge-2', 'ignored-user', timestamp)
    expect(first).toMatchObject({ status: 'registered', account: { userId: 'user-edge-1' } })
    expect(second).toMatchObject({ status: 'registered', account: { userId: 'user-edge-1' } })
    expect([...kv.values.keys()]).toEqual(expect.arrayContaining([
      'v1:user:user-edge-1:account',
      'v1:user:user-edge-1:usage',
    ]))

    await expect(repository.updateInvite({
      ...(await repository.getInvite('EDGE-001'))!,
      quota: { ...quota, imageCount: 2 },
      updatedAt: '2026-08-30T11:01:00.000Z',
    })).resolves.toBe(true)
    await expect(repository.getAccountByDevice('device-edge-2')).resolves.toMatchObject({
      userId: 'user-edge-1', quota: { imageCount: 2 },
    })
    await expect(repository.disableInvite('EDGE-001', '2026-08-30T11:02:00.000Z')).resolves.toBe(true)
    await expect(repository.getInvite('EDGE-001')).resolves.toMatchObject({ enabled: false })
    await expect(repository.listInvites()).resolves.toHaveLength(1)
  })

  it('并发用量预留按配额只允许一个成功，并可回滚', async () => {
    const repository = new EdgeKvAccountRepository(new MemoryEdgeKv())
    await repository.createInvite({ code: 'EDGE-LIMIT', enabled: true, quota, createdAt: timestamp, updatedAt: timestamp })
    await repository.registerDevice('EDGE-LIMIT', 'device-limit', 'user-limit', timestamp)

    const reservations = await Promise.all([
      repository.reserveUsage('user-limit', 'imageCount', 1),
      repository.reserveUsage('user-limit', 'imageCount', 1),
    ])
    expect(reservations.filter(Boolean)).toHaveLength(1)
    await repository.releaseUsage('user-limit', 'imageCount', 1)
    await expect(repository.reserveUsage('user-limit', 'imageCount', 1)).resolves.toBe(true)
  })

  it('设备不能改绑到另一个邀请码', async () => {
    const repository = new EdgeKvAccountRepository(new MemoryEdgeKv())
    await repository.createInvite({ code: 'EDGE-A', enabled: true, quota, createdAt: timestamp, updatedAt: timestamp })
    await repository.createInvite({ code: 'EDGE-B', enabled: true, quota, createdAt: timestamp, updatedAt: timestamp })
    await repository.registerDevice('EDGE-A', 'device-conflict', 'user-a', timestamp)
    await expect(repository.registerDevice('EDGE-B', 'device-conflict', 'user-b', timestamp))
      .resolves.toEqual({ status: 'device-conflict' })
  })
})
