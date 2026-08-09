import type { Edge } from '@xyflow/react'

import { DependencyEdge } from './DependencyEdge'

export interface DependencyEdgeData extends Record<string, unknown> {
  sourceChanged: boolean
  ariaLabel: string
  onDelete(edgeId: string): void
}

export type DependencyFlowEdge = Edge<DependencyEdgeData, 'dependency'>

export const edgeTypes = { dependency: DependencyEdge }
