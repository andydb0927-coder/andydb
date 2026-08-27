import type { Project } from '../project/model'
import type { LibTvProviderSelection } from '../generation/libtv-contract'

export function sameSelection(
  left: LibTvProviderSelection,
  right: LibTvProviderSelection,
) {
  return (
    left.projectUuid === right.projectUuid &&
    left.projectName === right.projectName &&
    left.imageModelKey === right.imageModelKey &&
    left.imageModelName === right.imageModelName &&
    left.videoModelKey === right.videoModelKey &&
    left.videoModelName === right.videoModelName
  )
}

export function downstreamConsumers(project: Project, nodeId: string) {
  const outgoing = new Map<string, string[]>()
  for (const edge of project.edges) {
    const sourceNodeId = edge.sourceNodeId
    const targets = outgoing.get(sourceNodeId)
    if (targets) {
      targets.push(edge.targetNodeId)
    } else {
      outgoing.set(sourceNodeId, [edge.targetNodeId])
    }
  }

  const consumerIds = new Set<string>()
  const visited = new Set([nodeId])
  const queue = [nodeId]

  for (let index = 0; index < queue.length; index += 1) {
    const sourceId = queue[index]
    for (const targetNodeId of outgoing.get(sourceId) ?? []) {
      if (visited.has(targetNodeId)) {
        continue
      }
      visited.add(targetNodeId)
      consumerIds.add(targetNodeId)
      queue.push(targetNodeId)
    }
  }

  return project.nodes.filter((node) => consumerIds.has(node.id))
}
