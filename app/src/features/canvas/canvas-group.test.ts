import { describe, expect, test } from 'vitest'

import type { CanvasGroup } from '../project/model'
import {
  findSelectedCanvasGroup,
  measureCanvasGroup,
} from './canvas-group'

const group: CanvasGroup = {
  id: 'group-1',
  title: '分组 01',
  nodeIds: ['a', 'b'],
  createdAt: '2026-08-13T08:00:00.000Z',
  updatedAt: '2026-08-13T08:00:00.000Z',
}

describe('canvas group geometry', () => {
  test('measures a padded box from live node positions and dimensions', () => {
    expect(measureCanvasGroup(group, [
      { id: 'a', position: { x: 100, y: 200 }, measured: { width: 240, height: 160 } },
      { id: 'b', position: { x: 500, y: 420 }, measured: { width: 300, height: 200 } },
    ])).toEqual({ x: 68, y: 146, width: 764, height: 506 })
  })

  test('uses safe fallback sizes and suppresses a group with fewer than two live nodes', () => {
    expect(measureCanvasGroup(group, [
      { id: 'a', position: { x: 100, y: 200 } },
      { id: 'b', position: { x: 500, y: 420 } },
    ])).toEqual({ x: 68, y: 146, width: 744, height: 486 })
    expect(measureCanvasGroup(group, [
      { id: 'a', position: { x: 100, y: 200 } },
    ])).toBeUndefined()
  })

  test('finds a group only when the current selection matches every member exactly', () => {
    expect(findSelectedCanvasGroup([group], new Set(['b', 'a']))).toEqual(group)
    expect(findSelectedCanvasGroup([group], new Set(['a']))).toBeUndefined()
    expect(findSelectedCanvasGroup([group], new Set(['a', 'b', 'c']))).toBeUndefined()
  })
})
