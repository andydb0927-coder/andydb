import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import type { WorkerBindings } from '../src/bindings'
import type {
  AssetRow,
  CreateAssetRecord,
  CreateProjectRecord,
  DataRepository,
  ProjectRow,
  UpdateAssetResult,
  UpdateProjectResult,
} from '../src/data/data-repository'
import type { SnapshotStore } from '../src/data/snapshot-store'

const env: WorkerBindings = {
  DEVICE_TOKEN_SECRET: 'fixture-device-secret-with-enough-entropy',
  INVITE_CODES: 'FIXTURE-INVITE',
  ARK_API_KEY: 'fixture-ark-key',
  OPENSPEECH_API_KEY: 'fixture-openspeech-key',
  SEEDREAM_MODEL_ID: 'fixture-seedream',
  SEEDANCE_MODEL_ID: 'fixture-seedance',
  ARK_TEXT_MODEL_ID: 'fixture-text',
  OPENSPEECH_RESOURCE_ID: 'fixture-tts',
}

class MemoryDataRepository implements DataRepository {
  readonly projects = new Map<string, ProjectRow>()
  readonly assets = new Map<string, AssetRow>()

  async listProjects(userToken: string) {
    return [...this.projects.values()]
      .filter((project) => project.userToken === userToken)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async getProject(userToken: string, id: string) {
    const project = this.projects.get(id)
    return project?.userToken === userToken ? structuredClone(project) : undefined
  }

  async createProject(record: CreateProjectRecord) {
    if (this.projects.has(record.id)) return undefined
    const row: ProjectRow = { ...record, version: 1 }
    this.projects.set(record.id, structuredClone(row))
    return structuredClone(row)
  }

  async updateProject(
    userToken: string,
    id: string,
    expectedVersion: number,
    update: Omit<CreateProjectRecord, 'id' | 'userToken' | 'createdAt'>,
  ): Promise<UpdateProjectResult> {
    const current = this.projects.get(id)
    if (!current || current.userToken !== userToken) return { status: 'missing' }
    if (current.version !== expectedVersion) {
      return { status: 'conflict', currentVersion: current.version }
    }
    const row: ProjectRow = {
      ...current,
      ...update,
      version: current.version + 1,
    }
    this.projects.set(id, structuredClone(row))
    return { status: 'updated', row: structuredClone(row) }
  }

  async deleteProject(userToken: string, id: string) {
    const current = this.projects.get(id)
    if (!current || current.userToken !== userToken) return undefined
    this.projects.delete(id)
    return structuredClone(current)
  }

  async listAssets(userToken: string) {
    return [...this.assets.values()].filter((asset) => asset.userToken === userToken)
  }

  async getAsset(userToken: string, id: string) {
    const asset = this.assets.get(id)
    return asset?.userToken === userToken ? structuredClone(asset) : undefined
  }

  async createAsset(record: CreateAssetRecord) {
    if (this.assets.has(record.id)) return undefined
    const row: AssetRow = { ...record, version: 1 }
    this.assets.set(record.id, structuredClone(row))
    return structuredClone(row)
  }

  async updateAsset(
    userToken: string,
    id: string,
    expectedVersion: number,
    update: Pick<CreateAssetRecord, 'name' | 'dataJson' | 'updatedAt' | 'projectId'>,
  ): Promise<UpdateAssetResult> {
    const current = this.assets.get(id)
    if (!current || current.userToken !== userToken) return { status: 'missing' }
    if (current.version !== expectedVersion) {
      return { status: 'conflict', currentVersion: current.version }
    }
    const row: AssetRow = { ...current, ...update, version: current.version + 1 }
    this.assets.set(id, structuredClone(row))
    return { status: 'updated', row: structuredClone(row) }
  }

  async deleteAsset(userToken: string, id: string) {
    const current = this.assets.get(id)
    if (!current || current.userToken !== userToken) return false
    this.assets.delete(id)
    return true
  }
}

class MemorySnapshotStore implements SnapshotStore {
  readonly values = new Map<string, string>()
  failWrites = false
  failReads = false

  async put(key: string, value: string) {
    if (this.failWrites) throw new Error('fixture KV write failure')
    this.values.set(key, value)
  }

