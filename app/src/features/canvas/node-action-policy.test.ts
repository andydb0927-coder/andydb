import { describe, expect, test } from 'vitest'

import type { NodeKind } from '../project/model'
import { primaryActionsForNode } from './node-action-policy'

const existingActions = [
  { action: 'regenerate', label: '重生成' },
  { action: 'extend-shot', label: '扩展镜头' },
  { action: 'generate-video', label: '生成视频' },
] as const

describe('canvas node action policy', () => {
  test('offers text nodes only the compatible storyboard action', () => {
    expect(primaryActionsForNode('text', false)).toEqual([
      { action: 'extend-shot', label: '生成分镜' },
    ])
  })

  test('offers image nodes only the compatible video action', () => {
    expect(primaryActionsForNode('image', true)).toEqual([
      { action: 'generate-video', label: '生成视频' },
    ])
  })

  test.each([
    'script',
    'character-card',
    'worldview',
  ] satisfies NodeKind[])(
    'offers %s nodes only the structured card editor action',
    (kind) => {
      expect(primaryActionsForNode(kind, false)).toEqual([
        { action: 'edit-card', label: '编辑卡片' },
      ])
    },
  )

  test.each([
    'character',
    'scene',
    'preview',
  ] satisfies NodeKind[])(
    'preserves the existing primary actions for %s nodes',
    (kind) => {
      expect(primaryActionsForNode(kind, false)).toEqual(existingActions)
    },
  )

  test('keeps timeline eligibility gated by a storyboard or video asset', () => {
    expect(primaryActionsForNode('storyboard', false)).toEqual(existingActions)
    expect(primaryActionsForNode('storyboard', true)).toEqual([
      { action: 'add-to-timeline', label: '加入时间线' },
      ...existingActions,
    ])
    expect(primaryActionsForNode('video', false)).toEqual(existingActions)
    expect(primaryActionsForNode('video', true)).toEqual([
      { action: 'add-to-timeline', label: '加入时间线' },
      ...existingActions,
    ])
  })
})
