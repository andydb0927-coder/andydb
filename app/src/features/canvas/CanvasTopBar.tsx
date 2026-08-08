import { Download, ListTree, Redo2, Undo2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { StatusText } from '../../ui/StatusText'
import type { PersistenceStatus } from '../project/project-store'

const persistenceCopy: Record<PersistenceStatus, string> = {
  saved: '已保存',
  saving: '保存中',
  failed: '保存失败，本地更改已保留',
  offline: '已离线，本地更改已保留',
}

interface CanvasTopBarProps {
  projectId?: string
  projectTitle: string
  saveStatus: PersistenceStatus
  canUndo: boolean
  canRedo: boolean
  onUndo(): void
  onRedo(): void
  onOpenNodeList(trigger: HTMLButtonElement): void
}

export function CanvasTopBar({
  projectId,
  projectTitle,
  saveStatus,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenNodeList,
}: CanvasTopBarProps) {
  return (
    <header className="canvas-top-bar">
      <h1>{projectTitle}</h1>
      <div className="canvas-top-bar__history">
        <button type="button" aria-label="撤销" disabled={!canUndo} onClick={onUndo}>
          <Undo2 aria-hidden="true" />
        </button>
        <button type="button" aria-label="重做" disabled={!canRedo} onClick={onRedo}>
          <Redo2 aria-hidden="true" />
        </button>
      </div>
      <StatusText status={saveStatus}>{persistenceCopy[saveStatus]}</StatusText>
      <div className="canvas-top-bar__actions">
        <button
          type="button"
          onClick={(event) => onOpenNodeList(event.currentTarget)}
        >
          <ListTree aria-hidden="true" />
          节点列表
        </button>
        {projectId ? (
          <Link to={`/project/${projectId}/preview`}>预览</Link>
        ) : (
          <button type="button" disabled>预览</button>
        )}
        <button type="button">
          <Download aria-hidden="true" />
          导出
        </button>
      </div>
    </header>
  )
}
