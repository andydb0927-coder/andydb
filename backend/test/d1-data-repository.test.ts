import { describe, expect, it, vi } from 'vitest'
import { D1DataRepository } from '../src/data/d1-data-repository'

function statementFixture(options: {
  changes?: number
  first?: unknown
  results?: unknown[]
}) {
  const statement = {
    bind: vi.fn(),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: options.changes ?? 0 } }),
    first: vi.fn().mockResolvedValue(options.first ?? null),
    all: vi.fn().mockResolvedValue({ success: true, results: options.results ?? [] }),
  }
  statement.bind.mockReturnValue(statement)
  return statement
}

describe('D1DataRepository', () => {
  it('创建项目时写入兼容字段并返回 version 1 元数据', async () => {
    const insert = statementFixture({ changes: 1 })
    const select = statementFixture({
      first: {
        id: 'project-d1',
        user_token: 'device-d1',
        name: 'D1 项目',
        data_json: '{"nodes":[]}',
        snapshot_kv_key: null,
        version: 1,
        created_at: '2026-08-30T08:00:00.000Z',
        updated_at: '2026-08-30T08:00:00.000Z',
      },
    })
    const database = {
      prepare: vi.fn()
        .mockReturnValueOnce(insert)
        .mockReturnValueOnce(select),
    } as unknown as D1Database
    const repository = new D1DataRepository(database)

    const row = await repository.createProject({
      id: 'project-d1',
      userToken: 'device-d1',
      name: 'D1 项目',
      dataJson: '{"nodes":[]}',
      snapshotKvKey: null,
      createdAt: '2026-08-30T08:00:00.000Z',
      updatedAt: '2026-08-30T08:00:00.000Z',
    })

    expect(insert.bind).toHaveBeenCalledWith(
      'project-d1',
      'device-d1',
      'D1 项目',
      '{"nodes":[]}',
      null,
      '2026-08-30T08:00:00.000Z',
      '2026-08-30T08:00:00.000Z',
    )
    expect(row).toMatchObject({ id: 'project-d1', userToken: 'device-d1', version: 1 })
  })

  it('条件更新未命中时读取当前 version 并返回冲突', async () => {
    const update = statementFixture({ changes: 0 })
    const select = statementFixture({
      first: {
        id: 'project-d1',
        user_token: 'device-d1',
        name: '已更新项目',
        data_json: '{"nodes":[{"id":"new"}]}',
        snapshot_kv_key: null,
        version: 3,
        created_at: '2026-08-30T08:00:00.000Z',
        updated_at: '2026-08-30T08:02:00.000Z',
      },
    })
    const database = {
      prepare: vi.fn()
        .mockReturnValueOnce(update)
        .mockReturnValueOnce(select),
    } as unknown as D1Database
    const repository = new D1DataRepository(database)

    const result = await repository.updateProject('device-d1', 'project-d1', 2, {
      name: '过期写入',
      dataJson: '{"nodes":[]}',
      snapshotKvKey: null,
      updatedAt: '2026-08-30T08:03:00.000Z',
    })

    expect(update.bind).toHaveBeenCalledWith(
      '过期写入',
      '{"nodes":[]}',
      null,
      '2026-08-30T08:03:00.000Z',
      'device-d1',
      'project-d1',
      2,
    )
    expect(result).toEqual({ status: 'conflict', currentVersion: 3 })
  })
})
