import { afterEach, expect, test, vi } from 'vitest'
import { loadVideoElement, readVideoMetadata } from './browser-media-processing'

afterEach(() => vi.restoreAllMocks())

function videoFixture(finiteAfterSeek = true) {
  const video = document.createElement('video')
  let duration = Infinity
  let position = 0
  Object.defineProperties(video, {
    duration: { get: () => duration },
    videoWidth: { get: () => 320 },
    videoHeight: { get: () => 180 },
    readyState: { get: () => 2 },
    currentTime: { get: () => position, set: (value: number) => {
      if (value > 1000 && finiteAfterSeek) duration = 0.48
      position = Math.min(value, duration)
      queueMicrotask(() => video.dispatchEvent(new Event('seeked')))
    } },
  })
  const load = vi.spyOn(video, 'load').mockImplementation(() => {
    if (video.hasAttribute('src')) queueMicrotask(() => video.dispatchEvent(new Event('loadedmetadata')))
  })
  const create = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) => tag === 'video' ? video : create(tag, options))
  return { video, load }
}

test('recorded WebM without a duration header resolves real duration before re-editing', async () => {
  const { video } = videoFixture()
  expect(await loadVideoElement('data:video/webm;base64,fixture')).toBe(video)
  expect(video.duration).toBe(0.48)
  expect(video.currentTime).toBe(0)
})

test('unreadable WebM duration rejects safely and releases the source', async () => {
  const { video, load } = videoFixture(false)
  await expect(loadVideoElement('data:video/webm;base64,fixture')).rejects.toThrow('无法读取视频时长')
  expect(video.hasAttribute('src')).toBe(false)
  expect(load).toHaveBeenCalledTimes(2)
})

test('aborted media loading never starts a decode or retains a source', async () => {
  const { video } = videoFixture()
  const controller = new AbortController()
  controller.abort()
  await expect(loadVideoElement('data:video/webm;base64,fixture', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(video.hasAttribute('src')).toBe(false)
})

test('metadata probe reads true dimensions and releases its decoder', async () => {
  const { video, load } = videoFixture()
  const pause = vi.spyOn(video, 'pause').mockImplementation(() => undefined)
  expect(await readVideoMetadata('data:video/webm;base64,fixture', new AbortController().signal)).toEqual({ width: 320, height: 180, duration: 0.48 })
  expect(video.hasAttribute('src')).toBe(false)
  expect(pause).toHaveBeenCalled()
  expect(load).toHaveBeenCalledTimes(2)
})
