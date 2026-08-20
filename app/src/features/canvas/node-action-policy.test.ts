import { describe, expect, test } from 'vitest'

import { primaryActionsForNode } from './node-action-policy'

describe('canvas node action policy', () => {
  test('keeps structured card editing but removes the old generic generation actions', () => {
    expect(primaryActionsForNode('script', false)).toEqual([
      { action: 'edit-card', label: '编辑卡片' },
    ])
    expect(primaryActionsForNode('character-card', false)).toEqual([
      { action: 'edit-card', label: '编辑卡片' },
    ])
    expect(primaryActionsForNode('worldview', false)).toEqual([
      { action: 'edit-card', label: '编辑卡片' },
    ])
    for (const kind of ['text', 'image', 'character', 'scene', 'preview'] as const) {
      expect(primaryActionsForNode(kind, true)).toEqual([])
    }
  })

  test('keeps timeline eligibility gated by a storyboard or video asset', () => {
    expect(primaryActionsForNode('storyboard', false)).toEqual([])
    expect(primaryActionsForNode('storyboard', true)).toEqual([
      { action: 'add-to-timeline', label: '加入时间线' },
    ])
    expect(primaryActionsForNode('video', false)).toEqual([])
    expect(primaryActionsForNode('video', true)).toEqual([
      { action: 'add-to-timeline', label: '加入时间线' },
    ])
  })
})
