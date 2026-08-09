export interface DraftPanelPosition {
  left: number
  top: number
  width: number
  maxHeight: number
}

const PANEL_WIDTH = 320
const PANEL_MAX_HEIGHT = 440
const PANEL_MARGIN = 16

export function clampDraftPanelPosition(
  anchor: { x: number; y: number },
  bounds: { width: number; height: number },
): DraftPanelPosition {
  const width = Math.max(0, Math.min(PANEL_WIDTH, bounds.width - 32))
  const maxHeight = Math.max(
    0,
    Math.min(PANEL_MAX_HEIGHT, bounds.height - 32),
  )
  const left = Math.min(
    Math.max(PANEL_MARGIN, anchor.x),
    Math.max(PANEL_MARGIN, bounds.width - width - PANEL_MARGIN),
  )
  const clampedTop = Math.min(
    Math.max(PANEL_MARGIN, anchor.y),
    Math.max(PANEL_MARGIN, bounds.height - maxHeight - PANEL_MARGIN),
  )
  const top =
    bounds.height < 480
      ? Math.max(PANEL_MARGIN, bounds.height - maxHeight - PANEL_MARGIN)
      : clampedTop

  return { left, top, width, maxHeight }
}
