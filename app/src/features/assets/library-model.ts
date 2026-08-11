import type { Asset, Project } from '../project/model'

export type LibraryAssetSource = 'upload' | 'generated' | 'project' | 'built-in'

export interface LibraryAssetRecord {
  id: string
  name: string
  kind: Asset['kind']
  mimeType: string
  url: string
  createdAt: string
  source: 'upload' | 'generated' | 'project' | 'built-in'
  fingerprint?: string
  byteSize?: number
  width?: number
  height?: number
  durationSeconds?: number
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
  }
}

export function deriveLibraryRecord(
  project: Project,
  asset: Asset,
): LibraryAssetRecord {
  const owningNode = project.nodes.find((node) =>
    node.versions.some((version) => version.assetId === asset.id),
  )
  const version = owningNode?.versions.find(
    (candidate) => candidate.assetId === asset.id,
  )

  return {
    ...asset,
    name: owningNode?.title.trim() || asset.id,
    createdAt: version?.createdAt ?? project.createdAt,
    source: asset.url.includes('/demo/')
      ? 'built-in'
      : project.jobs.some((job) => job.assetId === asset.id)
        ? 'generated'
        : 'project',
  }
}
