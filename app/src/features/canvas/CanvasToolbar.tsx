import {
  BookOpenText,
  CircleHelp,
  Clapperboard,
  Contact,
  Eye,
  EyeOff,
  Film,
  FolderOpen,
  Group,
  Globe2,
  History,
  Image,
  Keyboard,
  MousePointer2,
  Plus,
  Type,
  Unplug,
} from 'lucide-react'

import { FloatingPanel } from '../../ui/FloatingPanel'
import type { WorkspacePanel } from './CanvasWorkspace'

const tools = [
  { id: 'select', label: '选择', icon: MousePointer2 },
  { id: 'script', label: '剧本卡', icon: BookOpenText },
  { id: 'character-card', label: '角色卡', icon: Contact },
  { id: 'worldview', label: '世界观卡', icon: Globe2 },
  { id: 'text', label: '文本', icon: Type },
  { id: 'image', label: '图片', icon: Image },
  { id: 'storyboard', label: '分镜', icon: Clapperboard },
  { id: 'video', label: '视频', icon: Film },
  { id: 'connect', label: '连线', icon: Unplug },
  { id: 'group', label: '分组', icon: Group },
] as const

export type CanvasTool = (typeof tools)[number]['id']

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
  return (
    <FloatingPanel className="canvas-toolbar" role="toolbar" aria-label="创作工具">
      <span className="canvas-toolbar__section-label"><Plus aria-hidden="true" />添加节点</span>
      {tools.map(({ id, label, icon: Icon }) => {
        const isGroup = id === 'group'
        const toolDisabled =
          disabled ||
          (isGroup && groupAction === 'disabled') ||
          (draftOpen && id !== 'select')
        const actionLabel =
          isGroup && groupAction === 'ungroup' ? '取消分组' : label
        const title = draftOpen && id !== 'select'
            ? '请先完成或取消当前节点'
            : isGroup && groupAction === 'disabled'
              ? '请先选择至少两个节点'
              : actionLabel

        return (
          <button
            key={id}
            type="button"
            className={activeTool === id ? 'canvas-toolbar__active' : undefined}
            aria-label={actionLabel}
            aria-pressed={isGroup ? false : activeTool === id}
            disabled={toolDisabled}
            title={title}
            onClick={(event) => {
              if (isGroup) onGroupAction?.()
              else onToolChange(id, event.currentTarget)
            }}
          >
            <Icon aria-hidden="true" />
          </button>
        )
      })}
      <button
        type="button"
        className="canvas-toolbar__visibility-toggle"
        aria-label={connectionsVisible ? '隐藏连线' : '显示连线'}
        aria-pressed={connectionsVisible}
        disabled={disabled}
        title={connectionsVisible ? '隐藏连线' : '显示连线'}
        onClick={onToggleConnections}
      >
        {connectionsVisible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
      </button>
      {onOpenPanel ? (
        <div className="canvas-toolbar__resources" aria-label="工作区资源">
          <button type="button" aria-label="打开资产" onClick={() => onOpenPanel('assets')}><FolderOpen aria-hidden="true" /></button>
          <button type="button" aria-label="打开历史" onClick={() => onOpenPanel('history')}><History aria-hidden="true" /></button>
          <button type="button" aria-label="打开快捷键" onClick={() => onOpenPanel('shortcuts')}><Keyboard aria-hidden="true" /></button>
          <button type="button" aria-label="打开帮助" onClick={() => onOpenPanel('help')}><CircleHelp aria-hidden="true" /></button>
        </div>
      ) : null}
    </FloatingPanel>
  )
}
