import type { Project } from './model'

export interface ProjectStorage {
  save(project: Project): Promise<void>
  load(projectId: string): Promise<Project | undefined>
  listAll(): Promise<Project[]>
  listRecent(limit: number): Promise<Project[]>
  delete(projectId: string): Promise<void>
}

export interface CloudStorageConfiguration {
  backendUrl: string
  inviteCode: string
}

export interface DeviceTokenManagerOptions extends CloudStorageConfiguration {
  fetchFn?: typeof fetch
  storage?: Storage
}

export interface CloudProjectStorageOptions {
  backendUrl: string
  inviteCode?: string
  fetchFn?: typeof fetch
  storage?: Storage
  tokenManager?: DeviceTokenManager
}

export interface MigrationProgress {
  completed: number
  total: number
  projectId: string
  projectTitle: string
  status: 'migrated' | 'skipped' | 'failed'
}

export interface MigrationSummary {
  total: number
  succeeded: number
  skipped: number
  failed: number
  failures: Array<{ projectId: string; projectTitle: string; message: string }>
}

export interface ProjectCloudMigration {
  enabled: boolean
  isMigrated(project: Project): boolean
  migrate(onProgress?: (progress: MigrationProgress) => void): Promise<MigrationSummary>
}

const deviceIdKey = 'wireless-canvas.cloud.device-id'
const deviceTokenKey = 'wireless-canvas.cloud.device-token'
const migrationMarkerKey = 'wireless-canvas.cloud.migrated-projects'
const runtimeBackendUrlKey = 'wireless-canvas.cloud.backend-url'
const runtimeInviteCodeKey = 'wireless-canvas.cloud.invite-code'

function envValue(name: string) {
  const env = import.meta.env as Record<string, string | undefined>
  return env[name]?.trim() ?? ''
}

function browserStorage(storage?: Storage) {
  if (storage) return storage
  if (typeof window !== 'undefined') return window.localStorage
  throw new Error('当前环境不支持浏览器设备凭证')
}

function normalizedBackendUrl(value: string) {
  return value.trim().replace(/\/+$/u, '')
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

async function responseJson(response: Response) {
  try {
    return await response.json() as unknown
  } catch {
    return undefined
  }
}

async function cloudError(response: Response, fallback: string) {
  const body = record(await responseJson(response))
  const error = record(body?.error)
  const message = typeof error?.message === 'string' ? error.message : fallback
  return new Error(message)
}

function projectFromCloud(value: unknown): Project | undefined {
  const candidate = record(value)
  const data = record(candidate?.data)
  if (
    !data ||
    typeof data.id !== 'string' ||
    typeof data.title !== 'string' ||
    typeof data.updatedAt !== 'string' ||
    !Array.isArray(data.assets) ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.edges)
  ) return undefined
  return data as unknown as Project
}

function sameProject(left: Project, right: Project) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function cloudStorageConfiguration(): CloudStorageConfiguration {
  const storage = typeof window === 'undefined' ? undefined : window.localStorage
  return {
    backendUrl: normalizedBackendUrl(
      envValue('VITE_BACKEND_URL') || storage?.getItem(runtimeBackendUrlKey) || '',
    ),
    inviteCode: envValue('VITE_BACKEND_INVITE_CODE') || storage?.getItem(runtimeInviteCodeKey)?.trim() || '',
  }
}

export function isCloudStorageConfigured(configuration = cloudStorageConfiguration()) {
  return Boolean(configuration.backendUrl)
}

export class DeviceTokenManager {
  private readonly backendUrl: string
  private readonly inviteCode: string
  private readonly fetchFn: typeof fetch
  private readonly storage: Storage
  private pending?: Promise<string>

  constructor(options: DeviceTokenManagerOptions) {
    this.backendUrl = normalizedBackendUrl(options.backendUrl)
    this.inviteCode = options.inviteCode.trim()
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
    this.storage = browserStorage(options.storage)
  }

  private deviceId() {
    const existing = this.storage.getItem(deviceIdKey)?.trim()
    if (existing) return existing
    const created = `device-${crypto.randomUUID()}`
    this.storage.setItem(deviceIdKey, created)
    return created
  }

