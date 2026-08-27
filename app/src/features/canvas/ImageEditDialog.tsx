import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Asset } from '../project/model'
import { providerGenerationCost, type ModelProvider } from '../generation/model-provider-registry'
import { ImageSizeResolver } from '../generation/image-size-resolver'
import { seedreamImageSizePolicy } from '../generation/seedream-live-provider'
import { buildArkImageEditPrompt, estimateArkImageEditCny, imageEditDirections, imageEditParameters, type ArkImageEditDraft, type ArkImageEditOperation } from '../generation/ark-image-edit-provider'

export function normalizeImageEditBox(start: { x: number; y: number }, end: { x: number; y: number }) {
  const coordinate = (value: number) => Math.max(0, Math.min(999, Math.round(value * 1000)))
  return { x1: coordinate(Math.min(start.x, end.x)), y1: coordinate(Math.min(start.y, end.y)), x2: coordinate(Math.max(start.x, end.x)), y2: coordinate(Math.max(start.y, end.y)) }
}

function initialSize(asset: Asset, sizeResolver: ImageSizeResolver) {
  try {
    return sizeResolver.resolve({ aspectRatio: '自定义', customWidth: asset.width ?? 2048, customHeight: asset.height ?? 2048 })
  } catch {
    return sizeResolver.resolve({ aspectRatio: '1:1', resolution: '2K' })
  }
}

export function ImageEditDialog({ asset, operation, provider, busy = false, onSubmit, onClose }: {
  asset: Asset
  operation: ArkImageEditOperation
  provider: ModelProvider
  busy?: boolean
  onSubmit(draft: ArkImageEditDraft): void
  onClose(): void
}) {
  const sizeResolver = new ImageSizeResolver(provider.sizePolicy ?? seedreamImageSizePolicy)
  const initial = initialSize(asset, sizeResolver)
  const [width, setWidth] = useState(initial.width ?? 2048)
  const [height, setHeight] = useState(initial.height ?? 2048)
  const [prompt, setPrompt] = useState('')
  const [direction, setDirection] = useState<string>('四周')
  const [box, setBox] = useState({ x1: 0, y1: 0, x2: 0, y2: 0 })
  const [loadError, setLoadError] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const start = useRef<{ x: number; y: number } | undefined>(undefined)
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const trigger = document.activeElement
    dialogRef.current?.querySelector<HTMLElement>('textarea')?.focus()
    return () => { if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus() }
  }, [])
  const draft: ArkImageEditDraft = { operation, prompt, width, height, direction, ...(operation === 'erase' ? { box } : {}) }
  let error = provider.disabledReason ?? (busy ? '当前节点已有生成任务，请等待完成。' : loadError ? '源图片无法显示，请重新上传后编辑。' : '')
  try {
    sizeResolver.resolve(imageEditParameters(draft))
    buildArkImageEditPrompt({ projectId: '', nodeId: '', operation: 'regenerate', targetKind: 'image', prompt, parameters: imageEditParameters(draft), referenceAssets: [{ kind: 'image', mimeType: asset.mimeType, url: asset.url }] })
  } catch (failure) {
    error ||= failure instanceof Error ? failure.message : '请检查编辑参数。'
  }
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) / Math.max(1, bounds.width), y: (event.clientY - bounds.top) / Math.max(1, bounds.height) }
  }
  const title = operation === 'erase' ? 'AI 局部擦除' : '提示词扩图'

  return createPortal(
    <div className="ark-image-edit-overlay nodrag nowheel" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} className="ark-image-edit-dialog"
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current() }
          if (event.key === 'Tab') {
            const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,input,select') ?? [])]
            const first = controls[0], last = controls.at(-1)
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
          }
        }}>
        <header><h2>{title}</h2><button type="button" aria-label={`关闭${title}`} onClick={onClose}>关闭</button></header>
        <p>火山方舟 · Seedream 5.0 Pro 图片编辑</p>
        <p>{operation === 'erase' ? '在图片上拖动框选区域，或填写 0–999 坐标。' : '按描述与目标尺寸延展画面，不是像素拼接。'} AI 重绘不保证未编辑区域像素完全不变；原图版本保留。</p>
        <div className="ark-image-edit-dialog__source" aria-label="编辑源图片与选区"
          onPointerDown={(event) => { if (operation !== 'erase') return; event.preventDefault(); start.current = point(event); event.currentTarget.setPointerCapture?.(event.pointerId) }}
          onPointerMove={(event) => { if (start.current) setBox(normalizeImageEditBox(start.current, point(event))) }}
          onPointerUp={(event) => { if (start.current) setBox(normalizeImageEditBox(start.current, point(event))); start.current = undefined; event.currentTarget.releasePointerCapture?.(event.pointerId) }}
          onPointerCancel={() => { start.current = undefined }}>
          <img src={asset.url} alt="编辑源图" draggable={false} onError={() => setLoadError(true)} />
          {operation === 'erase' && box.x2 > box.x1 && box.y2 > box.y1 ? <span className="ark-image-edit-dialog__box" style={{ left: `${box.x1 / 10}%`, top: `${box.y1 / 10}%`, width: `${(box.x2 - box.x1) / 10}%`, height: `${(box.y2 - box.y1) / 10}%` }} /> : null}
        </div>
        {operation === 'erase' ? <fieldset><legend>擦除区域（0–999）</legend><div className="ark-image-edit-dialog__fields">{([['x1', '左边界'], ['y1', '上边界'], ['x2', '右边界'], ['y2', '下边界']] as const).map(([key, label]) => <label key={key}>{label}<input aria-label={label} type="number" min={0} max={999} step={1} value={box[key]} onChange={(event) => setBox({ ...box, [key]: Number(event.target.value) })} /></label>)}</div></fieldset> : <label>扩图方向<select aria-label="扩图方向" value={direction} onChange={(event) => setDirection(event.target.value)}>{imageEditDirections.map((option) => <option key={option}>{option}</option>)}</select></label>}
        <label>编辑描述<textarea aria-label="编辑描述" maxLength={2000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={operation === 'erase' ? '描述要移除的对象，例如左侧路牌' : '描述延展画面，例如继续山谷与晨雾'} /></label>
        <div className="ark-image-edit-dialog__fields">
          <label>输出宽度<input aria-label="输出宽度" type="number" min={1} step={1} value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
          <label>输出高度<input aria-label="输出高度" type="number" min={1} step={1} value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label>
        </div>
        <p>实际请求尺寸 {width} × {height} · 1 张 · 本地预计 {providerGenerationCost(provider, { count: 1 })} 积分 · 官方预计 ¥{estimateArkImageEditCny({ width, height }).toFixed(2)}</p>
        <p>单张输入图免费；最终费用以官方账单为准。确认后调用真实 API，结果保存到版本、资产与历史。</p>
        {error ? <p role="status" id="ark-edit-reason">{error}</p> : null}
        <footer><button type="button" onClick={onClose}>取消</button><button type="button" disabled={Boolean(error) || submitted} aria-describedby={error ? 'ark-edit-reason' : undefined} onClick={() => { setSubmitted(true); onSubmit(draft) }}>确认编辑并生成</button></footer>
      </div>
    </div>, document.body,
  )
}
