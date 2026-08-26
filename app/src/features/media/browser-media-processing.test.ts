import { describe, expect, test } from 'vitest'

import {
  calculateGridCells,
  calculateStoryboardLayout,
  imageMirrorTransform,
  sliceAndResampleChannels,
  wavDurationSeconds,
  encodePcm16Wav,
} from './browser-media-processing'

describe('browser media processing contracts', () => {
  test('maps 2x2 and 3x3 image grids without dropping edge pixels', () => {
    expect(calculateGridCells(1001, 701, 2)).toEqual([
      { column: 0, row: 0, x: 0, y: 0, width: 500, height: 350 },
      { column: 1, row: 0, x: 500, y: 0, width: 501, height: 350 },
      { column: 0, row: 1, x: 0, y: 350, width: 500, height: 351 },
      { column: 1, row: 1, x: 500, y: 350, width: 501, height: 351 },
    ])

    const cells = calculateGridCells(1000, 800, 3)
    expect(cells).toHaveLength(9)
    expect(cells.at(-1)).toEqual({
      column: 2,
      row: 2,
      x: 666,
      y: 533,
      width: 334,
      height: 267,
    })
  })

  test('composes rotation and persisted horizontal/vertical mirror transforms', () => {
    expect(imageMirrorTransform(1, false, false)).toBe('rotate(90deg) scale(1, 1)')
    expect(imageMirrorTransform(0, true, false)).toBe('rotate(0deg) scale(-1, 1)')
    expect(imageMirrorTransform(3, true, true)).toBe('rotate(270deg) scale(-1, -1)')
  })

  test('lays a storyboard group on a 4096px canvas with captions and stable order', () => {
    const layout = calculateStoryboardLayout(
      [
        { width: 1920, height: 1080 },
        { width: 1080, height: 1920 },
        { width: 1024, height: 1024 },
      ],
      4096,
    )
    expect(layout.width).toBe(4096)
    expect(layout.items).toHaveLength(3)
    expect(layout.items.map(({ number }) => number)).toEqual([1, 2, 3])
    expect(layout.height).toBeGreaterThan(1400)
    expect(layout.items.every(({ width }) => width > 0)).toBe(true)
  })

  test('honors custom storyboard columns for 2x3 and 3x3 exports', () => {
    const sources = Array.from({ length: 6 }, () => ({ width: 1920, height: 1080 }))
    const twoByThree = calculateStoryboardLayout(sources, 4096, { columns: 2, rows: 3 })
    expect(twoByThree.items[2].x).toBe(twoByThree.items[0].x)
    expect(twoByThree.items[2].y).toBeGreaterThan(twoByThree.items[0].y)

    const threeByThree = calculateStoryboardLayout(sources, 4096, { columns: 3, rows: 3 })
    expect(new Set(threeByThree.items.slice(0, 3).map(({ y }) => y)).size).toBe(1)
    expect(new Set(threeByThree.items.slice(0, 3).map(({ x }) => x)).size).toBe(3)
  })

  test('trims and resamples decoded PCM before encoding a playable WAV', () => {
    const source = [Float32Array.from([0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25])]
    const processed = sliceAndResampleChannels(source, 8, {
      startSeconds: 0.25,
      endSeconds: 0.75,
      playbackRate: 2,
    })
    expect(processed[0]).toHaveLength(2)
    const wav = encodePcm16Wav(processed, 8)
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF')
    expect(wavDurationSeconds(wav)).toBeCloseTo(0.25, 4)
  })
})
