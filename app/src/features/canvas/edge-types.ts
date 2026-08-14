import type { Edge } from '@xyflow/react'

import { DependencyEdge } from './DependencyEdge'

export interface DependencyEdgeData extends Record<string, unknown> {
  visible: boolean
  sourceChanged: boolean
  ariaLabel: string
  onDelete(edgeId: string): void
  onInsert(
    edgeId: string,
    midpoint: { x: number; y: number },
    trigger: HTMLButtonElement,
  ): void
}

export type DependencyFlowEdge = Edge<DependencyEdgeData, 'dependency'>

export const edgeTypes = { dependency: DependencyEdge }
