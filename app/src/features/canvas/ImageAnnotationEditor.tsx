import { ArrowUpRight, Brush, Circle, Square, Type, Undo2 } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import type {
  ImageAnnotation,
  ImageAnnotationPoint,
} from '../project/model'

type AnnotationTool = 'rectangle' | 'ellipse' | 'arrow' | 'brush' | 'text'

function normalizedPoint(
  canvas: HTMLCanvasElement,
  event: ReactPointerEvent<HTMLCanvasElement>,
): ImageAnnotationPoint {
  const bounds = canvas.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / Math.max(1, bounds.height))),
  }
}

function drawArrow(
  context: CanvasRenderingContext2D,
  start: ImageAnnotationPoint,
  end: ImageAnnotationPoint,
  width: number,
  height: number,
) {
  const startX = start.x * width
  const startY = start.y * height
  const endX = end.x * width
  const endY = end.y * height
  const angle = Math.atan2(endY - startY, endX - startX)
  const head = Math.max(12, context.lineWidth * 4)
  context.beginPath()
  context.moveTo(startX, startY)
  context.lineTo(endX, endY)
  context.lineTo(
    endX - head * Math.cos(angle - Math.PI / 6),
    endY - head * Math.sin(angle - Math.PI / 6),
  )
  context.moveTo(endX, endY)
  context.lineTo(
    endX - head * Math.cos(angle + Math.PI / 6),
    endY - head * Math.sin(angle + Math.PI / 6),
  )
  context.stroke()
}

