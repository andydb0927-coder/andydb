import {
  BookOpenText,
  Clapperboard,
  Contact,
  Eye,
  EyeOff,
  Film,
  Group,
  Globe2,
  Image,
  MousePointer2,
  Type,
  Unplug,
} from 'lucide-react'

import { FloatingPanel } from '../../ui/FloatingPanel'

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
  onToggleConnections(): void
  onToolChange(tool: CanvasTool, trigger: HTMLButtonElement): void
}

export function CanvasToolbar({
  activeTool,
  connectionsVisible,
  disabled = false,
  draftOpen,
  onToggleConnections,
  onToolChange,
}: CanvasToolbarProps) {
  return (
    <FloatingPanel className="canvas-toolbar" role="toolbar" aria-label="创作工具">
      {tools.map(({ id, label, icon: Icon }) => {
        const unavailable = id === 'group'
        const toolDisabled =
          disabled || unavailable || (draftOpen && id !== 'select')
        const title = unavailable
          ? `${label}将在后续版本提供`
          : draftOpen && id !== 'select'
            ? '请先完成或取消当前节点'
            : label

        return (
          <button
            key={id}
            type="button"
            className={activeTool === id ? 'canvas-toolbar__active' : undefined}
            aria-label={label}
            aria-pressed={activeTool === id}
            disabled={toolDisabled}
            title={title}
            onClick={(event) => onToolChange(id, event.currentTarget)}
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
    </FloatingPanel>
  )
}
