import type { CanvasGroup, CanvasNode } from '../project/model'

export interface CanvasGroupNodeGeometry {
  id: CanvasNode['id']
  position: CanvasNode['position']
  measured?: { width?: number; height?: number }
}

export interface CanvasGroupBounds {
  x: number
  y: number
  width: number
  height: number
}

const defaultNodeWidth = 280
const defaultNodeHeight = 180
const horizontalPadding = 32
const topPadding = 54
const bottomPadding = 32

export function measureCanvasGroup(
  group: CanvasGroup,
  nodes: CanvasGroupNodeGeometry[],
): CanvasGroupBounds | undefined {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const members = group.nodeIds.flatMap((nodeId) => {
    const node = nodesById.get(nodeId)
    return node ? [node] : []
  })
  if (members.length < 2) return undefined

  const left = Math.min(...members.map(({ position }) => position.x))
  const top = Math.min(...members.map(({ position }) => position.y))
  const right = Math.max(
    ...members.map(
      ({ position, measured }) =>
        position.x + (measured?.width ?? defaultNodeWidth),
    ),
  )
  const bottom = Math.max(
    ...members.map(
      ({ position, measured }) =>
        position.y + (measured?.height ?? defaultNodeHeight),
    ),
  )

  return {
    x: left - horizontalPadding,
    y: top - topPadding,
    width: right - left + horizontalPadding * 2,
    height: bottom - top + topPadding + bottomPadding,
  }
}

export function findSelectedCanvasGroup(
  groups: CanvasGroup[],
  selectedNodeIds: ReadonlySet<string>,
): CanvasGroup | undefined {
  if (selectedNodeIds.size < 2) return undefined
  return groups.find(
    (group) =>
      group.nodeIds.length === selectedNodeIds.size &&
      group.nodeIds.every((nodeId) => selectedNodeIds.has(nodeId)),
  )
}
