import {
  AudioLines,
  ClipboardCopy,
  ClipboardPaste,
  ChevronRight,
  Clapperboard,
  Copy,
  CopyPlus,
  Film,
  FileClock,
  FileText,
  Image,
  Library,
  Play,
  Plus,
  Redo2,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
  UserRoundPlus,
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
  { type: 'frame-analysis', label: '逐帧拉片', badge: '本地分析', icon: FileClock },
  { type: 'audio', label: '音频', icon: AudioLines },
  { type: 'script', label: '脚本', icon: FileText },
  { type: 'asset-library', label: '素材库', icon: Library },
]

type ContextSubmenu = 'nodes'

export interface CanvasContextMenuProps {
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
  targetNodeTitle?: string
  canUndo: boolean
  canRedo: boolean
  canPaste: boolean
  canSaveToAssets: boolean
  canCreateSubject: boolean
  canExecuteGroup: boolean
  onUpload(): void
  onAddNode(type: ContextQuickNodeType): void
  onUndo(): void
  onRedo(): void
  onPaste(): void
  onSaveToAssets(): void
  onExecuteGroup(): void
  onExecutePipeline?(): void
  onComplianceCheck?(): void
  onCreateSubject?(): void
  onCopyNode?(): void
  onDuplicateNode?(): void
  onCopyToClipboard?(): void
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
  canUndo,
  canRedo,
  canPaste,
  canSaveToAssets,
  canCreateSubject,
  canExecuteGroup,
  onUpload,
  onAddNode,
  onUndo,
  onRedo,
  onPaste,
  onSaveToAssets,
  onExecuteGroup,
  onExecutePipeline,
  onComplianceCheck,
  onCreateSubject,
  onCopyNode,
  onDuplicateNode,
  onCopyToClipboard,
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

      {targetNodeTitle ? (
        <>
          <button ref={firstItemRef} type="button" role="menuitem" onClick={onComplianceCheck}>
            <ShieldCheck aria-hidden="true" />合规校验
          </button>
          {onExecutePipeline && <button type="button" role="menuitem" onClick={onExecutePipeline}><Play aria-hidden="true" />执行下游管线</button>}
          <button type="button" role="menuitem" disabled={!canSaveToAssets} onClick={onSaveToAssets}>
            <Save aria-hidden="true" />保存到我的资产
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canCreateSubject}
            title={canCreateSubject ? undefined : '需要图片节点结果或上传图'}
            onClick={onCreateSubject}
          >
            <UserRoundPlus aria-hidden="true" />创建主体
          </button>
          <button type="button" role="menuitem" onClick={onCopyNode}>
            <Copy aria-hidden="true" />复制
          </button>
          <button type="button" role="menuitem" onClick={onDuplicateNode}>
            <CopyPlus aria-hidden="true" />创建副本
          </button>
          <button type="button" role="menuitem" disabled={!canPaste} onClick={onPaste}>
            <ClipboardPaste aria-hidden="true" />粘贴
          </button>
          <button
            type="button"
            role="menuitem"
            className="canvas-context-menu__danger"
            aria-label="删除节点"
            onClick={onDeleteNode}
          >
            <Trash2 aria-hidden="true" />删除 <kbd>⌘⌫</kbd>
          </button>
          <button type="button" role="menuitem" onClick={onCopyToClipboard}>
            <ClipboardCopy aria-hidden="true" />复制到剪贴板
          </button>
        </>
      ) : (
        <>
          <button ref={firstItemRef} type="button" role="menuitem" onClick={onUpload}>
            <Upload aria-hidden="true" />上传
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canSaveToAssets}
            onClick={onSaveToAssets}
          >
            <Save aria-hidden="true" />保存到我的资产
          </button>

          <div
            className="canvas-context-menu__branch"
            onPointerEnter={() => setSubmenu('nodes')}
          >
        <button
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
          <button
            type="button"
            role="menuitem"
            disabled={!canExecuteGroup}
            onClick={onExecuteGroup}
          >
            <Play aria-hidden="true" />整组执行
          </button>
          <div className="canvas-context-menu__separator" role="separator" />
          <button type="button" role="menuitem" aria-label="撤销" disabled={!canUndo} onClick={onUndo}>
            <Undo2 aria-hidden="true" />撤销 <kbd>⌘Z</kbd>
          </button>
          <button type="button" role="menuitem" aria-label="重做" disabled={!canRedo} onClick={onRedo}>
            <Redo2 aria-hidden="true" />重做 <kbd>⇧⌘Z</kbd>
          </button>
          <button type="button" role="menuitem" aria-label="粘贴" disabled={!canPaste} onClick={onPaste}>
            <ClipboardPaste aria-hidden="true" />粘贴 <kbd>⌘V</kbd>
          </button>
        </>
      )}
    </FloatingPanel>
  )
}
