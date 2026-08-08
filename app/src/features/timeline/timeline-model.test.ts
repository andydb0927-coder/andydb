import { describe, expect, test } from 'vitest'

import type { Project, TimelineItem } from '../project/model'
import {
  getTimelineDuration,
  reorderTimeline,
  resolveTimeline,
} from './timeline-model'

const first: TimelineItem = {
  id: 'timeline-video-1',
  nodeId: 'video-1',
  order: 0,
  durationSeconds: 3,
  track: 'video',
}

const second: TimelineItem = {
  id: 'timeline-video-2',
  nodeId: 'video-2',
  order: 1,
  durationSeconds: 5,
  track: 'video',
}

describe('timeline model', () => {
  test('catches a reorder that mutates the source array or leaves stale order values', () => {
    const original = [first, second]

    const reordered = reorderTimeline(original, 1, 0)

    expect(reordered.map((item) => item.nodeId)).toEqual([
      'video-2',
      'video-1',
    ])
    expect(original.map((item) => item.nodeId)).toEqual([
      'video-1',
      'video-2',
    ])
    expect(reordered.map((item) => item.order)).toEqual([0, 1])
    expect(reordered[0]).not.toBe(second)
  })

  test('catches an out-of-bounds reorder that corrupts the timeline', () => {
    const original = [first, second]

    expect(reorderTimeline(original, -1, 0)).toBe(original)
    expect(reorderTimeline(original, 0, 2)).toBe(original)
  })

  test('catches a duration total that mixes audio with the video sequence', () => {
    const audio: TimelineItem = {
      id: 'timeline-audio',
      nodeId: 'audio-1',
      order: 2,
      durationSeconds: 20,
      track: 'audio',
    }

    expect(getTimelineDuration([second, audio, first])).toBe(8)
  })

  test('catches missing origin nodes being silently removed instead of preserved as gaps', () => {
    const project = {
      nodes: [],
      assets: [],
      timeline: [first],
    } as Pick<Project, 'nodes' | 'assets' | 'timeline'>

    expect(resolveTimeline(project)).toEqual([
      expect.objectContaining({
        item: first,
        missing: true,
        startSeconds: 0,
        endSeconds: 3,
      }),
    ])
  })
})
