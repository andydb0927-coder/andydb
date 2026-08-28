import type { Asset, Project } from '../project/model'
import { projectReferencesAsset } from './domain/asset-library-policy'
import { detachScriptAsset } from '../script/script-project-references'

export type LibraryAssetSource = 'upload' | 'generated' | 'project' | 'built-in'
export type LibraryAssetFolderId = 'project' | 'generated' | 'inspiration'

export interface LibraryAssetRecord {
  id: string
  name: string
  kind: Asset['kind']
  mimeType: string
  url: string
  createdAt: string
  source: 'upload' | 'generated' | 'project' | 'built-in'
  folderId?: LibraryAssetFolderId
  fingerprint?: string
  byteSize?: number
  width?: number
  height?: number
  durationSeconds?: number
  framesPerSecond?: number
  resolution?: string
  sampleRate?: number
  audioChannels?: number
}

export function libraryRecordToAsset(record: LibraryAssetRecord): Asset {
  return {
    id: record.id,
    kind: record.kind,
    mimeType: record.mimeType,
    url: record.url,
    width: record.width,
    height: record.height,
    durationSeconds: record.durationSeconds,
    ...(record.framesPerSecond === undefined ? {} : { framesPerSecond: record.framesPerSecond }),
    ...(record.resolution === undefined ? {} : { resolution: record.resolution }),
    ...(record.sampleRate === undefined ? {} : { sampleRate: record.sampleRate }),
    ...(record.audioChannels === undefined ? {} : { audioChannels: record.audioChannels }),
  }
}

export function deriveLibraryRecord(
  project: Project,
  asset: Asset,
): LibraryAssetRecord {
  const owningNode = project.nodes.find((node) =>
    node.versions.some((version) => version.assetId === asset.id) ||
    node.imageResults?.some((result) => result.assetId === asset.id),
  )
  const version = owningNode?.versions.find(
    (candidate) => candidate.assetId === asset.id,
  )
  const resultIndex = owningNode?.imageResults?.findIndex(
    (result) => result.assetId === asset.id,
  ) ?? -1
  const generated =
    project.jobs.some((job) => job.assetId === asset.id) ||
    Boolean(
      owningNode &&
      resultIndex >= 0 &&
      owningNode.versions.some((candidate) => candidate.generationJobId),
    )
  const name = owningNode?.title.trim()

  return {
    ...asset,
    name: name
      ? resultIndex >= 0 && (owningNode?.imageResults?.length ?? 0) > 1
        ? `${name} · 结果 ${resultIndex + 1}`
        : name
      : asset.id,
    createdAt: version?.createdAt ?? project.createdAt,
    source: asset.url.includes('/demo/')
      ? 'built-in'
      : generated
        ? 'generated'
        : 'project',
    folderId: generated
      ? 'generated'
      : 'project',
  }
}

export function detachLibraryAssetFromProject(
  project: Project,
  assetId: string,
): Project {
  if (!projectReferencesAsset(project, assetId)) return project

  const timestamp = new Date().toISOString()

  return {
    ...project,
    updatedAt: timestamp,
    assets: project.assets.filter((asset) => asset.id !== assetId),
    nodes: project.nodes.map((node) => {
      const versions = node.versions.map((version) =>
        version.assetId === assetId
          ? { ...version, assetId: undefined }
          : version,
      )
      const imageResults = node.imageResults?.filter(
        (result) => result.assetId !== assetId,
      )
      const activeResultId = imageResults?.some(
        (result) => result.id === node.activeResultId,
      )
        ? node.activeResultId
        : imageResults?.[0]?.id

      return {
        ...node,
        details: detachScriptAsset(node.details, assetId),
        card:
          node.card?.imageAssetId === assetId
            ? { ...node.card, imageAssetId: undefined }
            : node.card,
        versions,
        imageResults,
        activeResultId,
      }
    }),
    jobs: project.jobs.map((job) =>
      job.assetId === assetId ? { ...job, assetId: undefined } : job,
    ),
    exportJobs: project.exportJobs.map((job) =>
      job.assetId === assetId ? { ...job, assetId: undefined } : job,
    ),
  }
}