  private async register() {
    if (!this.inviteCode) throw new Error('云端邀请码未配置')
    const response = await this.fetchFn(`${this.backendUrl}/api/auth/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: this.deviceId(), inviteCode: this.inviteCode }),
    })
    if (!response.ok) throw await cloudError(response, '设备验证失败')
    const body = record(await responseJson(response))
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    if (!token) throw new Error('设备验证响应格式不正确')
    this.storage.setItem(deviceTokenKey, token)
    return token
  }

  async token(forceRefresh = false) {
    if (forceRefresh) this.storage.removeItem(deviceTokenKey)
    const existing = this.storage.getItem(deviceTokenKey)?.trim()
    if (existing) return existing
    this.pending ??= this.register().finally(() => {
      this.pending = undefined
    })
    return this.pending
  }

  async authorizationHeader(forceRefresh = false) {
    return `Bearer ${await this.token(forceRefresh)}`
  }
}

export class CloudProjectStorage implements ProjectStorage {
  private readonly backendUrl: string
  private readonly fetchFn: typeof fetch
  private readonly tokenManager: DeviceTokenManager

  constructor(options: CloudProjectStorageOptions) {
    this.backendUrl = normalizedBackendUrl(options.backendUrl)
    if (!this.backendUrl) throw new Error('云端服务地址未配置')
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
    this.tokenManager = options.tokenManager ?? new DeviceTokenManager({
      backendUrl: this.backendUrl,
      inviteCode: options.inviteCode ?? '',
      fetchFn: this.fetchFn,
      storage: browserStorage(options.storage),
    })
  }

  private async request(path: string, init: RequestInit = {}, retryAuth = true): Promise<Response> {
    const response = await this.fetchFn(`${this.backendUrl}${path}`, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers).entries()),
        Authorization: await this.tokenManager.authorizationHeader(),
      },
    })
    if (response.status === 401 && retryAuth) {
      await this.tokenManager.token(true)
      return this.request(path, init, false)
    }
    return response
  }

  private async cloudProject(projectId: string) {
    const response = await this.request(`/api/data/projects/${encodeURIComponent(projectId)}`)
    if (response.status === 404) return undefined
    if (!response.ok) throw await cloudError(response, '无法读取云端项目')
    const body = await responseJson(response)
    const project = projectFromCloud(body)
    const version = record(body)?.version
    if (!project || typeof version !== 'number') {
      throw new Error('云端项目响应格式不正确')
    }
    return { project, version }
  }

  async save(project: Project) {
    const existing = await this.cloudProject(project.id)
    if (existing && sameProject(existing.project, project)) return
    const path = existing
      ? `/api/data/projects/${encodeURIComponent(project.id)}`
      : '/api/data/projects'
    const response = await this.request(path, {
      method: existing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: project.id,
        name: project.title,
        data: project,
        ...(existing ? { version: existing.version } : {}),
      }),
    })
    if (!response.ok) throw await cloudError(response, '无法保存云端项目')
  }

  async load(projectId: string) {
    return (await this.cloudProject(projectId))?.project
  }

  async listAll() {
    const response = await this.request('/api/data/projects')
    if (!response.ok) throw await cloudError(response, '无法读取云端项目列表')
    const body = record(await responseJson(response))
    if (!Array.isArray(body?.projects)) throw new Error('云端项目列表响应格式不正确')
    const projects = await Promise.all(body.projects.map(async (item) => {
      const id = record(item)?.id
      if (typeof id !== 'string') throw new Error('云端项目列表响应格式不正确')
      return this.load(id)
    }))
    return projects.filter((project): project is Project => Boolean(project))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async listRecent(limit: number) {
    return (await this.listAll()).slice(0, Math.max(0, limit))
  }

  async delete(projectId: string) {
    const response = await this.request(`/api/data/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    })
    if (!response.ok && response.status !== 404) {
      throw await cloudError(response, '无法删除云端项目')
    }
  }
}

export class HybridProjectStorage implements ProjectStorage {
  private readonly local: ProjectStorage
  private readonly cloud?: ProjectStorage

  constructor(
    local: ProjectStorage,
    cloud?: ProjectStorage,
  ) {
    this.local = local
    this.cloud = cloud
  }

