import { beforeEach, describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import type { Project } from './model'
import {
  CloudMigrationService,
  CloudProjectStorage,
  DeviceTokenManager,
  HybridProjectStorage,
  cloudStorageConfiguration,
  type ProjectStorage,
} from './cloud-storage'

class MemoryProjectStorage implements ProjectStorage {
  readonly projects = new Map<string, Project>()

  async save(project: Project) {
    this.projects.set(project.id, structuredClone(project))
  }

  async load(projectId: string) {
    const project = this.projects.get(projectId)
    return project ? structuredClone(project) : undefined
  }

  async listAll() {
    return [...this.projects.values()].map((project) => structuredClone(project))
  }

  async listRecent(limit: number) {
    return (await this.listAll())
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit)
  }

  async delete(projectId: string) {
    await Promise.resolve()
    this.projects.delete(projectId)
  }
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('cloud project storage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
  })

  test('uses an explicit runtime backend URL ahead of the build-time default', () => {
    vi.stubEnv('VITE_BACKEND_URL', 'https://build.example')
    localStorage.setItem('wireless-canvas.cloud.backend-url', '/fixture-cloud')

    expect(cloudStorageConfiguration().backendUrl).toBe('/fixture-cloud')
  })

  test('registers one device token, persists it and reuses the Authorization header', async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://cloud.example/api/auth/device')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toMatchObject({ inviteCode: 'INVITE' })
      return jsonResponse({ token: 'fixture-device-token' })
    })
    const manager = new DeviceTokenManager({
      backendUrl: 'https://cloud.example/',
      inviteCode: 'INVITE',
      fetchFn,
      storage: localStorage,
    })

    await expect(manager.authorizationHeader()).resolves.toBe('Bearer fixture-device-token')
    await expect(manager.authorizationHeader()).resolves.toBe('Bearer fixture-device-token')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('wireless-canvas.cloud.device-token')).toBe('fixture-device-token')
  })

  test('uses the /api/data project contract for list, read, save and delete', async () => {
    localStorage.setItem('wireless-canvas.cloud.device-token', 'fixture-device-token')
    const project = { ...makeProjectFixture(), id: 'project-cloud-0001', title: '云端项目' }
    const calls: Array<{ url: string; method: string; authorization: string | null }> = []
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({
        url,
        method,
        authorization: new Headers(init?.headers).get('Authorization'),
      })
      if (url.endsWith('/api/data/projects') && method === 'GET') {
        return jsonResponse({ projects: [{ id: project.id, name: project.title, version: 1, updatedAt: project.updatedAt }] })
      }
      if (url.endsWith(`/api/data/projects/${project.id}`) && method === 'GET') {
        return jsonResponse({ id: project.id, name: project.title, version: 1, updatedAt: project.updatedAt, data: project })
      }
      if (url.endsWith(`/api/data/projects/${project.id}`) && method === 'PUT') {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          id: project.id,
          name: project.title,
          version: 1,
          data: { ...project, intent: '已更新的云端项目' },
        })
        return jsonResponse({ id: project.id, name: project.title, version: 2, updatedAt: project.updatedAt, data: project })
      }
      if (url.endsWith(`/api/data/projects/${project.id}`) && method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      throw new Error(`unexpected request ${method} ${url}`)
    })
    const storage = new CloudProjectStorage({ backendUrl: 'https://cloud.example', fetchFn, storage: localStorage })

    await expect(storage.listAll()).resolves.toEqual([project])
    const updatedProject = { ...project, intent: '已更新的云端项目' }
    await storage.save(updatedProject)
    await storage.delete(project.id)

    expect(calls.map(({ url, method }) => `${method} ${new URL(url).pathname}`)).toEqual([
      'GET /api/data/projects',
      `GET /api/data/projects/${project.id}`,
      `GET /api/data/projects/${project.id}`,
      `PUT /api/data/projects/${project.id}`,
      `DELETE /api/data/projects/${project.id}`,
    ])
    expect(calls.every(({ authorization }) => authorization === 'Bearer fixture-device-token')).toBe(true)
  })

  test('keeps IndexedDB-compatible local storage authoritative when cloud is absent or offline', async () => {
    const local = new MemoryProjectStorage()
    const project = { ...makeProjectFixture(), id: 'project-local-0001', title: '离线项目' }
    const disconnectedCloud: ProjectStorage = {
      save: vi.fn(async () => { throw new Error('network offline') }),
      load: vi.fn(async () => { throw new Error('network offline') }),
      listAll: vi.fn(async () => { throw new Error('network offline') }),
      listRecent: vi.fn(async () => { throw new Error('network offline') }),
      delete: vi.fn(async () => { throw new Error('network offline') }),
    }
    const hybrid = new HybridProjectStorage(local, disconnectedCloud)

    await expect(hybrid.save(project)).resolves.toBeUndefined()
    await expect(local.load(project.id)).resolves.toEqual(project)
    await expect(hybrid.load(project.id)).resolves.toEqual(project)
    await expect(hybrid.listAll()).resolves.toEqual([project])
  })

  test('migrates projects one by one, skips failures and is idempotent for unchanged projects', async () => {
    const local = new MemoryProjectStorage()
    const first = { ...makeProjectFixture(), id: 'project-migrate-0001', title: '成功项目' }
    const second = { ...makeProjectFixture(), id: 'project-migrate-0002', title: '失败项目' }
    await local.save(first)
    await local.save(second)
    const cloud = new MemoryProjectStorage()
    const originalSave = cloud.save.bind(cloud)
    cloud.save = vi.fn(async (project) => {
      if (project.id === second.id) throw new Error('云端暂不可用')
      await originalSave(project)
    })
    const migration = new CloudMigrationService({ local, cloud, storage: localStorage })
    const progress = vi.fn()

    await expect(migration.migrate(progress)).resolves.toMatchObject({ total: 2, succeeded: 1, failed: 1, skipped: 0 })
    await expect(migration.migrate(progress)).resolves.toMatchObject({ total: 2, succeeded: 0, failed: 1, skipped: 1 })
    expect(cloud.save).toHaveBeenCalledTimes(3)
    expect(migration.isMigrated(first)).toBe(true)
    expect(migration.isMigrated(second)).toBe(false)
  })

  test('迁移标记按 user_id 隔离，换账号后不会误判已迁移', async () => {
    const local = new MemoryProjectStorage()
    const cloud = new MemoryProjectStorage()
    const project = { ...makeProjectFixture(), id: 'project-account-scope', title: '账号隔离项目' }
    await local.save(project)
    localStorage.setItem('wireless-canvas.cloud.account', JSON.stringify({ userId: 'user-a' }))
    const migration = new CloudMigrationService({ local, cloud, storage: localStorage })

    await migration.migrate()
    expect(migration.isMigrated(project)).toBe(true)

    localStorage.setItem('wireless-canvas.cloud.account', JSON.stringify({ userId: 'user-b' }))
    expect(migration.isMigrated(project)).toBe(false)
  })
})
