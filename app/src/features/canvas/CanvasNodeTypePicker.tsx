import {
  AudioLines,
  BookOpenText,
  Clapperboard,
  ContactRound,
  FileClock,
  Film,
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

const quickNodeTypes: Array<{
  type: QuickNodeType
  label: string
  description: string
  badge?: string
  icon: typeof BookOpenText
}> = [
  {
    type: 'script-generator',
    label: '故事脚本生成',
    description: '从主题开始生成可编辑故事结构',
    icon: BookOpenText,
  },
  {
    type: 'character-turnaround',
    label: '角色三视图',
    description: '创建角色正面、侧面与背面设定',
    icon: ContactRound,
  },
  {
    type: 'reference-video',
    label: '全能参考生视频',
    description: '结合人物、场景与动作参考生成视频',
    badge: 'SD2.5',
    icon: Images,
  },
  {
    type: 'audio-video',
    label: '音频生视频',
    description: '依据音乐节奏和情绪创建视频节点',
    badge: 'SD2.5',
    icon: AudioLines,
  },
  {
    type: 'worldview',
    label: '世界观卡',
    description: '记录背景、美术风格与世界规则',
    icon: PanelsTopLeft,
  },
  {
    type: 'text',
    label: '文本',
    description: '记录提示词、旁白或创作说明',
    icon: Type,
  },
  {
    type: 'image',
    label: '图片',
    description: '创建一个待生成或待绑定素材的图片节点',
    icon: Image,
  },
  {
    type: 'storyboard',
    label: '分镜',
    description: '创建镜头画面与构图提示',
    icon: PanelsTopLeft,
  },
  {
    type: 'video',
    label: '视频',
    description: '创建独立的视频生成节点',
    icon: Film,
  },
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

function clampPickerPosition(
  anchor: CanvasNodeTypePickerProps['anchor'],
  bounds: CanvasNodeTypePickerProps['bounds'],
) {
  const gutter = 12
  const width = Math.min(520, Math.max(0, bounds.width - gutter * 2))
  // Reserve the full three-row picker height so an edge midpoint near the
  // lower half of the canvas cannot place the final media choices off-screen.
  const estimatedHeight = Math.min(560, Math.max(0, bounds.height - gutter * 2))
  return {
    left: Math.min(
      Math.max(gutter, anchor.x - width / 2),
      Math.max(gutter, bounds.width - width - gutter),
    ),
    top: Math.min(
      Math.max(gutter, anchor.y - 40),
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
  const compact = mode !== 'free'
  const style: CSSProperties = compact
    ? clampCompactPosition(anchor, bounds)
    : clampPickerPosition(anchor, bounds)

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
      className="canvas-node-type-picker nodrag nopan"
      role="dialog"
      aria-modal="false"
      aria-label="选择节点类型"
      style={style}
      onKeyDown={handleKeyDown}
    >
      <div className="canvas-node-type-picker__heading">
        <span>FREE GENERATION</span>
        <strong>选择节点类型</strong>
        <p>节点会创建在刚才双击的位置，稍后可继续编辑或连接。</p>
      </div>
      <div className="canvas-node-type-picker__grid">
        {quickNodeTypes.map(({ type, label, description, badge, icon: Icon }, index) => (
          <button
            key={type}
            ref={index === 0 ? firstButtonRef : undefined}
            type="button"
            aria-label={badge ? `${label} ${badge}` : label}
            onClick={() => onSelect(type)}
          >
            <span className="canvas-node-type-picker__icon"><Icon aria-hidden="true" /></span>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            {badge ? <em>{badge}</em> : null}
          </button>
        ))}
      </div>
      <small className="canvas-node-type-picker__escape">Esc 关闭</small>
    </FloatingPanel>
  )
}
