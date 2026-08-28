import type { Asset, CanvasNode, GenerationJob, NodeVersion, Project } from './model'

export interface VideoVersionEntry { version: NodeVersion; asset: Asset; job?: GenerationJob }

export function videoVersionHistory(project: Project, node: CanvasNode): VideoVersionEntry[] {
  return node.versions.flatMap(version => {
    const asset = project.assets.find(asset => asset.id === version.assetId && asset.kind === 'video')
    if (!asset) return []
    // A later job can temporarily own activeVersion.generationJobId. Match the
    // output asset first so restoring an old version never inherits new costs.
    const job = project.jobs.find(job => job.nodeId === node.id && job.assetId === asset.id && job.status === 'succeeded')
    return [{ version, asset, job }]
  })
}
