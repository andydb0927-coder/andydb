import type { Project } from '../project/model'

export type WorkflowBatchPlan =
  | { ok: true; nodeIds: string[] }
  | { ok: false; reason: string }

/**
 * Validates dependency endpoints and returns a stable topological order for
 * either a selected group or the complete active canvas.
 */
export function createWorkflowBatchPlan(
  project: Project,
  requestedNodeIds?: Iterable<string>,
): WorkflowBatchPlan {
  const nodeIds = new Set(project.nodes.map(({ id }) => id))
  for (const edge of project.edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      return {
        ok: false,
        reason: `连线 ${edge.id} 指向不存在的节点。`,
      }
    }
  }

  const requested = requestedNodeIds
    ? new Set([...requestedNodeIds].filter((id) => nodeIds.has(id)))
    : nodeIds
  if (requested.size === 0) {
    return { ok: false, reason: '当前范围没有可执行节点。' }
  }

  const orderedByCanvas = project.nodes
    .filter(({ id }) => requested.has(id))
    .map(({ id }) => id)
  const indegree = new Map(orderedByCanvas.map((id) => [id, 0]))
  const outgoing = new Map<string, string[]>()
  for (const edge of project.edges) {
    if (!requested.has(edge.sourceNodeId) || !requested.has(edge.targetNodeId)) {
      continue
    }
    outgoing.set(edge.sourceNodeId, [
      ...(outgoing.get(edge.sourceNodeId) ?? []),
      edge.targetNodeId,
    ])
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1)
  }

  const queue = orderedByCanvas.filter((id) => indegree.get(id) === 0)
  const sorted: string[] = []
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index]
    sorted.push(nodeId)
    for (const targetId of outgoing.get(nodeId) ?? []) {
      const next = (indegree.get(targetId) ?? 1) - 1
      indegree.set(targetId, next)
      if (next === 0) queue.push(targetId)
    }
  }

  if (sorted.length !== requested.size) {
    return {
      ok: false,
      reason: '依赖关系存在循环，请先断开循环连线。',
    }
  }
  return { ok: true, nodeIds: sorted }
}
