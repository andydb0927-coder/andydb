import {
  Bot,
  ChevronDown,
  Download,
  FileDown,
  FileUp,
  ListTree,
  PencilLine,
  Redo2,
  Send,
  Share2,
  Undo2,
  Workflow,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'

import { StatusText } from '../../ui/StatusText'
import { CanvasAccountMenu } from '../account/CanvasAccountMenu'
import { CloudAccountBadge } from '../account/CloudAccountBadge'
import type { PersistenceStatus } from '../project/project-store'
import type { GenerationJob, ProjectCanvas } from '../project/model'
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
  generationJobs?: GenerationJob[]
  canvases?: ProjectCanvas[]
  activeCanvasId?: string
  onUndo(): void
  onRedo(): void
  onRenameProject(title: string): void
  onCreateCanvas?(): void
  onRenameCanvas?(canvasId: string, title: string): void
  onSwitchCanvas?(canvasId: string): void
  onDeleteCanvas?(canvasId: string): void
  onOpenNodeList(trigger: HTMLButtonElement): void
  onOpenPipeline?(): void
  onModeChange(mode: WorkspaceMode): void
  onToggleAgent(): void
  onOpenPublish?(): void
  onCopyShareLink?(): void
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
  generationJobs,
  canvases,
  activeCanvasId,
  onUndo,
  onRedo,
  onRenameProject,
  onCreateCanvas,
  onRenameCanvas,
  onSwitchCanvas,
  onDeleteCanvas,
  onOpenNodeList,
  onOpenPipeline,
  onModeChange,
  onToggleAgent,
  onOpenPublish,
  onCopyShareLink,
  onOpenCanvasExport,
  onExportWorkflow,
  onImportWorkflow,
}: CanvasTopBarProps) {
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(projectTitle)
  const [editingCanvasId, setEditingCanvasId] = useState<string>()
  const [canvasTitleDraft, setCanvasTitleDraft] = useState('')
  const shareMenuRootRef = useRef<HTMLDivElement>(null)
  const shareMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const availableCanvases = canvases?.length
    ? canvases
    : [{ id: 'legacy-canvas', title: '画布 1' } as ProjectCanvas]
  const activeCanvas = availableCanvases.find(({ id }) => id === activeCanvasId) ?? availableCanvases[0]

  useEffect(() => setTitleDraft(projectTitle), [projectTitle])

  useEffect(() => {
    if (!shareMenuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (shareMenuRootRef.current?.contains(event.target as Node)) return
      setShareMenuOpen(false)
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setShareMenuOpen(false)
      shareMenuTriggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [shareMenuOpen])

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
            {activeCanvas.title} <ChevronDown aria-hidden="true" />
          </button>
          {canvasMenuOpen ? (
            <div className="canvas-top-bar__menu" role="menu" aria-label="画布菜单">
              <button
                type="button"
                role="menuitem"
                disabled={!onCreateCanvas}
                onClick={() => {
                  onCreateCanvas?.()
                  setCanvasMenuOpen(false)
                }}
              >
                新建画布
              </button>
              {availableCanvases.map((canvas) => (
                <div key={canvas.id} className="canvas-top-bar__canvas-row">
                  {editingCanvasId === canvas.id ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault()
                        const normalized = canvasTitleDraft.trim()
                        if (normalized) onRenameCanvas?.(canvas.id, normalized)
                        setEditingCanvasId(undefined)
                      }}
                    >
                      <label>
                        <span className="sr-only">画布名称</span>
                        <input
                          aria-label="画布名称"
                          value={canvasTitleDraft}
                          maxLength={40}
                          autoFocus
                          onChange={(event) => setCanvasTitleDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== 'Escape') return
                            event.preventDefault()
                            setEditingCanvasId(undefined)
                          }}
                        />
                      </label>
                    </form>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      aria-current={canvas.id === activeCanvas.id ? 'page' : undefined}
                      onClick={() => {
                        onSwitchCanvas?.(canvas.id)
                        setCanvasMenuOpen(false)
                      }}
                    >
                      {canvas.title}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`重命名${canvas.title}`}
                    disabled={!onRenameCanvas}
                    onClick={() => {
                      setEditingCanvasId(canvas.id)
                      setCanvasTitleDraft(canvas.title)
                    }}
                  >
                    <PencilLine aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`删除${canvas.title}`}
                    disabled={!onDeleteCanvas || availableCanvases.length < 2}
                    onClick={() => onDeleteCanvas?.(canvas.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <p>每个画布独立保存节点、连线与视口</p>
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
        {onOpenPipeline && <button type="button" aria-label="管线自动化" title="管线自动化" onClick={onOpenPipeline}><Workflow aria-hidden="true" /></button>}
        <button
          type="button"
          className="canvas-top-bar__secondary-action"
          onClick={(event) => onOpenNodeList(event.currentTarget)}
        >
          <ListTree aria-hidden="true" />
          节点列表
        </button>
        <CloudAccountBadge compact />
        <CanvasAccountMenu generationJobs={generationJobs} />
        <div ref={shareMenuRootRef} className="canvas-top-bar__menu-wrap canvas-top-bar__publish-wrap">
          <button
            ref={shareMenuTriggerRef}
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
              <button type="button" role="menuitem" disabled={!onOpenPublish} onClick={() => {
                closeShareMenu()
                onOpenPublish?.()
              }}>
                <Send aria-hidden="true" />在LibTV上发布
              </button>
              <button type="button" role="menuitem" disabled={!onCopyShareLink} onClick={() => {
                closeShareMenu()
                onCopyShareLink?.()
              }}>
                <Share2 aria-hidden="true" />复制分享链接
              </button>
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
              <p>发布与分享均为当前浏览器本地演示</p>
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