  async save(project: Project) {
    await this.local.save(project)
    if (!this.cloud) return
    try {
      await this.cloud.save(project)
    } catch {
      // Local persistence is the offline source of truth. Explicit migration reports cloud failures.
    }
  }

  async load(projectId: string) {
    const localProject = await this.local.load(projectId)
    if (!this.cloud) return localProject
    try {
      const cloudProject = await this.cloud.load(projectId)
      if (!cloudProject) return localProject
      if (!localProject || cloudProject.updatedAt > localProject.updatedAt) {
        await this.local.save(cloudProject)
        return cloudProject
      }
      return localProject
    } catch {
      return localProject
    }
  }

  async listAll() {
    const localProjects = await this.local.listAll()
    if (!this.cloud) return localProjects
    try {
      const cloudProjects = await this.cloud.listAll()
      const projects = new Map(localProjects.map((project) => [project.id, project]))
      for (const project of cloudProjects) {
        const localProject = projects.get(project.id)
        if (!localProject || project.updatedAt > localProject.updatedAt) {
          projects.set(project.id, project)
          await this.local.save(project)
        }
      }
      return [...projects.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    } catch {
      return localProjects
    }
  }

  async listRecent(limit: number) {
    return (await this.listAll()).slice(0, Math.max(0, limit))
  }

  async delete(projectId: string) {
    await this.local.delete(projectId)
    if (!this.cloud) return
    try {
      await this.cloud.delete(projectId)
    } catch {
      // The local deletion remains valid while offline; a later explicit sync can reconcile it.
    }
  }
}

function migrationMarkers(storage: Storage) {
  try {
    const value = JSON.parse(storage.getItem(migrationMarkerKey) ?? '{}') as unknown
    const candidate = record(value)
    return candidate
      ? Object.fromEntries(Object.entries(candidate).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : {}
  } catch {
    return {}
  }
}

export class CloudMigrationService implements ProjectCloudMigration {
  readonly enabled = true
  private readonly local: ProjectStorage
  private readonly cloud: ProjectStorage
  private readonly storage: Storage

  constructor(options: { local: ProjectStorage; cloud: ProjectStorage; storage?: Storage }) {
    this.local = options.local
    this.cloud = options.cloud
    this.storage = browserStorage(options.storage)
  }

  isMigrated(project: Project) {
    return migrationMarkers(this.storage)[project.id] === project.updatedAt
  }

  private markMigrated(project: Project) {
    this.storage.setItem(migrationMarkerKey, JSON.stringify({
      ...migrationMarkers(this.storage),
      [project.id]: project.updatedAt,
    }))
  }

  async migrate(onProgress?: (progress: MigrationProgress) => void): Promise<MigrationSummary> {
    const projects = await this.local.listAll()
    const summary: MigrationSummary = { total: projects.length, succeeded: 0, skipped: 0, failed: 0, failures: [] }
    for (let index = 0; index < projects.length; index += 1) {
      const project = projects[index]!
      let status: MigrationProgress['status']
      if (this.isMigrated(project)) {
        summary.skipped += 1
        status = 'skipped'
      } else {
        try {
          await this.cloud.save(project)
          this.markMigrated(project)
          summary.succeeded += 1
          status = 'migrated'
        } catch (error) {
          summary.failed += 1
          status = 'failed'
          summary.failures.push({
            projectId: project.id,
            projectTitle: project.title,
            message: errorMessage(error, '云端迁移失败'),
          })
        }
      }
      onProgress?.({
        completed: index + 1,
        total: projects.length,
        projectId: project.id,
        projectTitle: project.title,
        status,
      })
    }
    return summary
  }
}

export function createCloudProjectStorage(configuration = cloudStorageConfiguration()) {
  if (!configuration.backendUrl) return undefined
  return new CloudProjectStorage(configuration)
}

export function createHybridProjectStorage(
  local: ProjectStorage,
  configuration = cloudStorageConfiguration(),
) {
  return new HybridProjectStorage(local, createCloudProjectStorage(configuration))
}

export function createCloudMigrationService(
  local: ProjectStorage,
  configuration = cloudStorageConfiguration(),
) {
  const cloud = createCloudProjectStorage(configuration)
  return cloud ? new CloudMigrationService({ local, cloud }) : undefined
}
