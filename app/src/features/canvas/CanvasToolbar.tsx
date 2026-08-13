import {
  CircleHelp,
  Cpu,
  Eye,
  EyeOff,
  FolderOpen,
  Group,
  History,
  Keyboard,
  MousePointer2,
  Unplug,
} from 'lucide-react'

import { FloatingPanel } from '../../ui/FloatingPanel'
import type { WorkspacePanel } from './CanvasWorkspace'

export type CanvasTool =
  | 'select'
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
  onGroupAction,
  onOpenPanel,
  onToggleConnections,
  onToolChange,
}: CanvasToolbarProps) {
  const connectDisabled = disabled || draftOpen
  const groupDisabled =
    disabled || draftOpen || groupAction === 'disabled'
  const groupLabel = groupAction === 'ungroup' ? '取消分组' : '分组'

  return (
    <FloatingPanel className="canvas-mode-bar" role="toolbar" aria-label="画布模式工具">
      <span className="canvas-mode-bar__hint">
        <MousePointer2 aria-hidden="true" />
        双击画布 自由生成节点
      </span>
      <button
        type="button"
        className={activeTool === 'connect' ? 'canvas-mode-bar__active' : undefined}
        aria-label="连线"
        aria-pressed={activeTool === 'connect'}
        disabled={connectDisabled}
        title={draftOpen ? '请先完成或取消当前节点' : '连线'}
        onClick={(event) => onToolChange('connect', event.currentTarget)}
      >
        <Unplug aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={groupLabel}
        aria-pressed={false}
        disabled={groupDisabled}
        title={
          draftOpen
            ? '请先完成或取消当前节点'
            : groupAction === 'disabled'
              ? '请先选择至少两个节点'
              : groupLabel
        }
        onClick={onGroupAction}
      >
        <Group aria-hidden="true" />
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
        {connectionsVisible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
      </button>
      {onOpenPanel ? (
        <div className="canvas-mode-bar__resources" aria-label="工作区资源">
          <button type="button" aria-label="打开模型设置" onClick={() => onOpenPanel('models')}><Cpu aria-hidden="true" /></button>
          <button type="button" aria-label="打开资产" onClick={() => onOpenPanel('assets')}><FolderOpen aria-hidden="true" /></button>
          <button type="button" aria-label="打开历史" onClick={() => onOpenPanel('history')}><History aria-hidden="true" /></button>
          <button type="button" aria-label="打开快捷键" onClick={() => onOpenPanel('shortcuts')}><Keyboard aria-hidden="true" /></button>
          <button type="button" aria-label="打开帮助" onClick={() => onOpenPanel('help')}><CircleHelp aria-hidden="true" /></button>
        </div>
      ) : null}
    </FloatingPanel>
  )
}
