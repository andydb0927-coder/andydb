import { useEffect, type RefObject } from 'react'
import type { ReactFlowInstance } from '@xyflow/react'
import { composerRevealZoom, revealOffset, zoomAroundPoint } from './composer-viewport'

type ViewportController = Pick<ReactFlowInstance, 'getViewport' | 'setViewport'>

/** Reveal on selection, not on keystrokes or viewport changes: manual navigation stays in control. */
export function useComposerViewport(
  container: RefObject<HTMLDivElement | null>,
  controller: ViewportController | undefined,
  selectedNodeId: string | undefined,
  canvasId: string | undefined,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !selectedNodeId || !controller || typeof controller.getViewport !== 'function' || typeof controller.setViewport !== 'function') return
    const root = container.current
    if (!root) return
    let frame = 0
    let cancelled = false
    let attempts = 0
    let adjustments = 0
    let stableFrames = 0
    let lastTransform: string | null | undefined
    const cancel = () => { cancelled = true; cancelAnimationFrame(frame) }
    const schedule = () => { if (!cancelled && attempts < 60) frame = requestAnimationFrame(reveal) }
    const reveal = () => {
      if (cancelled) return
      attempts += 1
      const flow = root.querySelector<HTMLElement>('.react-flow')
      const node = [...root.querySelectorAll<HTMLElement>('.react-flow__node')].find(element => element.dataset.id === selectedNodeId)
      const composer = node?.querySelector<HTMLElement>('.creative-node-composer')
      if (!flow || !node || !composer) return
      const transform = flow.querySelector('.react-flow__viewport')?.getAttribute('style')
      stableFrames = transform === lastTransform ? stableFrames + 1 : 0
      lastTransform = transform
      // Wait for React Flow measurement and any explicitly requested focus animation.
      if (stableFrames < 3) { schedule(); return }
      const area = flow.getBoundingClientRect()
      const card = node.getBoundingClientRect()
      const panel = composer.getBoundingClientRect()
      if (!area.width || !card.width || !panel.height || getComputedStyle(node).visibility === 'hidden') { schedule(); return }
      const dock = root.querySelector('.canvas-mode-bar')?.getBoundingClientRect()
      const comment = root.parentElement?.querySelector('.collaboration-comments--floating')?.getBoundingClientRect()
      const left = area.left + 16
      // Keep floating comments usable too when both fit side by side.
      const right = comment && comment.left - 16 - left >= panel.width
        ? Math.min(area.right - 16, comment.left - 16) : area.right - 16
      const top = area.top + 16
      const toolbar = root.querySelector('.selection-context-bar')?.getBoundingClientRect()
      const bottom = Math.min(area.bottom - 16,
        dock && dock.height ? dock.top - 12 : area.bottom - 16,
        toolbar && toolbar.height ? toolbar.top - 12 : area.bottom - 16)
      const title = node.querySelector('.creative-node__floating-title')?.getBoundingClientRect()
      const nodeTop = Math.min(card.top, title?.top ?? card.top)
      const current = controller.getViewport()
      const zoom = adjustments === 0 ? composerRevealZoom({ zoom: current.zoom, availableHeight: bottom - top,
        availableWidth: right - left, beforeComposer: panel.top - nodeTop,
        nodeWidth: card.width, composerHeight: panel.height }) : current.zoom
      const ratio = zoom / current.zoom
      // Match the CSS anchor (center on desktop, left in narrow layouts), without
      // duplicating CSS breakpoints. The composer stays screen-sized while media scales.
      const origin = Number.parseFloat(getComputedStyle(composer).transformOrigin) / composer.offsetWidth
      const anchor = { x: panel.left + panel.width * origin, y: nodeTop }
      const scaled = (rect: DOMRect) => ({
        left: anchor.x + (rect.left - anchor.x) * ratio,
        right: anchor.x + (rect.right - anchor.x) * ratio,
        top: anchor.y + (rect.top - anchor.y) * ratio,
        bottom: anchor.y + (rect.bottom - anchor.y) * ratio,
      })
      const media = scaled(card)
      const editorTop = anchor.y + (panel.top - anchor.y) * ratio
      const editor = { left: panel.left, right: panel.right, top: editorTop, bottom: editorTop + panel.height }
      const actions = node.querySelector('.creative-node-actions')?.getBoundingClientRect()
      const scaledActions = actions ? scaled(actions) : media
      const full = {
        left: Math.min(media.left, editor.left, scaledActions.left),
        right: Math.max(media.right, editor.right, scaledActions.right),
        top: Math.min(nodeTop, scaledActions.top),
        bottom: Math.max(editor.bottom, scaledActions.bottom),
      }
      // A tall portrait and its editor may exceed the minimum-zoom safe area.
      // Keep the node header/media reachable rather than hiding its context-menu target.
      // Transformed DOMRects carry subpixel rounding; an exact fit must not
      // unexpectedly discard the media card and its result actions.
      const horizontal = full.right - full.left <= right - left + 0.5 ? full : editor
      const vertical = full
      const dx = revealOffset({ start: left, end: right }, { start: horizontal.left, end: horizontal.right })
      const dy = revealOffset({ start: top, end: bottom }, { start: vertical.top, end: vertical.bottom })
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(zoom - current.zoom) < 0.001) return
      const anchored = zoomAroundPoint(current, zoom, { x: anchor.x - area.left, y: anchor.y - area.top })
      // Apply zoom + reveal together; user input can safely cancel between frames.
      void controller.setViewport({ ...anchored, x: anchored.x + dx, y: anchored.y + dy }, { duration: 0 })
      if (++adjustments < 3) { stableFrames = 0; schedule() }
    }
    // Never fight a user who starts panning, typing, zooming or dragging meanwhile.
    root.addEventListener('pointerdown', cancel, true)
    const cancelDrag = (event: PointerEvent) => { if (event.buttons) cancel() }
    root.addEventListener('pointermove', cancelDrag, true)
    root.addEventListener('wheel', cancel, true)
    root.addEventListener('keydown', cancel, true)
    schedule()
    return () => {
      cancel()
      root.removeEventListener('pointerdown', cancel, true)
      root.removeEventListener('pointermove', cancelDrag, true)
      root.removeEventListener('wheel', cancel, true)
      root.removeEventListener('keydown', cancel, true)
    }
  }, [container, controller, selectedNodeId, canvasId, enabled])
}
