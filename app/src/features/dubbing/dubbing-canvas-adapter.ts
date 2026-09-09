import type { Project } from '../project/model'
import type { DubbingReviewSource } from './dubbing-workbench-model'

export type DubbingSourceSelection = { type: 'node' | 'history'; id: string }

/** Reads a snapshot only. The canvas, job history and asset contracts remain unchanged. */
export function resolveDubbingSource(project: Project, selection: DubbingSourceSelection): DubbingReviewSource {
  const job = selection.type === 'history' ? project.jobs.find(item => item.id === selection.id) : undefined
  if (selection.type === 'history' && job?.status !== 'succeeded') throw new Error('仅可送审成功且保留结果资产的历史任务。')
  const nodeId = job?.nodeId ?? selection.id
  const node = project.nodes.find(item => item.id === nodeId)
  if (selection.type === 'node' && !node) throw new Error('来源节点不存在。')
  const version = node?.versions.find(item => item.id === node.activeVersionId)
  const assetId = selection.type === 'history' ? job?.assetId : version?.assetId
  const asset = project.assets.find(item => item.id === assetId)
  if (!asset) throw new Error('暂无可送审的结果，请先生成或上传媒体。')
  const upstreamIds = project.edges.filter(edge => edge.targetNodeId === nodeId).map(edge => {
    const upstream = project.nodes.find(item => item.id === edge.sourceNodeId)
    return upstream?.versions.find(item => item.id === upstream.activeVersionId)?.assetId
  })
  return structuredClone({ projectId: project.id, nodeId, title: node?.title ?? job?.prompt ?? '历史结果',
    prompt: job?.prompt ?? version?.prompt ?? '', providerId: job?.providerId ?? node?.generationConfig?.providerId ?? 'existing-asset',
    requestId: job?.id ?? version?.generationJobId ?? version?.id ?? asset.id, asset,
    referenceAssets: project.assets.filter(item => upstreamIds.includes(item.id)) })
}
