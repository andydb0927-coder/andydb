import {
  AlignLeft,
  AudioLines,
  BookOpenText,
  ChevronRight,
  Clapperboard,
  ContactRound,
  FileClock,
  FileText,
  Film,
  Gem,
  Image,
  Images,
  Library,
  PanelsTopLeft,
  Sparkles,
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

export type QuickNodeType =
  | 'script-generator'
  | 'character-turnaround'
  | 'reference-video'
  | 'audio-video'
  | 'smart-edit'
  | 'director'
  | 'frame-analysis'
  | 'audio'
  | 'script'
  | 'asset-library'
  | 'worldview'
  | 'text'
  | 'image'
  | 'storyboard'
  | 'video'

type PickerNodeOption = {
  type: QuickNodeType
  label: string
  badge?: string
  premium?: boolean
  icon: typeof BookOpenText
}

const freeNodeTypes: PickerNodeOption[] = [
  { type: 'text', label: '文本', icon: AlignLeft },
  { type: 'image', label: '图片', icon: Image },
  { type: 'video', label: '视频', icon: Film },
  { type: 'smart-edit', label: '智能剪辑', badge: 'Beta', icon: Clapperboard },
  { type: 'director', label: '导演台', badge: 'NEW', icon: Sparkles },
  {
    type: 'frame-analysis',
    label: '逐帧拉片',
    badge: 'SD2.5',
    premium: true,
    icon: FileClock,
  },
  { type: 'audio', label: '音频', icon: AudioLines },
]

const scriptNodeTypes: PickerNodeOption[] = [
  { type: 'script-generator', label: '故事脚本生成', icon: BookOpenText },
  { type: 'script', label: '脚本节点', icon: FileText },
  { type: 'worldview', label: '世界观卡', icon: PanelsTopLeft },
]

const materialNodeTypes: PickerNodeOption[] = [
  { type: 'character-turnaround', label: '角色三视图', icon: ContactRound },
  {
    type: 'reference-video',
    label: '全能参考生视频',
    badge: 'SD2.5',
    icon: Images,
  },
  {
    type: 'audio-video',
    label: '音频生视频',
    badge: 'SD2.5',
    icon: AudioLines,
  },
  { type: 'asset-library', label: '素材库节点', icon: Library },
]

const compactNodeTypes: Array<{
  type: QuickNodeType
  label: string
  badge?: string
  icon: typeof BookOpenText
}> = [
  { type: 'text', label: '文本', icon: Type },
  { type: 'image', label: '图片', icon: Image },
  { type: 'video', label: '视频', icon: Film },
  { type: 'smart-edit', label: '智能剪辑', badge: 'Beta', icon: Clapperboard },
  { type: 'director', label: '导演台', badge: 'NEW', icon: Sparkles },
  { type: 'frame-analysis', label: '逐帧拉片', badge: 'SD2.5', icon: FileClock },
  { type: 'audio', label: '音频', icon: AudioLines },
  { type: 'script', label: '脚本', icon: BookOpenText },
  { type: 'asset-library', label: '素材库', icon: Library },
]

export type NodeTypePickerMode = 'free' | 'add' | 'reference'

interface CanvasNodeTypePickerProps {
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
  mode?: NodeTypePickerMode
  sourceTitle?: string
  canUseGenerationHistory?: boolean
  onSelect(type: QuickNodeType): void
  onUpload?(): void
  onOpenGenerationHistory?(): void
  onClose(): void
}

function clampFreeMenuPosition(
  anchor: CanvasNodeTypePickerProps['anchor'],
  bounds: CanvasNodeTypePickerProps['bounds'],
) {
  const gutter = 8
  const width = Math.min(264, Math.max(0, bounds.width - gutter * 2))
  const estimatedHeight = Math.min(620, Math.max(0, bounds.height - gutter * 2))
  return {
    left: Math.min(
      Math.max(gutter, anchor.x - width / 2),
      Math.max(gutter, bounds.width - width - gutter),
    ),
    top: Math.min(
      Math.max(gutter, anchor.y - 64),
      Math.max(gutter, bounds.height - estimatedHeight - gutter),
    ),
    width,
  }
}

function clampCompactPosition(
  anchor: CanvasNodeTypePickerProps['anchor'],
  bounds: CanvasNodeTypePickerProps['bounds'],
) {
  const gutter = 8
  const width = Math.min(224, Math.max(0, bounds.width - gutter * 2))
  const estimatedHeight = Math.min(548, Math.max(0, bounds.height - gutter * 2))
  return {
    left: Math.min(
      Math.max(gutter, anchor.x - 18),
      Math.max(gutter, bounds.width - width - gutter),
    ),
    top: Math.min(
      Math.max(gutter, anchor.y - estimatedHeight + 44),
      Math.max(gutter, bounds.height - estimatedHeight - gutter),
    ),
    width,
  }
}

export function CanvasNodeTypePicker({
  anchor,
  bounds,
  mode = 'free',
  sourceTitle,
  canUseGenerationHistory = false,
  onSelect,
  onUpload,
  onOpenGenerationHistory,
  onClose,
}: CanvasNodeTypePickerProps) {
  const firstButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [freeSubmenu, setFreeSubmenu] = useState<'script' | 'material'>()
  const compact = mode !== 'free'
  const style: CSSProperties = compact
    ? clampCompactPosition(anchor, bounds)
    : clampFreeMenuPosition(anchor, bounds)
  const freeMenuLeft = Number(style.left ?? 0)
  const freeMenuWidth = Number(style.width ?? 0)
  const freeSubmenuPlacement =
    freeMenuLeft + freeMenuWidth + 8 + 224 <= bounds.width - 8
      ? 'right'
      : freeMenuLeft - 8 - 224 >= 8
        ? 'left'
        : 'overlay'

  useEffect(() => {
    firstButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !panelRef.current?.contains(event.target)
      ) {
        onClose()
      }
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onClose()
  }

  const renderFreeNodeButton = (
    { type, label, badge, premium, icon: Icon }: PickerNodeOption,
    index?: number,
    menuItem = false,
  ) => (
    <button
      key={type}
      ref={index === 0 ? firstButtonRef : undefined}
      type="button"
      role={menuItem ? 'menuitem' : undefined}
      aria-label={badge ? `${label} ${badge}` : label}
      onClick={() => onSelect(type)}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
      {premium ? <Gem className="canvas-node-type-picker__premium" aria-hidden="true" /> : null}
      {badge ? <em>{badge}</em> : null}
    </button>
  )

  if (compact) {
    const nodeTypes = mode === 'reference'
      ? compactNodeTypes.filter(({ type }) => type !== 'asset-library')
      : compactNodeTypes
    const label = mode === 'reference' ? '引用该节点生成' : '添加节点'

    return (
      <FloatingPanel
        ref={panelRef}
        className={`canvas-node-type-picker canvas-node-type-picker--${mode} nodrag nopan`}
        role="menu"
        aria-label={label}
        style={style}
        onKeyDown={handleKeyDown}
      >
        <div className="canvas-node-type-picker__compact-heading">
          <strong>{label}</strong>
          {sourceTitle ? <small>来源：{sourceTitle}</small> : null}
        </div>
        <div className="canvas-node-type-picker__list">
          {nodeTypes.map(({ type, label: itemLabel, badge, icon: Icon }, index) => (
            <button
              key={type}
              ref={index === 0 ? firstButtonRef : undefined}
              type="button"
              role="menuitem"
              aria-label={badge ? `${itemLabel} ${badge}` : itemLabel}
              onClick={() => onSelect(type)}
            >
              <Icon aria-hidden="true" />
              <span>{itemLabel}</span>
              {badge ? <em>{badge}</em> : null}
            </button>
          ))}
          {mode === 'reference' ? (
            <button type="button" role="menuitem" disabled>
              <PanelsTopLeft aria-hidden="true" />
              <span>参考节点</span>
            </button>
          ) : (
            <>
              <div className="canvas-node-type-picker__section" role="separator">
                添加资源
              </div>
              <button type="button" role="menuitem" onClick={onUpload}>
                <Upload aria-hidden="true" />
                <span>上传</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canUseGenerationHistory}
                onClick={onOpenGenerationHistory}
              >
                <FileClock aria-hidden="true" />
                <span>从生成历史选择</span>
              </button>
            </>
          )}
        </div>
      </FloatingPanel>
    )
  }

  return (
    <FloatingPanel
      ref={panelRef}
      className="canvas-node-type-picker canvas-node-type-picker--free-menu nodrag nopan"
      role="dialog"
      aria-modal="false"
      aria-label="选择节点类型"
      style={style}
      onKeyDown={handleKeyDown}
    >
      <div className="canvas-node-type-picker__free-heading">
        <strong>添加节点</strong>
      </div>
      <div className="canvas-node-type-picker__free-list">
        {freeNodeTypes.map((option, index) => renderFreeNodeButton(option, index))}
        <button
          type="button"
          aria-label="脚本"
          aria-haspopup="menu"
          aria-expanded={freeSubmenu === 'script'}
          onPointerEnter={() => setFreeSubmenu('script')}
          onFocus={() => setFreeSubmenu('script')}
          onClick={() => setFreeSubmenu('script')}
        >
          <BookOpenText aria-hidden="true" />
          <span>脚本</span>
          <ChevronRight aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="素材库"
          aria-haspopup="menu"
          aria-expanded={freeSubmenu === 'material'}
          onPointerEnter={() => setFreeSubmenu('material')}
          onFocus={() => setFreeSubmenu('material')}
          onClick={() => setFreeSubmenu('material')}
        >
          <Library aria-hidden="true" />
          <span>素材库</span>
          <ChevronRight aria-hidden="true" />
        </button>
        <div className="canvas-node-type-picker__free-section" role="separator">
          添加资源
        </div>
        <button type="button" aria-label="上传" onClick={onUpload}>
          <Upload aria-hidden="true" />
          <span>上传</span>
        </button>
        <button
          type="button"
          aria-label="从生成历史选择"
          disabled={!canUseGenerationHistory}
          onClick={onOpenGenerationHistory}
        >
          <FileClock aria-hidden="true" />
          <span>从生成历史选择</span>
        </button>
      </div>
      {freeSubmenu ? (
        <div
          className={`canvas-node-type-picker__free-submenu${
            freeSubmenuPlacement === 'left'
              ? ' canvas-node-type-picker__free-submenu--left'
              : freeSubmenuPlacement === 'overlay'
                ? ' canvas-node-type-picker__free-submenu--overlay'
                : ''
          } canvas-node-type-picker__free-submenu--${freeSubmenu}`}
          role="menu"
          aria-label={freeSubmenu === 'script' ? '脚本子菜单' : '素材库子菜单'}
        >
          {(freeSubmenu === 'script' ? scriptNodeTypes : materialNodeTypes).map(
            (option) => renderFreeNodeButton(option, undefined, true),
          )}
        </div>
      ) : null}
    </FloatingPanel>
  )
}