  async get(key: string) {
    if (this.failReads) throw new Error('fixture KV read failure')
    return this.values.get(key) ?? null
  }

  async delete(key: string) {
    this.values.delete(key)
  }
}

async function token(app = createApp()) {
  const response = await app.request('/api/auth/device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: 'fixture-device-0001', inviteCode: 'FIXTURE-INVITE' }),
  }, env)
  const body = await response.json() as { token: string }
  return body.token
}

function requestInit(method: string, bearer: string, body?: unknown): RequestInit {
  return {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }
}

function dataFixture(options: { thresholdBytes?: number; snapshots?: MemorySnapshotStore } = {}) {
  const repository = new MemoryDataRepository()
  const snapshots = options.snapshots ?? new MemorySnapshotStore()
  const app = createApp({
    dataRepository: repository,
    snapshotStore: snapshots,
    snapshotThresholdBytes: options.thresholdBytes ?? 64,
    now: () => Date.parse('2026-08-30T08:00:00.000Z'),
  })
  return { app, repository, snapshots }
}

describe('项目数据 API', () => {
  it('全部数据路由复用设备鉴权', async () => {
    const { app } = dataFixture()
    const response = await app.request('/api/data/projects', {}, env)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'AUTH_REQUIRED', message: '请先完成设备验证。' },
    })
  })

  it('完成创建、列表、读取、更新和删除全生命周期', async () => {
    const { app, repository, snapshots } = dataFixture({ thresholdBytes: 20 })
    const bearer = await token(app)
    const projectId = 'project-fixture-0001'
    const firstData = {
      id: projectId,
      title: '汴京灯灭前',
      nodes: [{ id: 'node-1', title: '图片 01' }],
      edges: [],
    }

    const created = await app.request('/api/data/projects', requestInit('POST', bearer, {
      id: projectId,
      name: '汴京灯灭前',
      data: firstData,
    }), env)
    expect(created.status).toBe(201)
    await expect(created.json()).resolves.toMatchObject({
      id: projectId,
      name: '汴京灯灭前',
      version: 1,
      data: firstData,
      storage: 'kv',
    })
    const stored = repository.projects.get(projectId)
    expect(stored?.dataJson).toBeNull()
    expect(stored?.snapshotKvKey).toMatch(/^project-snapshot:/u)
    expect(snapshots.values.get(stored?.snapshotKvKey ?? '')).toBe(JSON.stringify(firstData))

    const listed = await app.request('/api/data/projects', requestInit('GET', bearer), env)
    await expect(listed.json()).resolves.toEqual({
      projects: [{
        id: projectId,
        name: '汴京灯灭前',
        version: 1,
        updatedAt: '2026-08-30T08:00:00.000Z',
      }],
    })

    const loaded = await app.request(`/api/data/projects/${projectId}`, requestInit('GET', bearer), env)
    expect(loaded.status).toBe(200)
    await expect(loaded.json()).resolves.toMatchObject({ data: firstData, version: 1 })

    const nextData = { ...firstData, nodes: [...firstData.nodes, { id: 'node-2', title: '视频 01' }] }
    const updated = await app.request(`/api/data/projects/${projectId}`, requestInit('PUT', bearer, {
      name: '汴京灯灭前 · 第二版',
      data: nextData,
      version: 1,
    }), env)
    expect(updated.status).toBe(200)
    await expect(updated.json()).resolves.toMatchObject({
      name: '汴京灯灭前 · 第二版',
      data: nextData,
      version: 2,
    })

    const deleted = await app.request(`/api/data/projects/${projectId}`, requestInit('DELETE', bearer), env)
    expect(deleted.status).toBe(204)
    expect(repository.projects.has(projectId)).toBe(false)
    expect(snapshots.values.size).toBe(0)

    const missing = await app.request(`/api/data/projects/${projectId}`, requestInit('GET', bearer), env)
    expect(missing.status).toBe(404)
  })

  it('并发更新使用 version 乐观锁，只允许一个写入成功', async () => {
    const { app, snapshots } = dataFixture({ thresholdBytes: 1 })
    const bearer = await token(app)
    await app.request('/api/data/projects', requestInit('POST', bearer, {
      id: 'project-concurrent',
      name: '并发项目',
      data: { nodes: [] },
    }), env)

    const [left, right] = await Promise.all([
      app.request('/api/data/projects/project-concurrent', requestInit('PUT', bearer, {
        name: '写入 A', data: { nodes: [{ id: 'a' }] }, version: 1,
      }), env),
      app.request('/api/data/projects/project-concurrent', requestInit('PUT', bearer, {
        name: '写入 B', data: { nodes: [{ id: 'b' }] }, version: 1,
      }), env),
    ])

    expect([left.status, right.status].sort()).toEqual([200, 409])
    const conflict = left.status === 409 ? left : right
    await expect(conflict.json()).resolves.toEqual({
      error: {
        code: 'VERSION_CONFLICT',
        message: '项目已在其他位置更新，请刷新后重试。',
        currentVersion: 2,
      },
    })
    expect(snapshots.values.size).toBe(1)
    const loaded = await app.request(
      '/api/data/projects/project-concurrent',
      requestInit('GET', bearer),
      env,
    )
    expect(loaded.status).toBe(200)
    await expect(loaded.json()).resolves.toMatchObject({ version: 2 })
  })

  it('KV 写入失败时明确回退到 D1 data_json，读取仍可恢复', async () => {
    const snapshots = new MemorySnapshotStore()
    snapshots.failWrites = true
    const { app, repository } = dataFixture({ thresholdBytes: 1, snapshots })
    const bearer = await token(app)
    const data = { nodes: [{ id: 'fallback-node', title: '回退节点' }] }

    const created = await app.request('/api/data/projects', requestInit('POST', bearer, {
      id: 'project-kv-fallback', name: 'KV 回退', data,
    }), env)
    expect(created.status).toBe(201)
    await expect(created.json()).resolves.toMatchObject({ storage: 'd1-fallback', data })
    expect(repository.projects.get('project-kv-fallback')?.dataJson).toBe(JSON.stringify(data))
    expect(repository.projects.get('project-kv-fallback')?.snapshotKvKey).toBeNull()

    const loaded = await app.request('/api/data/projects/project-kv-fallback', requestInit('GET', bearer), env)
    expect(loaded.status).toBe(200)
    await expect(loaded.json()).resolves.toMatchObject({ data })
  })
})

