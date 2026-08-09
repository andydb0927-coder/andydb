import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import type { CSSProperties } from 'react'

import type { DependencyFlowEdge } from './edge-types'

interface DependencyEdgeStyle extends CSSProperties {
  '--dependency-edge-label-x': string
  '--dependency-edge-label-y': string
}

export function DependencyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
}: EdgeProps<DependencyFlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })
  const deleteStyle: DependencyEdgeStyle = {
    '--dependency-edge-label-x': `${labelX}px`,
    '--dependency-edge-label-y': `${labelY}px`,
    transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={24}
        className={
          data?.sourceChanged
            ? 'dependency-edge--changed'
            : 'dependency-edge'
        }
      />
      {selected && data ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="dependency-edge__delete nodrag nopan"
            aria-label={`删除连接：${data.ariaLabel}`}
            style={deleteStyle}
            onClick={() => data.onDelete(id)}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
