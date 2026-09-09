interface Range { start: number; end: number }

/** Zoom and anchoring are atomic, so an interrupted reveal never strands the node. */
export function zoomAroundPoint(viewport: { x: number; y: number; zoom: number }, zoom: number, anchor: { x: number; y: number }) {
  const ratio = zoom / viewport.zoom
  return { x: anchor.x - (anchor.x - viewport.x) * ratio,
    y: anchor.y - (anchor.y - viewport.y) * ratio, zoom }
}

/** An untouched canvas has no user view to restore; keep first-node auto fitting. */
export function shouldFitNewCanvas(canvas: {
  createdAt: string
  updatedAt: string
  viewport: { x: number; y: number; zoom: number }
} | undefined): boolean {
  return Boolean(canvas && canvas.createdAt === canvas.updatedAt &&
    canvas.viewport.x === 0 && canvas.viewport.y === 0 && canvas.viewport.zoom === 1)
}

/** Pan only as far as needed; do not recenter a composition that already fits. */
export function revealOffset(available: Range, content: Range): number {
  if (content.end - content.start > available.end - available.start) return available.start - content.start
  if (content.start < available.start) return available.start - content.start
  if (content.end > available.end) return available.end - content.end
  return 0
}

/** Media scales with the canvas, but the composer deliberately stays screen-sized. */
export function composerRevealZoom({ zoom, availableHeight, availableWidth, beforeComposer, nodeWidth, composerHeight }: {
  zoom: number
  availableHeight: number
  availableWidth: number
  beforeComposer: number
  nodeWidth: number
  composerHeight: number
}): number {
  return Math.max(0.35, Math.min(zoom,
    beforeComposer > 0 ? zoom * Math.max(0, availableHeight - composerHeight) / beforeComposer : zoom,
    nodeWidth > 0 ? zoom * availableWidth / nodeWidth : zoom,
  ))
}
