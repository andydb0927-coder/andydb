import type { CanvasNode, Project } from '../../project/model'
import type { LibraryAssetRecord } from '../library-model'

export type DeleteLibraryAssetResult =
  | { status: 'deleted'; projectIds?: string[]; nodeTitles?: string[] }
  | { status: 'missing' }
  | { status: 'referenced'; projectIds: string[]; nodeTitles?: string[] }

export function normalizeLibraryAssetName(name: string): string {
  const normalized = name.trim()
  if (!normalized) throw new Error('素材名称不能为空。')
  return normalized
}

export function requireLibraryAsset(record: LibraryAssetRecord | undefined): LibraryAssetRecord {
  if (!record) throw new Error('素材不存在或已删除。')
  return record
}

function nodeReferencesAsset(node: CanvasNode, assetId: string) {
  return node.card?.imageAssetId === assetId ||
    node.versions.some((version) => version.assetId === assetId) ||
    Boolean(node.imageResults?.some((result) => result.assetId === assetId))
}

/** Same reference boundary as the existing repository; no snapshot or schema changes. */
export function projectReferencesAsset(project: Project, assetId: string): boolean {
  return project.assets.some((asset) => asset.id === assetId) ||
    project.nodes.some((node) => nodeReferencesAsset(node, assetId)) ||
    project.jobs.some((job) => job.assetId === assetId) ||
    project.exportJobs.some((job) => job.assetId === assetId)
}

export function collectAssetReferenceImpact(projects: readonly Project[], assetId: string) {
  const referencedProjects = projects.filter((project) => projectReferencesAsset(project, assetId))
  return {
    referencedProjects,
    projectIds: referencedProjects.map((project) => project.id),
    nodeTitles: [...new Set(referencedProjects.flatMap((project) =>
      project.nodes.filter((node) => nodeReferencesAsset(node, assetId)).map((node) => node.title),
    ))],
  }
}
