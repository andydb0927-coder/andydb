import { afterEach, expect, test, vi } from 'vitest'
import { audioProcessingErrorMessage, audioProcessingPlan, renderAudioEffects } from './audio-processing'

afterEach(() => vi.unstubAllGlobals())

test('local audio errors keep actionable Chinese feedback without exposing URLs or raw decoder details', () => {
  expect(audioProcessingErrorMessage(new Error('音频入点无效。'))).toBe('音频入点无效。')
  expect(audioProcessingErrorMessage(new TypeError('Failed to fetch'))).toContain('音频处理失败')
  expect(audioProcessingErrorMessage(new Error('读取失败 https://fixture.invalid/private?token=fixture'))).not.toContain('fixture.invalid')
})

test('calculates output duration, peak normalization and non-overlapping fade envelope', () => {
  const plan = audioProcessingPlan([new Float32Array([0.1, -0.5, 0.25, 0])], 2, { startSeconds: 0, endSeconds: 2, playbackRate: 2, fadeInSeconds: 0.25, fadeOutSeconds: 0.25, normalize: true })
  expect(plan.durationSeconds).toBe(1)
  expect(plan.gain).toBeCloseTo(10 ** (-1 / 20) / 0.5)
  expect(plan.envelope).toEqual([{ time: 0, value: 0 }, { time: 0.25, value: plan.gain }, { time: 0.75, value: plan.gain }, { time: 1, value: 0 }])
})

test('silence stays silent and overlapping fades are proportionally shortened', () => {
  const plan = audioProcessingPlan([new Float32Array(100)], 100, { startSeconds: 0, endSeconds: 1, playbackRate: 1, normalize: true, fadeInSeconds: 2, fadeOutSeconds: 2 })
  expect(plan.gain).toBe(1)
  expect(plan.envelope).toEqual([{ time: 0, value: 0 }, { time: 0.5, value: 1 }, { time: 0.5, value: 1 }, { time: 1, value: 0 }])
})

test('normalization measures the faded signal, not peaks that the fade removes', () => {
  const samples = new Float32Array(100).fill(0.5)
  samples[0] = 1
  samples[99] = 1
  const plan = audioProcessingPlan([samples], 100, { startSeconds: 0, endSeconds: 1, playbackRate: 1, fadeInSeconds: 0.2, fadeOutSeconds: 0.2, normalize: true })
  expect(plan.gain).toBeCloseTo(10 ** (-1 / 20) / 0.5)
})

test.each([
  { startSeconds: 2, endSeconds: 1, playbackRate: 1 },
  { startSeconds: -1, endSeconds: 1, playbackRate: 1 },
  { startSeconds: 0, endSeconds: 1, playbackRate: NaN },
  { startSeconds: 0, endSeconds: 1, playbackRate: 3 },
  { startSeconds: 0, endSeconds: 1, playbackRate: 1, fadeInSeconds: -1 },
])('rejects invalid editing inputs instead of producing corrupt WAV (%j)', options => {
  expect(() => audioProcessingPlan([new Float32Array(100)], 100, options)).toThrow()
})

test('offline rendering schedules gain ramps, preserves channel balance and honours AbortSignal', async () => {
  const setValueAtTime = vi.fn()
  const linearRampToValueAtTime = vi.fn()
  const start = vi.fn()
  const startRendering = vi.fn(async () => ({ numberOfChannels: 2, getChannelData: () => new Float32Array(100) }))
  class OfflineFixture {
    destination = {}
    createBuffer() { return { copyToChannel: vi.fn() } }
    createBufferSource() { return { buffer: null, connect: vi.fn(), start } }
    createGain() { return { connect: vi.fn(), gain: { setValueAtTime, linearRampToValueAtTime } } }
    startRendering = startRendering
  }
  vi.stubGlobal('OfflineAudioContext', OfflineFixture)
  const channels = [new Float32Array(100).fill(0.5), new Float32Array(100).fill(0.25)]
  const result = await renderAudioEffects(channels, 100, { fadeInSeconds: 0.1, fadeOutSeconds: 0.1, normalize: true })
  expect(result).toHaveLength(2)
  expect(setValueAtTime).toHaveBeenCalledWith(0, 0)
  expect(linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.99)
  expect(start).toHaveBeenCalledOnce()
  expect(startRendering).toHaveBeenCalledOnce()
  const controller = new AbortController()
  controller.abort()
  await expect(renderAudioEffects(channels, 100, {}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(startRendering).toHaveBeenCalledOnce()
})
