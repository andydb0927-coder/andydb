import { describe, expect, test } from 'vitest'
import { composerRevealZoom, revealOffset, shouldFitNewCanvas, zoomAroundPoint } from './composer-viewport'

describe('initial canvas viewport', () => {
  const canvas = { createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-05T00:00:00Z', viewport: { x: 0, y: 0, zoom: 1 } }
  test('fits a pristine canvas when its first nodes arrive', () => {
    expect(shouldFitNewCanvas(canvas)).toBe(true)
  })
  test('preserves an edited canvas even if the user saved the default view', () => {
    expect(shouldFitNewCanvas({ ...canvas, updatedAt: '2026-09-05T01:00:00Z' })).toBe(false)
  })
  test('never replaces a saved nondefault viewport', () => {
    expect(shouldFitNewCanvas({ ...canvas, viewport: { x: 12, y: -30, zoom: 0.5 } })).toBe(false)
  })
  test('waits for canvas hydration', () => {
    expect(shouldFitNewCanvas(undefined)).toBe(false)
  })
})

describe('composer viewport geometry', () => {
  test('keeps the node anchor fixed during zoom even if later reveal is cancelled', () => {
    const before = { x: -1112, y: -807, zoom: 1.8 }
    const anchor = { x: 600, y: 160 }
    const after = zoomAroundPoint(before, 1.25, anchor)
    expect((anchor.x - after.x) / after.zoom).toBeCloseTo((anchor.x - before.x) / before.zoom)
    expect((anchor.y - after.y) / after.zoom).toBeCloseTo((anchor.y - before.y) / before.zoom)
  })

  test('does not move the anchor when zoom is unchanged', () => {
    expect(zoomAroundPoint({ x: 12, y: 30, zoom: 0.5 }, 0.5, { x: 320, y: 80 })).toEqual({ x: 12, y: 30, zoom: 0.5 })
  })

  test('keeps a readable screen-sized composer while shrinking a large media card', () => {
    expect(composerRevealZoom({ zoom: 1.64, availableHeight: 580, availableWidth: 960, beforeComposer: 640, nodeWidth: 1024, composerHeight: 380 })).toBeCloseTo(0.5125)
  })

  test('does not zoom in or disturb an already fitting composition', () => {
    expect(composerRevealZoom({ zoom: 0.5, availableHeight: 650, availableWidth: 960, beforeComposer: 200, nodeWidth: 320, composerHeight: 380 })).toBe(0.5)
    expect(revealOffset({ start: 20, end: 600 }, { start: 100, end: 500 })).toBe(0)
  })

  test('respects the canvas minimum zoom even for a tall composer', () => {
    expect(composerRevealZoom({ zoom: 1, availableHeight: 400, availableWidth: 600, beforeComposer: 400, nodeWidth: 624, composerHeight: 500 })).toBe(0.35)
  })

  test('moves by the minimum required distance, including left and top overflow', () => {
    expect(revealOffset({ start: 72, end: 1232 }, { start: 700, end: 1360 })).toBe(-128)
    expect(revealOffset({ start: 72, end: 650 }, { start: -50, end: 400 })).toBe(122)
  })

  test('prioritizes the start of oversized content instead of moving it off screen', () => {
    expect(revealOffset({ start: 72, end: 400 }, { start: 200, end: 800 })).toBe(-128)
  })
})
