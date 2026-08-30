import type { Hono } from 'hono'
import { deviceAuthMiddleware } from '../auth'
import type { AppEnv } from '../bindings'
import { errorResponse } from '../errors'
import type { DataRepository } from './data-repository'
import { D1DataRepository } from './d1-data-repository'
import {
  DataService,
  publicAsset,
  publicProject,
  publicProjectMetadata,
  SnapshotUnavailableError,
  type AssetInput,
  type AssetUpdateInput,
  type ProjectInput,
  type ProjectUpdateInput,
} from './data-service'
import { KvSnapshotStore, type SnapshotStore } from './snapshot-store'

export interface DataRouteOptions {
  dataRepository?: DataRepository
  snapshotStore?: SnapshotStore
  snapshotThresholdBytes?: number
  now: () => number
  resolveOwnerId?: (
    env: AppEnv['Bindings'],
    deviceId: string,
  ) => Promise<string>
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  })
}

async function requestJson(request: Request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
    return undefined
  }
  try {
    return await request.json() as unknown
  } catch {
    return undefined
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function id(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{4,128}$/u.test(value)
    ? value
    : undefined
}

function name(value: unknown) {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized && normalized.length <= 120 ? normalized : undefined
}

function version(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? value
    : undefined
}

function projectInput(value: unknown, forcedId?: string): ProjectInput | undefined {
  const candidate = record(value)
  const projectId = forcedId ?? id(candidate?.id)
  const projectName = name(candidate?.name)
  const data = record(candidate?.data)
  if (!projectId || !projectName || !data) return undefined
  const serialized = JSON.stringify(data)
  if (new TextEncoder().encode(serialized).byteLength > 5_000_000) return undefined
  return { id: projectId, name: projectName, data }
}

function projectUpdate(value: unknown, forcedId: string): ProjectUpdateInput | undefined {
  const input = projectInput(value, forcedId)
  const candidate = record(value)
  const expectedVersion = version(candidate?.version)
  return input && expectedVersion ? { ...input, version: expectedVersion } : undefined
}

function assetInput(value: unknown, forcedId?: string): AssetInput | undefined {
  const candidate = record(value)
  const assetId = forcedId ?? id(candidate?.id)
  const assetName = name(candidate?.name)
  const data = record(candidate?.data)
  const projectId = candidate?.projectId === null || candidate?.projectId === undefined
    ? null
    : id(candidate.projectId)
  if (!assetId || !assetName || !data || projectId === undefined) return undefined
  if (new TextEncoder().encode(JSON.stringify(data)).byteLength > 256_000) return undefined
  return { id: assetId, projectId, name: assetName, data }
}

function assetUpdate(value: unknown, forcedId: string): AssetUpdateInput | undefined {
  const input = assetInput(value, forcedId)
  const candidate = record(value)
  const expectedVersion = version(candidate?.version)
  return input && expectedVersion ? { ...input, version: expectedVersion } : undefined
}

function conflictResponse(kind: '项目' | '资产', currentVersion?: number) {
  return jsonResponse({
    error: {
      code: 'VERSION_CONFLICT',
      message: `${kind}已在其他位置更新，请刷新后重试。`,
      ...(currentVersion === undefined ? {} : { currentVersion }),
    },
  }, 409)
}

export function registerDataRoutes(app: Hono<AppEnv>, options: DataRouteOptions) {
  app.use('/api/data/*', deviceAuthMiddleware(options.now))
  app.use('/api/data/*', async (context, next) => {
    const deviceId = context.get('deviceId')
    const ownerId = options.resolveOwnerId
      ? await options.resolveOwnerId(context.env, deviceId)
      : deviceId
    context.set('ownerId', ownerId)
    await next()
  })

  const ownerId = (context: { get(key: 'deviceId' | 'ownerId'): string | undefined }) =>
    context.get('ownerId') ?? context.get('deviceId') ?? ''

  const service = (env: AppEnv['Bindings']) => {
    const repository = options.dataRepository ?? (env.DB ? new D1DataRepository(env.DB) : undefined)
    if (!repository) return undefined
    const snapshots = options.snapshotStore ?? (env.SNAPSHOT_CACHE
      ? new KvSnapshotStore(env.SNAPSHOT_CACHE)
      : undefined)
    const configuredThreshold = Number(env.SNAPSHOT_KV_THRESHOLD_BYTES)
    const threshold = options.snapshotThresholdBytes ?? (
      Number.isInteger(configuredThreshold) && configuredThreshold >= 1_024
        ? configuredThreshold
        : 64 * 1_024
    )
    return new DataService(repository, snapshots, threshold, options.now)
  }

  const withService = async <T>(
    env: AppEnv['Bindings'],
    operation: (data: DataService) => Promise<T>,
  ): Promise<T | Response> => {
    const data = service(env)
    if (!data) return errorResponse(503, 'DATA_STORE_NOT_CONFIGURED', '数据存储服务尚未配置。')
    try {
      return await operation(data)
    } catch (error) {
      if (error instanceof SnapshotUnavailableError) {
        return errorResponse(503, 'SNAPSHOT_UNAVAILABLE', '项目快照暂时不可用，请稍后重试。')
      }
      throw error
    }
  }

  app.get('/api/data/projects', async (context) => {
    const result = await withService(context.env, async (data) => ({
      projects: (await data.listProjects(ownerId(context))).map(publicProjectMetadata),
    }))
    return result instanceof Response ? result : jsonResponse(result)
  })

  app.post('/api/data/projects', async (context) => {
    const input = projectInput(await requestJson(context.req.raw))
    if (!input) return errorResponse(400, 'INVALID_REQUEST', '项目数据格式不正确。')
    const result = await withService(context.env, (data) => data.createProject(ownerId(context), input))
    if (result instanceof Response) return result
    if (result.status === 'conflict') return conflictResponse('项目')
    return jsonResponse({ ...publicProject(result.project), storage: result.storage }, 201)
  })

  app.get('/api/data/projects/:id', async (context) => {
    const projectId = id(context.req.param('id'))
    if (!projectId) return errorResponse(400, 'INVALID_REQUEST', '项目 ID 格式不正确。')
    const result = await withService(context.env, (data) => data.getProject(ownerId(context), projectId))
    if (result instanceof Response) return result
    return result
      ? jsonResponse(publicProject(result))
      : errorResponse(404, 'PROJECT_NOT_FOUND', '项目不存在或无权访问。')
  })

  app.put('/api/data/projects/:id', async (context) => {
    const projectId = id(context.req.param('id'))
    const input = projectId ? projectUpdate(await requestJson(context.req.raw), projectId) : undefined
    if (!input) return errorResponse(400, 'INVALID_REQUEST', '项目数据或 version 格式不正确。')
    const result = await withService(context.env, (data) => data.updateProject(ownerId(context), input))
    if (result instanceof Response) return result
    if (result.status === 'missing') return errorResponse(404, 'PROJECT_NOT_FOUND', '项目不存在或无权访问。')
    if (result.status === 'conflict') return conflictResponse('项目', result.currentVersion)
    return jsonResponse({ ...publicProject(result.project), storage: result.storage })
  })

  app.delete('/api/data/projects/:id', async (context) => {
    const projectId = id(context.req.param('id'))
    if (!projectId) return errorResponse(400, 'INVALID_REQUEST', '项目 ID 格式不正确。')
    const result = await withService(context.env, (data) => data.deleteProject(ownerId(context), projectId))
    if (result instanceof Response) return result
    return result
      ? new Response(null, { status: 204 })
      : errorResponse(404, 'PROJECT_NOT_FOUND', '项目不存在或无权访问。')
  })

  app.get('/api/data/assets', async (context) => {
    const result = await withService(context.env, async (data) => ({
      assets: (await data.listAssets(ownerId(context))).map(publicAsset),
    }))
    return result instanceof Response ? result : jsonResponse(result)
  })

  app.post('/api/data/assets', async (context) => {
    const input = assetInput(await requestJson(context.req.raw))
    if (!input) return errorResponse(400, 'INVALID_REQUEST', '资产元数据格式不正确。')
    const result = await withService(context.env, (data) => data.createAsset(ownerId(context), input))
    if (result instanceof Response) return result
    return result
      ? jsonResponse(publicAsset(result), 201)
      : conflictResponse('资产')
  })

  app.get('/api/data/assets/:id', async (context) => {
    const assetId = id(context.req.param('id'))
    if (!assetId) return errorResponse(400, 'INVALID_REQUEST', '资产 ID 格式不正确。')
    const result = await withService(context.env, (data) => data.getAsset(ownerId(context), assetId))
    if (result instanceof Response) return result
    return result
      ? jsonResponse(publicAsset(result))
      : errorResponse(404, 'ASSET_NOT_FOUND', '资产不存在或无权访问。')
  })

  app.put('/api/data/assets/:id', async (context) => {
    const assetId = id(context.req.param('id'))
    const input = assetId ? assetUpdate(await requestJson(context.req.raw), assetId) : undefined
    if (!input) return errorResponse(400, 'INVALID_REQUEST', '资产元数据或 version 格式不正确。')
    const result = await withService(context.env, (data) => data.updateAsset(ownerId(context), input))
    if (result instanceof Response) return result
    if (result.status === 'missing') return errorResponse(404, 'ASSET_NOT_FOUND', '资产不存在或无权访问。')
    if (result.status === 'conflict') return conflictResponse('资产', result.currentVersion)
    return jsonResponse(publicAsset(result.row))
  })

  app.delete('/api/data/assets/:id', async (context) => {
    const assetId = id(context.req.param('id'))
    if (!assetId) return errorResponse(400, 'INVALID_REQUEST', '资产 ID 格式不正确。')
    const result = await withService(context.env, (data) => data.deleteAsset(ownerId(context), assetId))
    if (result instanceof Response) return result
    return result
      ? new Response(null, { status: 204 })
      : errorResponse(404, 'ASSET_NOT_FOUND', '资产不存在或无权访问。')
  })
}
