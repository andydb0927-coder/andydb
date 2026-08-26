import { RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react'
import { createPortal } from 'react-dom'

interface PanoramaViewerProps {
  imageUrl: string
  title: string
  onClose(): void
}

interface DragState {
  pointerId: number
  x: number
  y: number
  yaw: number
  pitch: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function PanoramaViewer({ imageUrl, title, onClose }: PanoramaViewerProps) {
  const [yaw, setYaw] = useState(0)
  const [pitch, setPitch] = useState(0)
  const [zoom, setZoom] = useState(1)
  const dragRef = useRef<DragState | undefined>(undefined)

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      yaw,
      pitch,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setYaw(drag.yaw + (event.clientX - drag.x) * 0.35)
    setPitch(clamp(drag.pitch - (event.clientY - drag.y) * 0.22, -70, 70))
  }
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = undefined
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }
  const adjustZoom = (next: number) => setZoom(clamp(Number(next.toFixed(1)), 0.7, 2.5))
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    adjustZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1))
  }
  const reset = () => {
    setYaw(0)
    setPitch(0)
    setZoom(1)
  }

  return createPortal(
    <div className="panorama-viewer-backdrop nodrag nopan">
      <section role="dialog" aria-modal="true" aria-label={`${title} 720全景预览`} className="panorama-viewer">
        <header>
          <div><span>720 PANORAMA</span><h2>{title}</h2></div>
          <button type="button" aria-label="关闭全景预览" onClick={onClose}><X aria-hidden="true" /></button>
        </header>
        <div
          className="panorama-viewer__viewport"
          role="img"
          aria-label={`${title} 720全景视图`}
          data-yaw={String(Number(yaw.toFixed(1)))}
          data-pitch={String(Number(pitch.toFixed(1)))}
          data-zoom={String(zoom)}
          style={{
            backgroundImage: `url("${imageUrl.replace(/"/g, '%22')}")`,
            backgroundPosition: `${50 + yaw / 3.6}% ${50 + pitch / 1.8}%`,
            backgroundSize: `${200 * zoom}% auto`,
          }}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={handleWheel}
        >
          <p>按住拖拽旋转视角 · 滚轮缩放</p>
        </div>
        <footer>
          <button type="button" aria-label="缩小全景" onClick={() => adjustZoom(zoom - 0.1)}><ZoomOut aria-hidden="true" /></button>
          <output aria-label="全景缩放比例">{Math.round(zoom * 100)}%</output>
          <button type="button" aria-label="放大全景" onClick={() => adjustZoom(zoom + 0.1)}><ZoomIn aria-hidden="true" /></button>
          <button type="button" aria-label="重置全景视角" onClick={reset}><RotateCcw aria-hidden="true" />重置视角</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