describe('资产元数据 API', () => {
  it('完成资产元数据 CRUD 并隔离设备数据', async () => {
    const { app } = dataFixture()
    const bearer = await token(app)
    const created = await app.request('/api/data/assets', requestInit('POST', bearer, {
      id: 'asset-fixture-0001',
      projectId: 'project-fixture-0001',
      name: '古桥首帧.png',
      data: {
        kind: 'image',
        mimeType: 'image/png',
        url: 'https://assets.example.com/bridge.png',
        width: 1424,
        height: 800,
      },
    }), env)
    expect(created.status).toBe(201)
    await expect(created.json()).resolves.toMatchObject({
      id: 'asset-fixture-0001', name: '古桥首帧.png', version: 1,
    })

    const listed = await app.request('/api/data/assets', requestInit('GET', bearer), env)
    await expect(listed.json()).resolves.toMatchObject({
      assets: [{ id: 'asset-fixture-0001', data: { kind: 'image' } }],
    })

    const updated = await app.request('/api/data/assets/asset-fixture-0001', requestInit('PUT', bearer, {
      name: '古桥主图.png',
      projectId: 'project-fixture-0001',
      data: { kind: 'image', mimeType: 'image/png', width: 1424, height: 800 },
      version: 1,
    }), env)
    expect(updated.status).toBe(200)
    await expect(updated.json()).resolves.toMatchObject({ name: '古桥主图.png', version: 2 })

    const removed = await app.request('/api/data/assets/asset-fixture-0001', requestInit('DELETE', bearer), env)
    expect(removed.status).toBe(204)
    const missing = await app.request('/api/data/assets/asset-fixture-0001', requestInit('GET', bearer), env)
    expect(missing.status).toBe(404)
  })
})
