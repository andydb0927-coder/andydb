import type {
  AssetRow,
  CreateAssetRecord,
  CreateProjectRecord,
  DataRepository,
  ProjectRow,
  UpdateAssetResult,
  UpdateProjectResult,
} from './data-repository'
import {
  EdgeKvMutationQueue,
  edgeKvJson,
  edgeKvKeyPart,
  edgeKvKeys,
  putEdgeKvJson,
  type EdgeKvNamespace,
} from './edgekv-namespace'

function userPrefix(userToken: string) {
  return `v1:user:${edgeKvKeyPart(userToken)}`
}

function projectPrefix(userToken: string) {
  return `${userPrefix(userToken)}:project:`
}

function projectKey(userToken: string, id: string) {
  return `${projectPrefix(userToken)}${edgeKvKeyPart(id)}`
}

function assetPrefix(userToken: string) {
  return `${userPrefix(userToken)}:asset:`
}

function assetKey(userToken: string, id: string) {
  return `${assetPrefix(userToken)}${edgeKvKeyPart(id)}`
}

async function rows<T extends { updatedAt: string }>(namespace: EdgeKvNamespace, prefix: string) {
  const values: T[] = []
  for (const key of await edgeKvKeys(namespace, prefix)) {
    const value = await edgeKvJson<T>(namespace, key)
    if (value) values.push(value)
  }
  return values.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export class EdgeKvDataRepository implements DataRepository {
  private readonly mutations = new EdgeKvMutationQueue()

  constructor(private readonly namespace: EdgeKvNamespace) {}

  async listProjects(userToken: string) {
    return rows<ProjectRow>(this.namespace, projectPrefix(userToken))
  }

  async getProject(userToken: string, id: string) {
    return edgeKvJson<ProjectRow>(this.namespace, projectKey(userToken, id))
  }

  async createProject(record: CreateProjectRecord) {
    const key = projectKey(record.userToken, record.id)
    return this.mutations.run(key, async () => {
      if (await edgeKvJson<ProjectRow>(this.namespace, key)) return undefined
      const row: ProjectRow = { ...record, version: 1 }
      await putEdgeKvJson(this.namespace, key, row)
      return row
    })
  }

  async updateProject(
    userToken: string,
    id: string,
    expectedVersion: number,
    update: Omit<CreateProjectRecord, 'id' | 'userToken' | 'createdAt'>,
  ): Promise<UpdateProjectResult> {
    const key = projectKey(userToken, id)
    return this.mutations.run(key, async () => {
      const current = await edgeKvJson<ProjectRow>(this.namespace, key)
      if (!current) return { status: 'missing' }
      if (current.version !== expectedVersion) {
        return { status: 'conflict', currentVersion: current.version }
      }
      const row: ProjectRow = { ...current, ...update, version: current.version + 1 }
      await putEdgeKvJson(this.namespace, key, row)
      return { status: 'updated', row }
    })
  }

  async deleteProject(userToken: string, id: string) {
    const key = projectKey(userToken, id)
    return this.mutations.run(key, async () => {
      const current = await edgeKvJson<ProjectRow>(this.namespace, key)
      if (!current) return undefined
      await this.namespace.delete(key)
      return current
    })
  }

  async listAssets(userToken: string) {
    return rows<AssetRow>(this.namespace, assetPrefix(userToken))
  }

  async getAsset(userToken: string, id: string) {
    return edgeKvJson<AssetRow>(this.namespace, assetKey(userToken, id))
  }

  async createAsset(record: CreateAssetRecord) {
    const key = assetKey(record.userToken, record.id)
    return this.mutations.run(key, async () => {
      if (await edgeKvJson<AssetRow>(this.namespace, key)) return undefined
      const row: AssetRow = { ...record, version: 1 }
      await putEdgeKvJson(this.namespace, key, row)
      return row
    })
  }

  async updateAsset(
    userToken: string,
    id: string,
    expectedVersion: number,
    update: Pick<CreateAssetRecord, 'name' | 'dataJson' | 'updatedAt' | 'projectId'>,
  ): Promise<UpdateAssetResult> {
    const key = assetKey(userToken, id)
    return this.mutations.run(key, async () => {
      const current = await edgeKvJson<AssetRow>(this.namespace, key)
      if (!current) return { status: 'missing' }
      if (current.version !== expectedVersion) {
        return { status: 'conflict', currentVersion: current.version }
      }
      const row: AssetRow = { ...current, ...update, version: current.version + 1 }
      await putEdgeKvJson(this.namespace, key, row)
      return { status: 'updated', row }
    })
  }

  async deleteAsset(userToken: string, id: string) {
    const key = assetKey(userToken, id)
    return this.mutations.run(key, async () => {
      if (!await edgeKvJson<AssetRow>(this.namespace, key)) return false
      await this.namespace.delete(key)
      return true
    })
  }
}
