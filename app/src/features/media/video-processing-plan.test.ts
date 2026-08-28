import { expect, test } from 'vitest'
import { videoProcessingPlan } from './video-processing-plan'

test('crop, rotation and playback speed change actual dimensions and output duration', () => {
  expect(videoProcessingPlan({ width: 1280, height: 720, duration: 10 }, { startSeconds: 2, endSeconds: 8, crop: { x: 0.25, y: 0, width: 0.5, height: 1 }, rotationQuarterTurns: 1, playbackRate: 2, mirrorHorizontal: true })).toMatchObject({ width: 720, height: 640, durationSeconds: 3, playbackRate: 2, rotation: 1, mirrorHorizontal: true, crop: { x: 320, y: 0, width: 640, height: 720 } })
})
test('pip and three-panel layouts are deterministic and stay within the output', () => {
  const input = { width: 1200, height: 600, duration: 2 }
  expect(videoProcessingPlan(input, { startSeconds: 0, endSeconds: 2, layout: 'triple' }).layers).toEqual([{ x: 0, y: 0, width: 400, height: 600 }, { x: 400, y: 0, width: 400, height: 600 }, { x: 800, y: 0, width: 400, height: 600 }])
  expect(videoProcessingPlan(input, { startSeconds: 0, endSeconds: 2, layout: 'pip' }).layers).toHaveLength(2)
})
test.each([{ startSeconds: 2, endSeconds: 1 }, { startSeconds: 0, endSeconds: 3, playbackRate: 0 }, { startSeconds: NaN, endSeconds: 1 }, { startSeconds: 0, endSeconds: 1, crop: { x: 0.9, y: 0, width: 0.5, height: 1 } }])('rejects invalid processing options %j', options => {
  expect(() => videoProcessingPlan({ width: 1280, height: 720, duration: 3 }, options)).toThrow()
})
