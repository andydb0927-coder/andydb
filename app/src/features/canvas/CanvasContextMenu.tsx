import {
  ChevronRight,
  ClipboardPaste,
  Contact,
  Film,
  FileText,
  Globe2,
  Image,
  Plus,
  Redo2,
  Save,
  Type,
  Undo2,
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
import type { CreativeCardKind } from '../project/model'
import type { CreatableNodeKind } from './node-draft'

export type ContextCreatableKind = CreatableNodeKind | CreativeCardKind

const nodeTypes: Array<{
  kind: ContextCreatableKind
  label: string
  icon: typeof FileText
}> = [
  { kind: 'script', label: '剧本卡', icon: FileText },
  { kind: 'character-card', label: '角色卡', icon: Contact },
  { kind: 'worldview', label: '世界观卡', icon: Globe2 },
  { kind: 'text', label: '文本', icon: Type },
  { kind: 'image', label: '图片', icon: Image },
  { kind: 'storyboard', label: '分镜', icon: FileText },
  { kind: 'video', label: '视频', icon: Film },
]

export interface CanvasContextMenuProps {
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
  targetNodeTitle?: string
  canSaveAsset: boolean
  canUndo: boolean
  canRedo: boolean
  clipboardText: string
  onUpload(): void
  onSaveAsset(): void
  onAddNode(kind: ContextCreatableKind): void
  onUndo(): void
  onRedo(): void
  onPaste(text: string): void
  onClose(): void
}

function clampMenuPosition(
  anchor: CanvasContextMenuProps['anchor'],
  bounds: CanvasContextMenuProps['bounds'],
) {
  const gutter = 8
  const width = Math.min(244, Math.max(0, bounds.width - gutter * 2))
  const estimatedHeight = 382
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
  canSaveAsset,
  canUndo,
  canRedo,
  clipboardText,
  onUpload,
  onSaveAsset,
  onAddNode,
  onUndo,
  onRedo,
  onPaste,
  onClose,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const position = clampMenuPosition(anchor, bounds)
  const style: CSSProperties = position

  useEffect(() => {
    firstItemRef.current?.focus()
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
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
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    )
    if (!items.length) return
    event.preventDefault()
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    const delta = event.key === 'ArrowDown' ? 1 : -1
    items[(currentIndex + delta + items.length) % items.length]?.focus()
  }

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
      <button ref={firstItemRef} type="button" role="menuitem" onClick={onUpload}>
        <Upload aria-hidden="true" />
        上传
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!canSaveAsset}
        onClick={onSaveAsset}
      >
        <Save aria-hidden="true" />
        保存到我的资产
      </button>
      <button
        type="button"
        role="menuitem"
        aria-expanded={addMenuOpen}
        onClick={() => setAddMenuOpen((open) => !open)}
      >
        <Plus aria-hidden="true" />
        添加节点
        <ChevronRight aria-hidden="true" className={addMenuOpen ? 'canvas-context-menu__chevron--open' : undefined} />
      </button>
      {addMenuOpen ? (
        <div className="canvas-context-menu__node-types" role="group" aria-label="节点类型">
          {nodeTypes.map(({ kind, label, icon: Icon }) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              onClick={() => onAddNode(kind)}
            >
              <Icon aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="canvas-context-menu__separator" role="separator" />
      <button type="button" role="menuitem" aria-label="撤销" disabled={!canUndo} onClick={onUndo}>
        <Undo2 aria-hidden="true" />
        撤销
        <kbd>⌘ Z</kbd>
      </button>
      <button type="button" role="menuitem" aria-label="重做" disabled={!canRedo} onClick={onRedo}>
        <Redo2 aria-hidden="true" />
        重做
        <kbd>⌘ ⇧ Z</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        aria-label="粘贴"
        disabled={!clipboardText.trim()}
        onClick={() => onPaste(clipboardText)}
      >
        <ClipboardPaste aria-hidden="true" />
        粘贴
        <kbd>⌘ V</kbd>
      </button>
    </FloatingPanel>
  )
}
