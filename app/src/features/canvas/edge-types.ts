import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { createElement } from 'react'

interface DependencyEdgeData extends Record<string, unknown> {
  sourceChanged: boolean
}

export type DependencyFlowEdge = Edge<DependencyEdgeData, 'dependency'>

function DependencyEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<DependencyFlowEdge>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  return createElement(BaseEdge, {
    path,
    markerEnd,
    className: data?.sourceChanged
      ? 'dependency-edge--changed'
      : 'dependency-edge',
  })
}

export const edgeTypes = { dependency: DependencyEdge }
