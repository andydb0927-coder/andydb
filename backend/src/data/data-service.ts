import type {
  AssetRow,
  CreateAssetRecord,
  DataRepository,
  ProjectRow,
  UpdateProjectResult,
} from './data-repository'
import type { SnapshotStore } from './snapshot-store'

export type SnapshotStorage = 'd1' | 'kv' | 'd1-fallback'

export interface ProjectInput {
  id: string
  name: string
  data: Record<string, unknown>
}

export interface ProjectUpdateInput extends ProjectInput {
  version: number
}

export interface AssetInput {
  id: string
  projectId: string | null
  name: string
  data: Record<string, unknown>
}

export interface AssetUpdateInput extends AssetInput {
  version: number
}

export class SnapshotUnavailableError extends Error {
  constructor() {
    super('snapshot unavailable')
    this.name = 'SnapshotUnavailableError'
  }
}

interface SnapshotPlacement {
  dataJson: string | null
  snapshotKvKey: string | null
  storage: SnapshotStorage
}

function bytes(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function snapshotKey(userToken: string, projectId: string, version: number) {
  return `project-snapshot:${userToken}:${projectId}:v${version}:${crypto.randomUUID()}`
}

function parsedJson(value: string) {
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SnapshotUnavailableError()
  }
  return parsed as Record<string, unknown>
}

export class DataService {
  constructor(
    private readonly repository: DataRepository,
    private readonly snapshots: SnapshotStore | undefined,
    private readonly snapshotThresholdBytes: number,
    private readonly now: () => number,
  ) {}

  private timestamp() {
    return new Date(this.now()).toISOString()
  }

  private async placeSnapshot(
    userToken: string,
    projectId: string,
    version: number,
    dataJson: string,
  ): Promise<SnapshotPlacement> {
    if (bytes(dataJson) < this.snapshotThresholdBytes || !this.snapshots) {
      return { dataJson, snapshotKvKey: null, storage: 'd1' }
    }
    const key = snapshotKey(userToken, projectId, version)
    try {
      await this.snapshots.put(key, dataJson)
      return { dataJson: null, snapshotKvKey: key, storage: 'kv' }
    } catch {
      console.warn('snapshot_kv_write_failed', { projectId })
      return { dataJson, snapshotKvKey: null, storage: 'd1-fallback' }
    }
  }

  private async safeDeleteSnapshot(key: string | null) {
    if (!key || !this.snapshots) return
    try {
      await this.snapshots.delete(key)
    } catch {
      console.warn('snapshot_kv_cleanup_failed')
    }
  }

  private async hydrateProject(row: ProjectRow) {
    if (row.dataJson) return { ...row, data: parsedJson(row.dataJson) }
    if (!row.snapshotKvKey || !this.snapshots) throw new SnapshotUnavailableError()
    try {
      const value = await this.snapshots.get(row.snapshotKvKey)
      if (!value) throw new SnapshotUnavailableError()
      return { ...row, data: parsedJson(value) }
    } catch (error) {
      if (error instanceof SnapshotUnavailableError) throw error
      throw new SnapshotUnavailableError()
    }
  }

  async listProjects(userToken: string) {
    return this.repository.listProjects(userToken)
  }

  async getProject(userToken: string, id: string) {
    const row = await this.repository.getProject(userToken, id)
    return row ? this.hydrateProject(row) : undefined
  }

  async createProject(userToken: string, input: ProjectInput) {
    const timestamp = this.timestamp()
    const dataJson = JSON.stringify(input.data)
    const placement = await this.placeSnapshot(userToken, input.id, 1, dataJson)
    let record: ProjectRow | undefined
    try {
      record = await this.repository.createProject({
        id: input.id,
        userToken,
        name: input.name,
        dataJson: placement.dataJson,
        snapshotKvKey: placement.snapshotKvKey,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    } catch (error) {
      await this.safeDeleteSnapshot(placement.snapshotKvKey)
      throw error
    }
    if (!record) {
      await this.safeDeleteSnapshot(placement.snapshotKvKey)
      return { status: 'conflict' as const }
    }
    return {
      status: 'created' as const,
      project: { ...record, data: input.data },
      storage: placement.storage,
    }
  }

  async updateProject(userToken: string, input: ProjectUpdateInput) {
    const current = await this.repository.getProject(userToken, input.id)
    if (!current) return { status: 'missing' as const }
    if (current.version !== input.version) {
      return { status: 'conflict' as const, currentVersion: current.version }
    }
    const timestamp = this.timestamp()
    const placement = await this.placeSnapshot(
      userToken,
      input.id,
      input.version + 1,
      JSON.stringify(input.data),
    )
    let result: UpdateProjectResult
    try {
      result = await this.repository.updateProject(userToken, input.id, input.version, {
        name: input.name,
        dataJson: placement.dataJson,
        snapshotKvKey: placement.snapshotKvKey,
        updatedAt: timestamp,
      })
    } catch (error) {
      await this.safeDeleteSnapshot(placement.snapshotKvKey)
      throw error
    }
    if (result.status !== 'updated') {
      await this.safeDeleteSnapshot(placement.snapshotKvKey)
      return result
    }
    if (current.snapshotKvKey !== placement.snapshotKvKey) {
      await this.safeDeleteSnapshot(current.snapshotKvKey)
    }
    return {
      status: 'updated' as const,
      project: { ...result.row, data: input.data },
      storage: placement.storage,
    }
  }

  async deleteProject(userToken: string, id: string) {
    const deleted = await this.repository.deleteProject(userToken, id)
    if (!deleted) return false
    await this.safeDeleteSnapshot(deleted.snapshotKvKey)
    return true
  }

  async listAssets(userToken: string) {
    return this.repository.listAssets(userToken)
  }

  async getAsset(userToken: string, id: string) {
    return this.repository.getAsset(userToken, id)
  }

  async createAsset(userToken: string, input: AssetInput) {
    const timestamp = this.timestamp()
    const record: CreateAssetRecord = {
      id: input.id,
      userToken,
      projectId: input.projectId,
      name: input.name,
      dataJson: JSON.stringify(input.data),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.repository.createAsset(record)
  }

  async updateAsset(userToken: string, input: AssetUpdateInput) {
    return this.repository.updateAsset(userToken, input.id, input.version, {
      projectId: input.projectId,
      name: input.name,
      dataJson: JSON.stringify(input.data),
      updatedAt: this.timestamp(),
    })
  }

  async deleteAsset(userToken: string, id: string) {
    return this.repository.deleteAsset(userToken, id)
  }
}

export function publicProjectMetadata(row: ProjectRow) {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    updatedAt: row.updatedAt,
  }
}

export function publicProject(row: ProjectRow & { data: Record<string, unknown> }) {
  return { ...publicProjectMetadata(row), data: row.data }
}

export function publicAsset(row: AssetRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    data: parsedJson(row.dataJson),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
