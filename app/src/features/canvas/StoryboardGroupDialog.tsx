import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import type { CanvasGroup } from '../project/model'

type StoryboardLayout = NonNullable<CanvasGroup['storyboardLayout']>

interface StoryboardGroupDialogProps {
  title: string
  nodeCount: number
  initialLayout?: StoryboardLayout
  onApply(layout: StoryboardLayout): void
  onClose(): void
}

const presets = [
  { preset: '2x2', columns: 2, rows: 2 },
  { preset: '2x3', columns: 2, rows: 3 },
  { preset: '3x3', columns: 3, rows: 3 },
] as const

export function StoryboardGroupDialog({
  title,
  nodeCount,
  initialLayout,
  onApply,
  onClose,
}: StoryboardGroupDialogProps) {
  const fallback = presets.find(({ columns, rows }) => columns * rows >= nodeCount) ?? {
    preset: 'custom' as const,
    columns: Math.max(1, Math.ceil(Math.sqrt(nodeCount))),
    rows: Math.max(1, Math.ceil(nodeCount / Math.ceil(Math.sqrt(nodeCount)))),
  }
  const [layout, setLayout] = useState<StoryboardLayout>(initialLayout ?? fallback)
  const valid = useMemo(
    () => layout.columns >= 1 && layout.rows >= 1 && layout.columns * layout.rows >= nodeCount,
    [layout, nodeCount],
  )

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return createPortal(
    <div className="storyboard-group-dialog-backdrop nodrag nopan">
      <section role="dialog" aria-modal="true" aria-label="分镜组设置" className="storyboard-group-dialog">
        <header><div><span>STORYBOARD GROUP</span><h2>{title}</h2></div><button type="button" aria-label="关闭分镜组设置" onClick={onClose}><X aria-hidden="true" /></button></header>
        <p>选择可容纳 {nodeCount} 个镜头的格数，应用后将按依赖顺序自动排版。</p>
        <div className="storyboard-group-dialog__presets" role="group" aria-label="分镜格数">
          {presets.map((preset) => (
            <button
              key={preset.preset}
              type="button"
              aria-pressed={layout.preset === preset.preset}
              disabled={preset.columns * preset.rows < nodeCount}
              onClick={() => setLayout(preset)}
            >{preset.preset}</button>
          ))}
          <button type="button" aria-pressed={layout.preset === 'custom'} onClick={() => setLayout((current) => ({ ...current, preset: 'custom' }))}>自定义</button>
        </div>
        {layout.preset === 'custom' ? (
          <div className="storyboard-group-dialog__custom">
            <label>列数<input aria-label="自定义列数" type="number" min="1" max="12" value={layout.columns} onChange={(event) => setLayout({ ...layout, columns: Number(event.target.value) })} /></label>
            <span>×</span>
            <label>行数<input aria-label="自定义行数" type="number" min="1" max="12" value={layout.rows} onChange={(event) => setLayout({ ...layout, rows: Number(event.target.value) })} /></label>
          </div>
        ) : null}
        {!valid ? <p role="alert">当前格数不足，至少需要 {nodeCount} 格。</p> : null}
        <footer><button type="button" onClick={onClose}>取消</button><button type="button" disabled={!valid} onClick={() => onApply(layout)}>转换并自动排版</button></footer>
      </section>
    </div>,
    document.body,
  )
}