export function drawImageAnnotations(
  context: CanvasRenderingContext2D,
  annotations: readonly ImageAnnotation[],
  width: number,
  height: number,
) {
  for (const annotation of annotations) {
    context.save()
    context.strokeStyle = annotation.color
    context.fillStyle = annotation.color
    context.lineWidth = annotation.lineWidth
    context.lineCap = 'round'
    context.lineJoin = 'round'
    if (annotation.kind === 'brush') {
      context.beginPath()
      annotation.points.forEach((point, index) => {
        const x = point.x * width
        const y = point.y * height
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.stroke()
    } else if (annotation.kind === 'text') {
      context.font = `600 ${Math.max(18, annotation.lineWidth * 5)}px system-ui, sans-serif`
      context.fillText(annotation.text, annotation.point.x * width, annotation.point.y * height)
    } else if (annotation.kind === 'rectangle') {
      context.strokeRect(
        annotation.start.x * width,
        annotation.start.y * height,
        (annotation.end.x - annotation.start.x) * width,
        (annotation.end.y - annotation.start.y) * height,
      )
    } else if (annotation.kind === 'ellipse') {
      const startX = annotation.start.x * width
      const startY = annotation.start.y * height
      const endX = annotation.end.x * width
      const endY = annotation.end.y * height
      context.beginPath()
      context.ellipse(
        (startX + endX) / 2,
        (startY + endY) / 2,
        Math.abs(endX - startX) / 2,
        Math.abs(endY - startY) / 2,
        0,
        0,
        Math.PI * 2,
      )
      context.stroke()
    } else {
      drawArrow(context, annotation.start, annotation.end, width, height)
    }
    context.restore()
  }
}

export function ImageAnnotationOverlay({
  annotations,
}: {
  annotations: readonly ImageAnnotation[]
}) {
  if (annotations.length === 0) return null
  return (
    <svg
      className="creative-node__annotation-overlay"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-label={`${annotations.length} 个图片标注`}
    >
      {annotations.map((annotation) => {
        const common = {
          stroke: annotation.color,
          strokeWidth: annotation.lineWidth * 2,
          fill: 'none',
          vectorEffect: 'non-scaling-stroke' as const,
        }
        if (annotation.kind === 'rectangle') {
          return <rect key={annotation.id} {...common} x={annotation.start.x * 1000} y={annotation.start.y * 1000} width={(annotation.end.x - annotation.start.x) * 1000} height={(annotation.end.y - annotation.start.y) * 1000} />
        }
        if (annotation.kind === 'ellipse') {
          return <ellipse key={annotation.id} {...common} cx={(annotation.start.x + annotation.end.x) * 500} cy={(annotation.start.y + annotation.end.y) * 500} rx={Math.abs(annotation.end.x - annotation.start.x) * 500} ry={Math.abs(annotation.end.y - annotation.start.y) * 500} />
        }
        if (annotation.kind === 'arrow') {
          return <line key={annotation.id} {...common} x1={annotation.start.x * 1000} y1={annotation.start.y * 1000} x2={annotation.end.x * 1000} y2={annotation.end.y * 1000} markerEnd="url(#annotation-arrow)" />
        }
        if (annotation.kind === 'brush') {
          return <polyline key={annotation.id} {...common} points={annotation.points.map(({ x, y }) => `${x * 1000},${y * 1000}`).join(' ')} />
        }
        if (annotation.kind === 'text') {
          return <text key={annotation.id} x={annotation.point.x * 1000} y={annotation.point.y * 1000} fill={annotation.color} fontSize={Math.max(36, annotation.lineWidth * 12)}>{annotation.text}</text>
        }
        return null
      })}
      <defs>
        <marker id="annotation-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="context-stroke" /></marker>
      </defs>
    </svg>
  )
}

export function ImageAnnotationEditor({
  sourceUrl,
  width,
  height,
  annotations,
  onSave,
}: {
  sourceUrl: string
  width?: number
  height?: number
  annotations: readonly ImageAnnotation[]
  onSave(annotations: ImageAnnotation[]): void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [tool, setTool] = useState<AnnotationTool>('brush')
  const [color, setColor] = useState('#ff3b30')
  const [lineWidth, setLineWidth] = useState(4)
  const [text, setText] = useState('重点')
  const [draft, setDraft] = useState<ImageAnnotation[]>(() => annotations.map((item) => ({ ...item })))
  const [drawing, setDrawing] = useState<ImageAnnotation>()

  const redraw = () => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    drawImageAnnotations(context, drawing ? [...draft, drawing] : draft, canvas.width, canvas.height)
  }

  useEffect(() => {
    const image = new Image()
    image.onload = () => {
      imageRef.current = image
      const canvas = canvasRef.current
      if (!canvas) return
      const naturalWidth = width ?? (image.naturalWidth || 1280)
      const naturalHeight = height ?? (image.naturalHeight || 720)
      canvas.width = Math.min(1600, Math.max(320, naturalWidth))
      canvas.height = Math.round(canvas.width * naturalHeight / naturalWidth)
      redraw()
    }
    image.src = sourceUrl
  }, [height, sourceUrl, width])

  useEffect(redraw, [draft, drawing])

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = normalizedPoint(event.currentTarget, event)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const base = { id: crypto.randomUUID(), color, lineWidth }
    if (tool === 'brush') {
      setDrawing({ ...base, kind: 'brush', points: [point] })
    } else if (tool === 'text') {
      if (text.trim()) setDraft((items) => [...items, { ...base, kind: 'text', point, text: text.trim() }])
    } else {
      setDrawing({ ...base, kind: tool, start: point, end: point })
    }
  }

  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return
    const point = normalizedPoint(event.currentTarget, event)
    setDrawing((current) => {
      if (!current) return current
      return current.kind === 'brush'
        ? { ...current, points: [...current.points, point] }
        : current.kind === 'text'
          ? current
          : { ...current, end: point }
    })
  }

  const pointerUp = () => {
    if (!drawing) return
    setDraft((items) => [...items, drawing])
    setDrawing(undefined)
  }

  return (
    <div className="image-annotation-editor">
      <div className="annotation-tools" role="toolbar" aria-label="标注工具">
        {([
          ['rectangle', '矩形', Square],
          ['ellipse', '圆形', Circle],
          ['arrow', '箭头', ArrowUpRight],
          ['brush', '画笔', Brush],
          ['text', '文本标注', Type],
        ] as const).map(([value, label, Icon]) => (
          <button key={value} type="button" aria-label={label} aria-pressed={tool === value} onClick={() => setTool(value)}><Icon aria-hidden="true" /></button>
        ))}
        <label>颜色<input aria-label="标注颜色" type="color" value={color} onChange={(event) => setColor(event.currentTarget.value)} /></label>
        <label>线宽<input aria-label="标注线宽" type="range" min="1" max="20" value={lineWidth} onChange={(event) => setLineWidth(Number(event.currentTarget.value))} /></label>
        <button type="button" aria-label="撤销标注" disabled={draft.length === 0} onClick={() => setDraft((items) => items.slice(0, -1))}><Undo2 aria-hidden="true" /></button>
      </div>
      {tool === 'text' ? <label className="image-annotation-editor__text">标注文字<input aria-label="标注文字" value={text} maxLength={80} onChange={(event) => setText(event.currentTarget.value)} /></label> : null}
      <canvas
        ref={canvasRef}
        aria-label="图片标注画布"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      />
      <footer>
        <span>{draft.length} 个标注</span>
        <button type="button" disabled={draft.length === 0} onClick={() => onSave(draft)}>保存标注</button>
      </footer>
    </div>
  )
}
