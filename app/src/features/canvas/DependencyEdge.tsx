import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  useStore,
} from '@xyflow/react'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { DependencyFlowEdge } from './edge-types'

const DELETE_CONTROL_HALF_SIZE = 17
const DELETE_CONTROL_GUTTER = 8
const NARROW_BOTTOM_RESERVE = 180
const INTERACTION_WIDTH = 24

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

  const controlInset = DELETE_CONTROL_HALF_SIZE + DELETE_CONTROL_GUTTER
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
  const zoom = viewport[2] > 0 ? viewport[2] : 1

  return (
    <button
      type="button"
      className="dependency-edge__delete nodrag nopan"
      aria-label={`删除连接：${data.ariaLabel}`}
      style={{
        transform: `translate(${deleteX}px, ${deleteY}px) scale(${1 / zoom}) translate(-50%, -50%)`,
      }}
      onClick={() => data.onDelete(id)}
    >
      <Trash2 aria-hidden="true" />
    </button>
  )
}

function DependencyEdgeInsertAction({
  id,
  labelX,
  labelY,
  data,
  onKeepOpen,
  onScheduleClose,
}: {
  id: string
  labelX: number
  labelY: number
  data: NonNullable<DependencyFlowEdge['data']>
  onKeepOpen(): void
  onScheduleClose(): void
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
  const [insertX, insertY] = bounds
    ? clampLabelToContainer(labelX, labelY, viewport, bounds)
    : [labelX, labelY]
  const zoom = viewport[2] > 0 ? viewport[2] : 1

  return (
    <button
      type="button"
      className="dependency-edge__insert nodrag nopan"
      aria-label={`在连接“${data.ariaLabel}”中插入节点`}
      style={{
        transform: `translate(${insertX}px, ${insertY}px) scale(${1 / zoom}) translate(-50%, -50%)`,
      }}
      onMouseEnter={onKeepOpen}
      onMouseLeave={onScheduleClose}
      onFocus={onKeepOpen}
      onBlur={onScheduleClose}
      onClick={(event) => {
        event.stopPropagation()
        data.onInsert(id, { x: labelX, y: labelY }, event.currentTarget)
      }}
    >
      <Plus aria-hidden="true" />
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
  const visible = data?.visible ?? true
  const viewportZoom = useStore((state) => state.transform[2])
  const [insertVisible, setInsertVisible] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const keepInsertOpen = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setInsertVisible(true)
  }
  const scheduleInsertClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => setInsertVisible(false), 120)
  }
  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    },
    [],
  )
  if (visible === false) return null

  const interactionStrokeWidth =
    INTERACTION_WIDTH / (viewportZoom > 0 ? viewportZoom : 1)
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
      <g
        className="dependency-edge__paths"
        onMouseEnter={keepInsertOpen}
        onMouseLeave={scheduleInsertClose}
      >
        <BaseEdge
          id={id}
          path={path}
          markerEnd={markerEnd}
          interactionWidth={0}
          vectorEffect="non-scaling-stroke"
          className={
            data?.sourceChanged
              ? 'dependency-edge--changed'
              : 'dependency-edge'
          }
        />
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={interactionStrokeWidth}
          pointerEvents="stroke"
          className="react-flow__edge-interaction dependency-edge__interaction"
        />
      </g>
      {insertVisible && !selected && data ? (
        <EdgeLabelRenderer>
          <DependencyEdgeInsertAction
            id={id}
            labelX={labelX}
            labelY={labelY}
            data={data}
            onKeepOpen={keepInsertOpen}
            onScheduleClose={scheduleInsertClose}
          />
        </EdgeLabelRenderer>
      ) : null}
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
