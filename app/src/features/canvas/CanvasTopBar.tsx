import {
  Bot,
  ChevronDown,
  Download,
  FileDown,
  FileUp,
  ListTree,
  PencilLine,
  Redo2,
  Undo2,
} from 'lucide-react'
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'

import { StatusText } from '../../ui/StatusText'
import { CanvasAccountMenu } from '../account/CanvasAccountMenu'
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
  creditBalance?: number
  onUndo(): void
  onRedo(): void
  onRenameProject(title: string): void
  onOpenNodeList(trigger: HTMLButtonElement): void
  onModeChange(mode: WorkspaceMode): void
  onToggleAgent(): void
  onOpenCanvasExport?(): void
  onExportWorkflow?(): void
  onImportWorkflow?(): void
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
  onRenameProject,
  onOpenNodeList,
  onModeChange,
  onToggleAgent,
  onOpenCanvasExport,
  onExportWorkflow,
  onImportWorkflow,
}: CanvasTopBarProps) {
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(projectTitle)

  useEffect(() => setTitleDraft(projectTitle), [projectTitle])

  const submitTitle = (event?: FormEvent) => {
    event?.preventDefault()
    const normalized = titleDraft.trim()
    if (normalized) onRenameProject(normalized)
    else setTitleDraft(projectTitle)
    setEditingTitle(false)
  }

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    setTitleDraft(projectTitle)
    setEditingTitle(false)
  }

  const closeShareMenu = () => {
    setShareMenuOpen(false)
  }

  return (
    <header className="canvas-top-bar">
      <div className="canvas-top-bar__identity">
        <span className="canvas-top-bar__mark" aria-hidden="true">W</span>
        <div className="canvas-top-bar__project">
          {editingTitle ? (
            <form onSubmit={submitTitle}>
              <label>
                <span className="sr-only">项目名</span>
                <input
                  aria-label="项目名"
                  value={titleDraft}
                  maxLength={60}
                  autoFocus
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={() => submitTitle()}
                  onKeyDown={handleTitleKeyDown}
                />
              </label>
            </form>
          ) : (
            <div className="canvas-top-bar__title-row">
              <h1>{projectTitle}</h1>
              <button
                type="button"
                className="canvas-top-bar__title-button"
                aria-label="编辑项目名"
                onClick={() => setEditingTitle(true)}
              >
                <PencilLine aria-hidden="true" />
              </button>
            </div>
          )}
          <StatusText status={saveStatus}>{persistenceCopy[saveStatus]}</StatusText>
        </div>
        <div className="canvas-top-bar__menu-wrap canvas-top-bar__canvas-switcher">
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
          className="canvas-top-bar__secondary-action"
          onClick={(event) => onOpenNodeList(event.currentTarget)}
        >
          <ListTree aria-hidden="true" />
          节点列表
        </button>
        <CanvasAccountMenu />
        <div className="canvas-top-bar__menu-wrap canvas-top-bar__publish-wrap">
          <button
            type="button"
            aria-label="发布与分享"
            aria-expanded={shareMenuOpen}
            onClick={() => setShareMenuOpen((open) => !open)}
          >
            <Download aria-hidden="true" />
            发布与分享 <ChevronDown aria-hidden="true" />
          </button>
          {shareMenuOpen ? (
            <div className="canvas-top-bar__menu canvas-top-bar__menu--right" role="menu" aria-label="发布与分享菜单">
              {projectId ? (
                <Link role="menuitem" to={`/project/${projectId}/preview`} onClick={() => closeShareMenu()}>预览</Link>
              ) : (
                <button type="button" role="menuitem" disabled>预览</button>
              )}
              <button type="button" role="menuitem" disabled={!onOpenCanvasExport} onClick={() => {
                closeShareMenu()
                onOpenCanvasExport?.()
              }}>
                <Download aria-hidden="true" />导出画布
              </button>
              <button type="button" role="menuitem" disabled={!onExportWorkflow} onClick={() => {
                closeShareMenu()
                onExportWorkflow?.()
              }}>
                <FileDown aria-hidden="true" />导出工作流 JSON
              </button>
              <button type="button" role="menuitem" disabled={!onImportWorkflow} onClick={() => {
                closeShareMenu()
                onImportWorkflow?.()
              }}>
                <FileUp aria-hidden="true" />导入工作流 JSON
              </button>
              <p>所有操作仅作用于当前本地项目</p>
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
          打开 Agent
        </button>
      </div>
    </header>
  )
}
