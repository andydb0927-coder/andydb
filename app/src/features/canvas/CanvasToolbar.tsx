import {
  Clapperboard,
  Film,
  Group,
  Image,
  MousePointer2,
  Type,
  Unplug,
} from 'lucide-react'

import { FloatingPanel } from '../../ui/FloatingPanel'

const tools = [
  { label: '选择', icon: MousePointer2 },
  { label: '文本', icon: Type },
  { label: '图片', icon: Image },
  { label: '分镜', icon: Clapperboard },
  { label: '视频', icon: Film },
  { label: '连线', icon: Unplug },
  { label: '分组', icon: Group },
] as const

export function CanvasToolbar() {
  return (
    <FloatingPanel className="canvas-toolbar" role="toolbar" aria-label="创作工具">
      {tools.map(({ label, icon: Icon }, index) => (
        <button
          key={label}
          type="button"
          className={index === 0 ? 'canvas-toolbar__active' : undefined}
          aria-label={label}
          aria-pressed={index === 0}
          title={label}
        >
          <Icon aria-hidden="true" />
        </button>
      ))}
    </FloatingPanel>
  )
}
