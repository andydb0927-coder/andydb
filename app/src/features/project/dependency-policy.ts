import type { DependencyEdge, NodeKind, Project } from './model'

export type ConnectionFailureReason =
  | 'missing-node'
  | 'self-connection'
  | 'duplicate'
  | 'cycle'
  | 'incompatible-types'

export type ConnectionValidationResult =
  | { ok: true }
  | { ok: false; reason: ConnectionFailureReason }

const targets = (...kinds: NodeKind[]) => new Set<NodeKind>(kinds)

const allowedTargets: Record<NodeKind, ReadonlySet<NodeKind>> = {
  character: targets('storyboard', 'video'),
  scene: targets('storyboard', 'video'),
  text: targets('storyboard', 'video'),
  image: targets('storyboard', 'video'),
  preview: targets('storyboard', 'video'),
  storyboard: targets('video'),
  video: targets(),
}

function hasPath(edges: DependencyEdge[], start: string, target: string) {
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const targets = outgoing.get(edge.sourceNodeId) ?? []
    targets.push(edge.targetNodeId)
    outgoing.set(edge.sourceNodeId, targets)
  }
  const queue = [start]
  const visited = new Set(queue)
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    if (current === target) return true
    for (const next of outgoing.get(current) ?? []) {
      if (visited.has(next)) continue
      visited.add(next)
      queue.push(next)
    }
  }
  return false
}

export function validateDependencyConnection(
  project: Project,
  sourceNodeId: string,
  targetNodeId: string,
): ConnectionValidationResult {
  const source = project.nodes.find(({ id }) => id === sourceNodeId)
  const target = project.nodes.find(({ id }) => id === targetNodeId)
  if (!source || !target) return { ok: false, reason: 'missing-node' }
  if (sourceNodeId === targetNodeId) {
    return { ok: false, reason: 'self-connection' }
  }
  if (
    project.edges.some(
      (edge) =>
        edge.sourceNodeId === sourceNodeId &&
        edge.targetNodeId === targetNodeId,
    )
  ) {
    return { ok: false, reason: 'duplicate' }
  }
  if (hasPath(project.edges, targetNodeId, sourceNodeId)) {
    return { ok: false, reason: 'cycle' }
  }
  if (!allowedTargets[source.kind].has(target.kind)) {
    return { ok: false, reason: 'incompatible-types' }
  }
  return { ok: true }
}

const failureCopy: Record<ConnectionFailureReason, string> = {
  'missing-node': '节点已发生变化，请重新选择',
  'self-connection': '节点不能连接到自身',
  duplicate: '这两个节点已经连接',
  cycle: '此连接会形成循环依赖',
  'incompatible-types': '这两种节点不能建立生成依赖',
}

export function connectionFailureMessage(reason: ConnectionFailureReason) {
  return failureCopy[reason]
}
