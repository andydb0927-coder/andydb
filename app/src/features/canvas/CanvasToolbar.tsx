import {
  CircleHelp,
  FolderOpen,
  Hand,
  History,
  Keyboard,
  Library,
  Plus,
  Unplug,
  UsersRound,
  Wrench,
} from 'lucide-react'

import { FloatingPanel } from '../../ui/FloatingPanel'
import type { WorkspacePanel } from './CanvasWorkspace'

export type CanvasTool =
  | 'select'
  | 'hand'
  | 'connect'
  | 'script'
  | 'character-card'
  | 'worldview'
  | 'text'
  | 'image'
  | 'storyboard'
  | 'video'

export interface CanvasToolbarProps {
  activeTool: CanvasTool
  connectionsVisible: boolean
  disabled?: boolean
  draftOpen: boolean
  groupAction?: 'disabled' | 'group' | 'ungroup'
  onAddNode?(trigger: HTMLButtonElement): void
  onGroupAction?(): void
  onOpenPanel?(panel: WorkspacePanel): void
  onToggleConnections(): void
  onToolChange(tool: CanvasTool, trigger: HTMLButtonElement): void
}

export function CanvasToolbar({
  activeTool,
  connectionsVisible,
  disabled = false,
  draftOpen,
  groupAction = 'disabled',
  onAddNode,
  onGroupAction,
  onOpenPanel,
  onToggleConnections,
  onToolChange,
}: CanvasToolbarProps) {
  const interactionDisabled = disabled || draftOpen
  const groupDisabled = interactionDisabled || groupAction === 'disabled'
  const groupLabel = groupAction === 'ungroup' ? '取消分组' : '分组'

  return (
    <FloatingPanel className="canvas-mode-bar" role="toolbar" aria-label="画布模式工具">
      <div className="canvas-mode-bar__primary" role="group" aria-label="Liblib 画布工具坞">
        <button
          type="button"
          aria-label="添加节点"
          disabled={interactionDisabled}
          title={draftOpen ? '请先完成或取消当前节点' : '添加节点'}
          onClick={(event) => onAddNode?.(event.currentTarget)}
        >
          <Plus aria-hidden="true" />
          <span>添加节点</span>
        </button>
        <button
          type="button"
          className={
            activeTool === 'select' || activeTool === 'hand'
              ? 'canvas-mode-bar__active'
              : undefined
          }
          aria-label="移动"
          aria-pressed={activeTool === 'select' || activeTool === 'hand'}
          title={activeTool === 'hand' ? '抓手工具（H）' : '移动工具（V）'}
          disabled={disabled}
          onClick={(event) => onToolChange('select', event.currentTarget)}
        >
          <Hand aria-hidden="true" />
          <span>移动</span>
        </button>
        <button
          type="button"
          className={activeTool === 'connect' ? 'canvas-mode-bar__active' : undefined}
          aria-label="连线"
          aria-pressed={activeTool === 'connect'}
          disabled={interactionDisabled}
          title={draftOpen ? '请先完成或取消当前节点' : '连线'}
          onClick={(event) => onToolChange('connect', event.currentTarget)}
        >
          <Unplug aria-hidden="true" />
          <span>连线</span>
        </button>
        <button type="button" aria-label="打开工具箱" onClick={() => onOpenPanel?.('toolbox')}>
          <Wrench aria-hidden="true" />
          <span>工具箱</span>
        </button>
        <button type="button" aria-label="资产管理" onClick={() => onOpenPanel?.('assets')}>
          <FolderOpen aria-hidden="true" />
          <span>资产管理</span>
        </button>
        <button type="button" aria-label="素材库" onClick={() => onOpenPanel?.('library')}>
          <Library aria-hidden="true" />
          <span>素材库</span>
        </button>
        <button type="button" aria-label="角色库" onClick={() => onOpenPanel?.('characters')}>
          <UsersRound aria-hidden="true" />
          <span>角色库</span>
        </button>
        <button type="button" aria-label="历史记录" onClick={() => onOpenPanel?.('history')}>
          <History aria-hidden="true" />
          <span>历史</span>
        </button>
        <button type="button" aria-label="快捷键" onClick={() => onOpenPanel?.('shortcuts')}>
          <Keyboard aria-hidden="true" />
          <span>快捷键</span>
        </button>
        <button type="button" aria-label="教程" onClick={() => onOpenPanel?.('help')}>
          <CircleHelp aria-hidden="true" />
          <span>教程</span>
        </button>
      </div>
      <div className="canvas-mode-bar__secondary" aria-label="画布辅助操作">
        <button
          type="button"
          aria-label={groupLabel}
          aria-pressed={false}
          disabled={groupDisabled}
          title={groupDisabled ? '请先选择至少两个节点' : groupLabel}
          onClick={onGroupAction}
        >
          {groupLabel}
        </button>
        <button
          type="button"
          className="canvas-mode-bar__visibility-toggle"
          aria-label={connectionsVisible ? '隐藏连线' : '显示连线'}
          aria-pressed={connectionsVisible}
          disabled={disabled}
          title={connectionsVisible ? '隐藏连线' : '显示连线'}
          onClick={onToggleConnections}
        >
          {connectionsVisible ? '隐藏连线' : '显示连线'}
        </button>
      </div>
    </FloatingPanel>
  )
}
