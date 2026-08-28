import { expect, test, vi } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject, getTimelineDuration, resolveTimelineClips } from './timeline-project'
import { exportTimelineVideo, type CompositionRuntime } from './timeline-render-export'

function harness() {
  const project = makeProjectFixture(), timeline = createTimelineProject(project)
  const prepared = { render: vi.fn(async (_seconds: number) => {}), encode: vi.fn(async (_seconds: number, _duration: number) => {}), flush: vi.fn(async () => new Blob(['encoded-webm'])), dispose: vi.fn(async () => {}) }
  const runtime: CompositionRuntime = { prepare: vi.fn(async () => prepared), yieldControl: vi.fn(async () => {}) }
  return { timeline, resolved: resolveTimelineClips(timeline, project), runtime, prepared }
}

test('local composition renders to completion with progress and releases all resources', async () => {
  const h = harness(), onProgress = vi.fn()
  const blob = await exportTimelineVideo(h.timeline, h.resolved, { signal: new AbortController().signal, onProgress }, h.runtime)
  expect(blob.size).toBeGreaterThan(0)
  expect(h.prepared.flush).toHaveBeenCalledOnce()
  expect(h.prepared.dispose).toHaveBeenCalledOnce()
  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'rendering' }))
  expect(onProgress.mock.calls.at(-1)![0]).toEqual({ phase: 'complete', fraction: 1 })
})

test('final captured frame is flushed before returning the completed artifact', async () => {
  const h = harness()
  let finish: (blob: Blob) => void = () => {}
  h.prepared.flush.mockImplementation(() => new Promise<Blob>(resolve => { finish = resolve }))
  const pending = exportTimelineVideo(h.timeline, h.resolved, { signal: new AbortController().signal }, h.runtime)
  await vi.waitFor(() => expect(h.prepared.flush).toHaveBeenCalledOnce())
  expect(h.prepared.dispose).not.toHaveBeenCalled()
  finish(new Blob(['complete']))
  await pending
  expect(h.prepared.dispose).toHaveBeenCalledOnce()
})

test('encoder backpressure never skips timestamps or truncates the final frame', async () => {
  const h = harness()
  h.prepared.encode.mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 1)) })
  await exportTimelineVideo(h.timeline, h.resolved, { signal: new AbortController().signal }, h.runtime)
  const frames = h.prepared.encode.mock.calls
  expect(frames.length).toBeGreaterThan(1)
  for (let index = 0; index < frames.length; index++) {
    expect(frames[index][0]).toBe(index / h.timeline.frameRate)
    expect(frames[index][1]).toBeGreaterThan(0)
    expect(h.prepared.render.mock.calls[index][0]).toBe(frames[index][0])
  }
  const duration = getTimelineDuration(h.timeline)
  expect(frames.at(-1)![0] + frames.at(-1)![1]).toBeCloseTo(duration)
})

test('cancellation drops partial output and disposes the encoder', async () => {
  const h = harness(), controller = new AbortController()
  h.prepared.encode.mockImplementationOnce(async () => { controller.abort() })
  await expect(exportTimelineVideo(h.timeline, h.resolved, { signal: controller.signal }, h.runtime)).rejects.toMatchObject({ name: 'AbortError' })
  expect(h.prepared.flush).not.toHaveBeenCalled()
  expect(h.prepared.dispose).toHaveBeenCalledOnce()
})

test('cancellation interrupts encoder backpressure without waiting for the queued frame', async () => {
  const h = harness(), controller = new AbortController()
  let release: () => void = () => {}
  h.prepared.encode.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
  const pending = exportTimelineVideo(h.timeline, h.resolved, { signal: controller.signal }, h.runtime)
  const settled = pending.then(() => 'completed', error => error instanceof DOMException ? error.name : 'error')
  await vi.waitFor(() => expect(h.prepared.encode).toHaveBeenCalledOnce())
  controller.abort()
  try {
    await vi.waitFor(() => expect(h.prepared.dispose).toHaveBeenCalledOnce(), { timeout: 100 })
    expect(await settled).toBe('AbortError')
    expect(h.prepared.flush).not.toHaveBeenCalled()
  } finally { release(); await settled }
})

test('decode/render errors fail explicitly and release without successful output', async () => {
  const h = harness()
  h.prepared.render.mockRejectedValueOnce(new Error('decode failure'))
  await expect(exportTimelineVideo(h.timeline, h.resolved, { signal: new AbortController().signal }, h.runtime)).rejects.toThrow('decode failure')
  expect(h.prepared.dispose).toHaveBeenCalledOnce()
  expect(h.prepared.encode).not.toHaveBeenCalled()
})

test('already aborted and empty timelines never prepare media', async () => {
  const h = harness(), controller = new AbortController(); controller.abort()
  await expect(exportTimelineVideo(h.timeline, h.resolved, { signal: controller.signal }, h.runtime)).rejects.toMatchObject({ name: 'AbortError' })
  await expect(exportTimelineVideo({ ...h.timeline, tracks: [] }, { visual: [], audio: [], subtitles: [] }, { signal: new AbortController().signal }, h.runtime)).rejects.toThrow('时间线为空')
  expect(h.runtime.prepare).not.toHaveBeenCalled()
})

test('encoder failure and empty output never publish a partial artifact', async () => {
  for (const failure of ['encode', 'flush', 'empty'] as const) {
    const h = harness()
    if (failure === 'empty') h.prepared.flush.mockResolvedValueOnce(new Blob())
    else h.prepared[failure].mockRejectedValueOnce(new Error('encode failure'))
    await expect(exportTimelineVideo(h.timeline, h.resolved, { signal: new AbortController().signal }, h.runtime)).rejects.toThrow()
    expect(h.prepared.dispose).toHaveBeenCalledOnce()
  }
})

test('a cancelled late preparation is released and never starts encoding', async () => {
  const h = harness(), controller = new AbortController()
  h.runtime.prepare = async () => { controller.abort(); return h.prepared }
  await expect(exportTimelineVideo(h.timeline, h.resolved, { signal: controller.signal }, h.runtime)).rejects.toMatchObject({ name: 'AbortError' })
  expect(h.prepared.dispose).toHaveBeenCalledOnce()
  expect(h.prepared.encode).not.toHaveBeenCalled()
})
