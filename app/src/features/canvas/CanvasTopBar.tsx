import {
  Bot,
  ChevronDown,
  Download,
  ListTree,
  Redo2,
  Share2,
  Undo2,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { StatusText } from '../../ui/StatusText'
import type { PersistenceStatus } from '../project/project-store'
import type { WorkspaceMode } from './CanvasWorkspace'

const persistenceCopy: Record<PersistenceStatus, string> = {
  dirty: '有未保存更改',
  saved: '已保存',
  saving: '保存中',
  error: '保存失败，本地更改已保留',
  offline: '已离线，本地更改已保留',
}

interface CanvasTopBarProps {
  projectId?: string
  projectTitle: string
  saveStatus: PersistenceStatus
  canUndo: boolean
  canRedo: boolean
  mode: WorkspaceMode
  agentOpen: boolean
  onUndo(): void
  onRedo(): void
  onOpenNodeList(trigger: HTMLButtonElement): void
  onModeChange(mode: WorkspaceMode): void
  onToggleAgent(): void
}

export function CanvasTopBar({
  projectId,
  projectTitle,
  saveStatus,
  canUndo,
  canRedo,
  mode,
  agentOpen,
  onUndo,
  onRedo,
  onOpenNodeList,
  onModeChange,
  onToggleAgent,
}: CanvasTopBarProps) {
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)

  return (
    <header className="canvas-top-bar">
      <div className="canvas-top-bar__identity">
        <span className="canvas-top-bar__mark" aria-hidden="true">W</span>
        <div>
          <h1>{projectTitle}</h1>
          <StatusText status={saveStatus}>{persistenceCopy[saveStatus]}</StatusText>
        </div>
        <div className="canvas-top-bar__menu-wrap">
          <button
            type="button"
            aria-expanded={canvasMenuOpen}
            onClick={() => setCanvasMenuOpen((open) => !open)}
          >
            画布 1 <ChevronDown aria-hidden="true" />
          </button>
          {canvasMenuOpen ? (
            <div className="canvas-top-bar__menu" role="menu" aria-label="画布菜单">
              <button type="button" role="menuitem">新建画布</button>
              <button type="button" role="menuitem" aria-current="page">画布 1</button>
              <p>本地演示暂不创建第二画布</p>
            </div>
          ) : null}
        </div>
      </div>
      <div className="canvas-top-bar__modes" aria-label="工作区模式">
        <button
          type="button"
          aria-pressed={mode === 'workflow'}
          onClick={() => onModeChange('workflow')}
        >
          工作流
        </button>
        <button
          type="button"
          aria-pressed={mode === 'storyboard'}
          onClick={() => onModeChange('storyboard')}
        >
          故事板
        </button>
      </div>
      <div className="canvas-top-bar__history">
        <button type="button" aria-label="撤销" disabled={!canUndo} onClick={onUndo}>
          <Undo2 aria-hidden="true" />
        </button>
        <button type="button" aria-label="重做" disabled={!canRedo} onClick={onRedo}>
          <Redo2 aria-hidden="true" />
        </button>
      </div>
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
        <div className="canvas-top-bar__menu-wrap">
          <button
            type="button"
            aria-label="发布与分享"
            aria-expanded={shareMenuOpen}
            onClick={() => setShareMenuOpen((open) => !open)}
          >
            <Share2 aria-hidden="true" />
          </button>
          {shareMenuOpen ? (
            <div className="canvas-top-bar__menu canvas-top-bar__menu--right" role="menu" aria-label="发布与分享菜单">
              <button type="button" role="menuitem">发布作品</button>
              <button type="button" role="menuitem">复制演示链接</button>
              <p>本地演示不执行外部发布</p>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Agent"
          aria-pressed={agentOpen}
          onClick={onToggleAgent}
        >
          <Bot aria-hidden="true" />
          Agent
        </button>
      </div>
    </header>
  )
}
