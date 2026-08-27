import { useProjectStore } from '../project/project-store'

/** Idempotent materialization: cards and canvas nodes share the same persisted image asset. */
export function sendScriptShotToCanvas(projectId: string, nodeId: string, shotId: string) {
  const project = useProjectStore.getState().activeProject
  const node = project?.nodes.find(node => node.id === nodeId)
  if (project?.id !== projectId || node?.details?.type !== 'script') throw new Error('脚本节点不存在或画布已切换。')
  const details = node.details
  const shot = details.shots?.find(s => s.id === shotId)
  const asset = project.assets.find(a => a.id === shot?.assetId && a.kind === 'image')
  if (!shot || !asset) throw new Error('请先生成此分镜的图片。')
  if (shot.canvasNodeId && project.nodes.some(n => n.id === shot.canvasNodeId)) return shot.canvasNodeId
  const id = crypto.randomUUID(), versionId = crypto.randomUUID()
  useProjectStore.getState().addNode({
    id, kind: 'image', title: shot.title,
    position: { x: node.position.x + 560, y: node.position.y + (details.shots?.indexOf(shot) ?? 0) * 330 },
    versions: [{ id: versionId, createdAt: new Date().toISOString(), prompt: shot.prompt, assetId: asset.id }],
    activeVersionId: versionId, sourceChanged: false, modelProviderId: 'seedream-5-pro-api',
    imageResults: [{ id: `${id}-result`, assetId: asset.id }], activeResultId: `${id}-result`,
  })
  useProjectStore.getState().updateNode(nodeId, { details: { ...details, shots: details.shots?.map(s => s.id === shotId ? { ...s, canvasNodeId: id } : s) } })
  return id
}
