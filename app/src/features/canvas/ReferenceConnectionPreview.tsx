import { getBezierPath, Position } from '@xyflow/react'

import type { Project } from '../project/model'

type CanvasNodePosition = Project['nodes'][number]['position']

interface ReferenceConnectionPreviewProps {
  source: CanvasNodePosition
  target: CanvasNodePosition
  sourceTitle: string
}

export function ReferenceConnectionPreview({
  source,
  target,
  sourceTitle,
}: ReferenceConnectionPreviewProps) {
  const [path] = getBezierPath({
    sourceX: source.x,
    sourceY: source.y,
    sourcePosition: Position.Right,
    targetX: target.x,
    targetY: target.y,
    targetPosition: Position.Left,
  })

  return (
    <svg
      aria-label={`待完成连接：${sourceTitle}`}
      className="canvas-reference-connection-preview"
      role="img"
    >
      <path d={path} />
      <circle cx={target.x} cy={target.y} r={4.5} />
    </svg>
  )
}
