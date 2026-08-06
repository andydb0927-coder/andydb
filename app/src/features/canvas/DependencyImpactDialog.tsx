import { useEffect, useRef } from 'react'

import type { CanvasNode } from '../project/model'

interface DependencyImpactDialogProps {
  node: CanvasNode
  consumers: CanvasNode[]
  onCancel(): void
  onConfirm(): void
}

export function DependencyImpactDialog({
  node,
  consumers,
  onCancel,
  onConfirm,
}: DependencyImpactDialogProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <div className="canvas-dialog-backdrop">
      <section
        className="canvas-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dependency-impact-heading"
      >
        <h2 id="dependency-impact-heading" ref={headingRef} tabIndex={-1}>
          删除“{node.title}”？
        </h2>
        <p>以下下游节点会保留，但将标记为上游来源已变更：</p>
        <ul>
          {consumers.map((consumer) => (
            <li key={consumer.id}>{consumer.title}</li>
          ))}
        </ul>
        <div className="canvas-dialog__actions">
          <button type="button" onClick={onCancel}>取消</button>
          <button type="button" className="canvas-dialog__danger" onClick={onConfirm}>
            仍要删除
          </button>
        </div>
      </section>
    </div>
  )
}
