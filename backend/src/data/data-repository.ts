export interface ProjectRow {
  id: string
  userToken: string
  name: string
  dataJson: string | null
  snapshotKvKey: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface CreateProjectRecord {
  id: string
  userToken: string
  name: string
  dataJson: string | null
  snapshotKvKey: string | null
  createdAt: string
  updatedAt: string
}

export type UpdateProjectResult =
  | { status: 'updated'; row: ProjectRow }
  | { status: 'conflict'; currentVersion: number }
  | { status: 'missing' }

export interface AssetRow {
  id: string
  userToken: string
  projectId: string | null
  name: string
  dataJson: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface CreateAssetRecord {
  id: string
  userToken: string
  projectId: string | null
  name: string
  dataJson: string
  createdAt: string
  updatedAt: string
}

export type UpdateAssetResult =
  | { status: 'updated'; row: AssetRow }
  | { status: 'conflict'; currentVersion: number }
  | { status: 'missing' }

export interface DataRepository {
  listProjects(userToken: string): Promise<ProjectRow[]>
  getProject(userToken: string, id: string): Promise<ProjectRow | undefined>
  createProject(record: CreateProjectRecord): Promise<ProjectRow | undefined>
  updateProject(
    userToken: string,
    id: string,
    expectedVersion: number,
    update: Omit<CreateProjectRecord, 'id' | 'userToken' | 'createdAt'>,
  ): Promise<UpdateProjectResult>
  deleteProject(userToken: string, id: string): Promise<ProjectRow | undefined>
  listAssets(userToken: string): Promise<AssetRow[]>
  getAsset(userToken: string, id: string): Promise<AssetRow | undefined>
  createAsset(record: CreateAssetRecord): Promise<AssetRow | undefined>
  updateAsset(
    userToken: string,
    id: string,
    expectedVersion: number,
    update: Pick<CreateAssetRecord, 'name' | 'dataJson' | 'updatedAt' | 'projectId'>,
  ): Promise<UpdateAssetResult>
  deleteAsset(userToken: string, id: string): Promise<boolean>
}
