import { Group, Ungroup } from 'lucide-react'

import type { CanvasGroup } from '../project/model'
import type { CanvasGroupBounds } from './canvas-group'

interface CanvasGroupOverlayProps {
  group: CanvasGroup
  bounds: CanvasGroupBounds
  onSelect(): void
  onUngroup(): void
}

export function CanvasGroupOverlay({
  group,
  bounds,
  onSelect,
  onUngroup,
}: CanvasGroupOverlayProps) {
  return (
    <section
      aria-label={`节点分组：${group.title}`}
      className="canvas-group-overlay"
      role="group"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }}
    >
      <div className="canvas-group-overlay__controls nodrag nopan">
        <button
          aria-label={`选择分组：${group.title}`}
          className="focus-visible"
          type="button"
          onClick={onSelect}
        >
          <Group aria-hidden="true" />
          {group.title}
        </button>
        <button
          aria-label={`取消分组：${group.title}`}
          className="focus-visible"
          title="取消分组"
          type="button"
          onClick={onUngroup}
        >
          <Ungroup aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
