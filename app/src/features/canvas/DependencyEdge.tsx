import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  useStore,
} from '@xyflow/react'
import { Trash2 } from 'lucide-react'

import type { DependencyFlowEdge } from './edge-types'

const DELETE_CONTROL_HALF_SIZE = 16
const DELETE_CONTROL_GUTTER = 8
const NARROW_BOTTOM_RESERVE = 180

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function clampLabelToContainer(
  labelX: number,
  labelY: number,
  viewport: [number, number, number],
  bounds: { left: number; top: number; right: number; bottom: number },
) {
  const [viewportX, viewportY, zoom] = viewport
  if (zoom <= 0) return [labelX, labelY] as const

  const controlInset = DELETE_CONTROL_HALF_SIZE * zoom + DELETE_CONTROL_GUTTER
  const screenX = bounds.left + viewportX + labelX * zoom
  const screenY = bounds.top + viewportY + labelY * zoom
  const minimumX = bounds.left + controlInset
  const maximumX = Math.max(
    minimumX,
    bounds.right - controlInset,
  )
  const minimumY = bounds.top + controlInset
  const narrow = bounds.right - bounds.left <= 800
  const bottomInset = narrow
    ? Math.max(NARROW_BOTTOM_RESERVE, controlInset)
    : controlInset
  const maximumY = Math.max(minimumY, bounds.bottom - bottomInset)
  const clampedScreenX = clamp(screenX, minimumX, maximumX)
  const clampedScreenY = clamp(screenY, minimumY, maximumY)

  return [
    (clampedScreenX - bounds.left - viewportX) / zoom,
    (clampedScreenY - bounds.top - viewportY) / zoom,
  ] as const
}

function DependencyEdgeDeleteAction({
  id,
  labelX,
  labelY,
  data,
}: {
  id: string
  labelX: number
  labelY: number
  data: NonNullable<DependencyFlowEdge['data']>
}) {
  const viewport = useStore((state) => state.transform)
  const domNode = useStore((state) => state.domNode)
  const viewportWidth = useStore((state) => state.width)
  const viewportHeight = useStore((state) => state.height)
  const rect = domNode?.getBoundingClientRect()
  const bounds = rect
    ? {
        left: rect.left,
        top: rect.top,
        right: rect.left + (viewportWidth || rect.width),
        bottom: rect.top + (viewportHeight || rect.height),
      }
    : undefined
  const [deleteX, deleteY] = bounds
    ? clampLabelToContainer(labelX, labelY, viewport, bounds)
    : [labelX, labelY]

  return (
    <button
      type="button"
      className="dependency-edge__delete nodrag nopan"
      aria-label={`删除连接：${data.ariaLabel}`}
      style={{
        transform: `translate(-50%, -50%) translate(${deleteX}px, ${deleteY}px)`,
      }}
      onClick={() => data.onDelete(id)}
    >
      <Trash2 aria-hidden="true" />
    </button>
  )
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
          <DependencyEdgeDeleteAction
            id={id}
            labelX={labelX}
            labelY={labelY}
            data={data}
          />
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
