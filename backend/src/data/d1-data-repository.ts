import type {
  AssetRow,
  CreateAssetRecord,
  CreateProjectRecord,
  DataRepository,
  ProjectRow,
  UpdateAssetResult,
  UpdateProjectResult,
} from './data-repository'

interface ProjectDatabaseRow {
  id: string
  user_token: string
  name: string
  data_json: string | null
  snapshot_kv_key: string | null
  version: number
  created_at: string
  updated_at: string
}

interface AssetDatabaseRow {
  id: string
  user_token: string
  project_id: string | null
  name: string
  data_json: string
  version: number
  created_at: string
  updated_at: string
}

function projectRow(row: ProjectDatabaseRow): ProjectRow {
  return {
    id: row.id,
    userToken: row.user_token,
    name: row.name,
    dataJson: row.data_json,
    snapshotKvKey: row.snapshot_kv_key,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function assetRow(row: AssetDatabaseRow): AssetRow {
  return {
    id: row.id,
    userToken: row.user_token,
    projectId: row.project_id,
    name: row.name,
    dataJson: row.data_json,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class D1DataRepository implements DataRepository {
  constructor(private readonly database: D1Database) {}

  async listProjects(userToken: string) {
    const result = await this.database.prepare(`
      SELECT id, user_token, name, data_json, snapshot_kv_key, version, created_at, updated_at
      FROM projects
      WHERE user_token = ?
      ORDER BY updated_at DESC
    `).bind(userToken).all<ProjectDatabaseRow>()
    return result.results.map(projectRow)
  }

  async getProject(userToken: string, id: string) {
    const row = await this.database.prepare(`
      SELECT id, user_token, name, data_json, snapshot_kv_key, version, created_at, updated_at
      FROM projects
      WHERE user_token = ? AND id = ?
      LIMIT 1
    `).bind(userToken, id).first<ProjectDatabaseRow>()
    return row ? projectRow(row) : undefined
  }

  async createProject(record: CreateProjectRecord) {
    const result = await this.database.prepare(`
      INSERT INTO projects (
        id, user_token, name, data_json, snapshot_kv_key, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      record.id,
      record.userToken,
      record.name,
      record.dataJson,
      record.snapshotKvKey,
      record.createdAt,
      record.updatedAt,
    ).run()
    return (result.meta.changes ?? 0) > 0
      ? this.getProject(record.userToken, record.id)
      : undefined
  }

  async updateProject(
    userToken: string,
    id: string,
    expectedVersion: number,
    update: Omit<CreateProjectRecord, 'id' | 'userToken' | 'createdAt'>,
  ): Promise<UpdateProjectResult> {
    const result = await this.database.prepare(`
      UPDATE projects
      SET name = ?, data_json = ?, snapshot_kv_key = ?, version = version + 1, updated_at = ?
      WHERE user_token = ? AND id = ? AND version = ?
    `).bind(
      update.name,
      update.dataJson,
      update.snapshotKvKey,
      update.updatedAt,
      userToken,
      id,
      expectedVersion,
    ).run()
    if ((result.meta.changes ?? 0) > 0) {
      const row = await this.getProject(userToken, id)
      if (row) return { status: 'updated', row }
    }
    const current = await this.getProject(userToken, id)
    return current
      ? { status: 'conflict', currentVersion: current.version }
      : { status: 'missing' }
  }

  async deleteProject(userToken: string, id: string) {
    const current = await this.getProject(userToken, id)
    if (!current) return undefined
    const result = await this.database.prepare(
      'DELETE FROM projects WHERE user_token = ? AND id = ?',
    ).bind(userToken, id).run()
    return (result.meta.changes ?? 0) > 0 ? current : undefined
  }

  async listAssets(userToken: string) {
    const result = await this.database.prepare(`
      SELECT id, user_token, project_id, name, data_json, version, created_at, updated_at
      FROM assets
      WHERE user_token = ?
      ORDER BY updated_at DESC
    `).bind(userToken).all<AssetDatabaseRow>()
    return result.results.map(assetRow)
  }

  async getAsset(userToken: string, id: string) {
    const row = await this.database.prepare(`
      SELECT id, user_token, project_id, name, data_json, version, created_at, updated_at
      FROM assets
      WHERE user_token = ? AND id = ?
      LIMIT 1
    `).bind(userToken, id).first<AssetDatabaseRow>()
    return row ? assetRow(row) : undefined
  }

  async createAsset(record: CreateAssetRecord) {
    const result = await this.database.prepare(`
      INSERT INTO assets (
        id, user_token, project_id, name, data_json, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      record.id,
      record.userToken,
      record.projectId,
      record.name,
      record.dataJson,
      record.createdAt,
      record.updatedAt,
    ).run()
    return (result.meta.changes ?? 0) > 0
      ? this.getAsset(record.userToken, record.id)
      : undefined
  }

  async updateAsset(
    userToken: string,
    id: string,
    expectedVersion: number,
    update: Pick<CreateAssetRecord, 'name' | 'dataJson' | 'updatedAt' | 'projectId'>,
  ): Promise<UpdateAssetResult> {
    const result = await this.database.prepare(`
      UPDATE assets
      SET project_id = ?, name = ?, data_json = ?, version = version + 1, updated_at = ?
      WHERE user_token = ? AND id = ? AND version = ?
    `).bind(
      update.projectId,
      update.name,
      update.dataJson,
      update.updatedAt,
      userToken,
      id,
      expectedVersion,
    ).run()
    if ((result.meta.changes ?? 0) > 0) {
      const row = await this.getAsset(userToken, id)
      if (row) return { status: 'updated', row }
    }
    const current = await this.getAsset(userToken, id)
    return current
      ? { status: 'conflict', currentVersion: current.version }
      : { status: 'missing' }
  }

  async deleteAsset(userToken: string, id: string) {
    const result = await this.database.prepare(
      'DELETE FROM assets WHERE user_token = ? AND id = ?',
    ).bind(userToken, id).run()
    return (result.meta.changes ?? 0) > 0
  }
}
