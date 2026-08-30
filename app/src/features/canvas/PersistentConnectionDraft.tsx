import { Link2, X } from 'lucide-react'

import type { CanvasConnectionDraft } from '../project/model'

interface PersistentConnectionDraftProps {
  draft: CanvasConnectionDraft
  sourceTitle: string
  sourcePosition: { x: number; y: number }
  active: boolean
  onActivate(draftId: string, trigger: HTMLButtonElement): void
  onDelete(draftId: string): void
}

function connectionPath(
  source: { x: number; y: number },
  target: { x: number; y: number },
) {
  const distance = Math.abs(target.x - source.x)
  const curve = Math.max(72, distance * 0.42)
  const sourceControlX = source.x + (target.x >= source.x ? curve : -curve)
  const targetControlX = target.x - (target.x >= source.x ? curve : -curve)
  return `M ${source.x} ${source.y} C ${sourceControlX} ${source.y}, ${targetControlX} ${target.y}, ${target.x} ${target.y}`
}

export function PersistentConnectionDraft({
  draft,
  sourceTitle,
  sourcePosition,
  active,
  onActivate,
  onDelete,
}: PersistentConnectionDraftProps) {
  return (
    <div
      className={`persistent-connection-draft${active ? ' persistent-connection-draft--active' : ''}`}
      data-draft-id={draft.id}
    >
      <svg
        className="persistent-connection-draft__line"
        aria-hidden="true"
      >
        <path d={connectionPath(sourcePosition, draft.position)} />
      </svg>
      <div
        className="persistent-connection-draft__actions nodrag nopan"
        style={{ left: draft.position.x, top: draft.position.y }}
      >
        <button
          type="button"
          className="persistent-connection-draft__endpoint"
          aria-label={`继续连接：${sourceTitle}`}
          aria-pressed={active}
          onClick={(event) => onActivate(draft.id, event.currentTarget)}
        >
          <Link2 aria-hidden="true" />
        </button>
        <button
          type="button"
          className="persistent-connection-draft__delete"
          aria-label={`删除悬空连接：${sourceTitle}`}
          onClick={() => onDelete(draft.id)}
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
