import {
  ChevronDown,
  Columns3,
  Copy,
  CopyPlus,
  Group,
  LayoutGrid,
  MessageSquare,
  Plus,
  Rows3,
  Save,
  Ungroup,
} from 'lucide-react'
import { useState } from 'react'

import type { CanvasGroup } from '../project/model'
import type { CanvasGroupBounds } from './canvas-group'

interface CanvasGroupOverlayProps {
  group: CanvasGroup
  bounds: CanvasGroupBounds
  selected?: boolean
  temporary?: boolean
  onSelect(): void
  onUngroup(): void
  onGroup?(): void
  onArrange?(mode: 'grid' | 'horizontal' | 'vertical'): void
  onDuplicate?(): void
  onContinue?(trigger: HTMLButtonElement): void
  onFeedback?(message: string): void
}

export function CanvasGroupOverlay({
  group,
  bounds,
  selected = false,
  temporary = false,
  onSelect,
  onUngroup,
  onGroup,
  onArrange,
  onDuplicate,
  onContinue,
  onFeedback,
}: CanvasGroupOverlayProps) {
  const [arrangeOpen, setArrangeOpen] = useState(false)

  const arrange = (mode: 'grid' | 'horizontal' | 'vertical') => {
    setArrangeOpen(false)
    onArrange?.(mode)
  }

  return (
    <section
      aria-label={`${temporary ? '节点组合' : '节点分组'}：${group.title}`}
      className="canvas-group-overlay"
      data-selected={selected}
      data-temporary={temporary}
      role="group"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }}
    >
      {selected ? (
        <div
          className="canvas-group-overlay__toolbar nodrag nopan"
          role="toolbar"
          aria-label={`${group.title} 组合操作`}
        >
          <div className="canvas-group-overlay__arrange">
            <button
              type="button"
              aria-label="排列"
              aria-expanded={arrangeOpen}
              onClick={() => setArrangeOpen((open) => !open)}
            >
              <LayoutGrid aria-hidden="true" />排列<ChevronDown aria-hidden="true" />
            </button>
            {arrangeOpen ? (
              <div role="menu" aria-label="排列方式">
                <button type="button" role="menuitem" onClick={() => arrange('grid')}>
                  <LayoutGrid aria-hidden="true" />宫格排列
                </button>
                <button type="button" role="menuitem" onClick={() => arrange('horizontal')}>
                  <Columns3 aria-hidden="true" />水平排列
                </button>
                <button type="button" role="menuitem" onClick={() => arrange('vertical')}>
                  <Rows3 aria-hidden="true" />垂直排列
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" aria-label="保存到资产" onClick={() => onFeedback?.('已保存组合到本地资产。')}>
            <Save aria-hidden="true" />保存到资产
          </button>
          <button type="button" aria-label="创建副本" onClick={onDuplicate}>
            <CopyPlus aria-hidden="true" />创建副本
          </button>
          <button type="button" aria-label="复制" onClick={() => onFeedback?.('已复制组合，可用创建副本粘贴到画布。')}>
            <Copy aria-hidden="true" />复制
          </button>
          <button
            type="button"
            aria-label="打组"
            onClick={temporary ? onGroup : onUngroup}
          >
            <Group aria-hidden="true" />打组<ChevronDown aria-hidden="true" />
          </button>
          <button type="button" aria-label="添加到 Chat" onClick={() => onFeedback?.('已将组合添加到本地 Chat 上下文。')}>
            <MessageSquare aria-hidden="true" />添加到 Chat
          </button>
        </div>
      ) : null}
      {!temporary ? (
        <div className="canvas-group-overlay__controls nodrag nopan">
          <button
            aria-label={`选择分组：${group.title}`}
            className="focus-visible"
            type="button"
            onClick={onSelect}
          >
            <Group aria-hidden="true" />
            {group.title}
          </button>
          <button
            aria-label={`取消分组：${group.title}`}
            className="focus-visible"
            title="取消分组"
            type="button"
            onClick={onUngroup}
          >
            <Ungroup aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {selected ? (
        <button
          type="button"
          className="canvas-group-overlay__continue nodrag nopan"
          aria-label="从组合继续生成"
          onClick={(event) => onContinue?.(event.currentTarget)}
        >
          <Plus aria-hidden="true" />
        </button>
      ) : null}
    </section>
  )
}
