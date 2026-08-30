import { describe, expect, it } from 'vitest'

import { EdgeKvDataRepository } from '../src/data/edgekv-data-repository'
import { MemoryEdgeKv } from './edgekv-fixture'

const timestamp = '2026-08-30T10:00:00.000Z'

describe('EdgeKvDataRepository', () => {
  it('按用户命名空间完成项目 CRUD 并保留乐观锁 version', async () => {
    const kv = new MemoryEdgeKv()
    const repository = new EdgeKvDataRepository(kv)
    const created = await repository.createProject({
      id: 'project-edge-1',
      userToken: 'user-edge-1',
      name: 'EdgeKV 项目',
      dataJson: '{"nodes":[]}',
      snapshotKvKey: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    expect(created).toMatchObject({ id: 'project-edge-1', version: 1 })
    expect(await repository.createProject({
      id: 'project-edge-1',
      userToken: 'user-edge-1',
      name: '重复项目',
      dataJson: '{}',
      snapshotKvKey: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })).toBeUndefined()
    expect([...kv.values.keys()]).toContain('v1:user:user-edge-1:project:project-edge-1')

    const updated = await repository.updateProject('user-edge-1', 'project-edge-1', 1, {
      name: '已更新项目',
      dataJson: '{"nodes":[{"id":"node-1"}]}',
      snapshotKvKey: null,
      updatedAt: '2026-08-30T10:01:00.000Z',
    })
    expect(updated).toMatchObject({ status: 'updated', row: { version: 2, name: '已更新项目' } })
    await expect(repository.updateProject('user-edge-1', 'project-edge-1', 1, {
      name: '过期更新',
      dataJson: '{}',
      snapshotKvKey: null,
      updatedAt: '2026-08-30T10:02:00.000Z',
    })).resolves.toEqual({ status: 'conflict', currentVersion: 2 })
    await expect(repository.listProjects('user-edge-1')).resolves.toHaveLength(1)
    await expect(repository.deleteProject('user-edge-1', 'project-edge-1')).resolves.toMatchObject({ version: 2 })
    await expect(repository.getProject('user-edge-1', 'project-edge-1')).resolves.toBeUndefined()
  })

  it('并发提交同一 expectedVersion 时只有一个成功', async () => {
    const repository = new EdgeKvDataRepository(new MemoryEdgeKv())
    await repository.createProject({
      id: 'project-race',
      userToken: 'user-race',
      name: '并发项目',
      dataJson: '{}',
      snapshotKvKey: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const results = await Promise.all([
      repository.updateProject('user-race', 'project-race', 1, {
        name: '更新 A', dataJson: '{"winner":"a"}', snapshotKvKey: null, updatedAt: timestamp,
      }),
      repository.updateProject('user-race', 'project-race', 1, {
        name: '更新 B', dataJson: '{"winner":"b"}', snapshotKvKey: null, updatedAt: timestamp,
      }),
    ])

    expect(results.filter((result) => result.status === 'updated')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'conflict')).toHaveLength(1)
    await expect(repository.getProject('user-race', 'project-race')).resolves.toMatchObject({ version: 2 })
  })

  it('完成资产完整生命周期且隔离不同用户', async () => {
    const kv = new MemoryEdgeKv()
    const repository = new EdgeKvDataRepository(kv)
    const created = await repository.createAsset({
      id: 'asset-edge-1',
      userToken: 'user-edge-1',
      projectId: 'project-edge-1',
      name: '封面图',
      dataJson: '{"type":"image"}',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(created).toMatchObject({ id: 'asset-edge-1', version: 1 })
    expect([...kv.values.keys()]).toContain('v1:user:user-edge-1:asset:asset-edge-1')
    await expect(repository.listAssets('other-user')).resolves.toEqual([])

    const updated = await repository.updateAsset('user-edge-1', 'asset-edge-1', 1, {
      projectId: null,
      name: '共享封面图',
      dataJson: '{"type":"image","shared":true}',
      updatedAt: '2026-08-30T10:03:00.000Z',
    })
    expect(updated).toMatchObject({ status: 'updated', row: { version: 2, projectId: null } })
    await expect(repository.deleteAsset('user-edge-1', 'asset-edge-1')).resolves.toBe(true)
    await expect(repository.deleteAsset('user-edge-1', 'asset-edge-1')).resolves.toBe(false)
  })
})
