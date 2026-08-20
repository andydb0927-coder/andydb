import {
  AudioLines,
  ChevronRight,
  Clapperboard,
  Film,
  FileClock,
  FileText,
  Image,
  Library,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'

import { FloatingPanel } from '../../ui/FloatingPanel'
import type { QuickNodeType } from './CanvasNodeTypePicker'

export type ContextQuickNodeType = Extract<
  QuickNodeType,
  | 'text'
  | 'image'
  | 'video'
  | 'smart-edit'
  | 'director'
  | 'frame-analysis'
  | 'audio'
  | 'script'
  | 'asset-library'
>

const contextNodeTypes: Array<{
  type: ContextQuickNodeType
  label: string
  badge?: string
  icon: typeof FileText
}> = [
  { type: 'text', label: '文本', icon: Type },
  { type: 'image', label: '图片', icon: Image },
  { type: 'video', label: '视频', icon: Film },
  { type: 'smart-edit', label: '智能剪辑', badge: 'Beta', icon: Clapperboard },
  { type: 'director', label: '导演台', badge: 'NEW', icon: Sparkles },
  { type: 'frame-analysis', label: '逐帧拉片', badge: 'SD2.5', icon: FileClock },
  { type: 'audio', label: '音频', icon: AudioLines },
  { type: 'script', label: '脚本', icon: FileText },
  { type: 'asset-library', label: '素材库', icon: Library },
]

type ContextSubmenu = 'nodes' | 'resources'

export interface CanvasContextMenuProps {
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
  targetNodeTitle?: string
  canUseGenerationHistory: boolean
  onUpload(): void
  onOpenGenerationHistory(): void
  onAddNode(type: ContextQuickNodeType): void
  onDeleteNode?(): void
  onClose(): void
}

function clampMenuPosition(
  anchor: CanvasContextMenuProps['anchor'],
  bounds: CanvasContextMenuProps['bounds'],
) {
  const gutter = 8
  const width = Math.min(220, Math.max(0, bounds.width - gutter * 2))
  const estimatedHeight = 372
  return {
    left: Math.min(
      Math.max(gutter, anchor.x),
      Math.max(gutter, bounds.width - width - gutter),
    ),
    top: Math.min(
      Math.max(gutter, anchor.y),
      Math.max(gutter, bounds.height - estimatedHeight - gutter),
    ),
    width,
  }
}

export function CanvasContextMenu({
  anchor,
  bounds,
  targetNodeTitle,
  canUseGenerationHistory,
  onUpload,
  onOpenGenerationHistory,
  onAddNode,
  onDeleteNode,
  onClose,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)
  const [submenu, setSubmenu] = useState<ContextSubmenu>()
  const position = clampMenuPosition(anchor, bounds)
  const style: CSSProperties = position
  const submenuOpensLeft = position.left + position.width + 216 > bounds.width - 8

  useEffect(() => {
    firstItemRef.current?.focus()
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key === 'ArrowLeft' && submenu) {
      event.preventDefault()
      setSubmenu(undefined)
      firstItemRef.current?.focus()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    ).filter((item) => item.offsetParent !== null)
    if (!items.length) return
    event.preventDefault()
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    const delta = event.key === 'ArrowDown' ? 1 : -1
    items[(currentIndex + delta + items.length) % items.length]?.focus()
  }

  const submenuClassName = `canvas-context-menu__submenu${
    submenuOpensLeft ? ' canvas-context-menu__submenu--left' : ''
  }`

  return (
    <FloatingPanel
      ref={menuRef}
      className="canvas-context-menu nodrag nopan"
      role="menu"
      aria-label="画布快捷菜单"
      style={style}
      onKeyDown={handleKeyDown}
    >
      <div className="canvas-context-menu__heading">
        <span>{targetNodeTitle ? 'NODE MENU' : 'CANVAS MENU'}</span>
        <strong>{targetNodeTitle ?? '画布快捷操作'}</strong>
      </div>

      <div
        className="canvas-context-menu__branch"
        onPointerEnter={() => setSubmenu('nodes')}
      >
        <button
          ref={firstItemRef}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={submenu === 'nodes'}
          aria-controls="canvas-add-node-submenu"
          onClick={() => setSubmenu('nodes')}
        >
          <Plus aria-hidden="true" />
          添加节点
          <ChevronRight aria-hidden="true" />
        </button>
        {submenu === 'nodes' ? (
          <div
            id="canvas-add-node-submenu"
            className={submenuClassName}
            role="menu"
            aria-label="添加节点子菜单"
          >
            {contextNodeTypes.map(({ type, label, badge, icon: Icon }) => (
              <button
                key={type}
                type="button"
                role="menuitem"
                aria-label={badge ? `${label} ${badge}` : label}
                onClick={() => onAddNode(type)}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
                {badge ? <em>{badge}</em> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        className="canvas-context-menu__branch"
        onPointerEnter={() => setSubmenu('resources')}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={submenu === 'resources'}
          aria-controls="canvas-add-resource-submenu"
          onClick={() => setSubmenu('resources')}
        >
          <Library aria-hidden="true" />
          添加资源
          <ChevronRight aria-hidden="true" />
        </button>
        {submenu === 'resources' ? (
          <div
            id="canvas-add-resource-submenu"
            className={submenuClassName}
            role="menu"
            aria-label="添加资源子菜单"
          >
            <button type="button" role="menuitem" onClick={onUpload}>
              <Upload aria-hidden="true" />
              <span>上传</span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!canUseGenerationHistory}
              aria-describedby={
                canUseGenerationHistory ? undefined : 'generation-history-disabled-reason'
              }
              onClick={onOpenGenerationHistory}
            >
              <FileClock aria-hidden="true" />
              <span>从生成历史选择</span>
            </button>
            {!canUseGenerationHistory ? (
              <span id="generation-history-disabled-reason" className="canvas-context-menu__reason">
                暂无可插入的已完成结果
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {targetNodeTitle && onDeleteNode ? (
        <button
          type="button"
          role="menuitem"
          className="canvas-context-menu__danger"
          onClick={onDeleteNode}
        >
          <Trash2 aria-hidden="true" />
          删除节点
        </button>
      ) : null}
    </FloatingPanel>
  )
}
