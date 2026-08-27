import { expect, test, vi } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject } from './timeline-project'
import * as compatibility from './timeline-project'
import { canvasTimelineCandidate, libraryTimelineCandidate, resolveTimelineClips } from './timeline-sources'
import { clipDuration } from './timeline-math'
import { activeAt, allClips, candidateSources } from './timeline-selectors'
import { buildTimelineDownload, serializeTimelineEdl, serializeTimelineJson } from './timeline-serialization'

test('source and math extraction preserve the public exports and immutable resolution', () => {
  expect(compatibility.canvasTimelineCandidate).toBe(canvasTimelineCandidate)
  expect(compatibility.libraryTimelineCandidate).toBe(libraryTimelineCandidate)
  expect(compatibility.resolveTimelineClips).toBe(resolveTimelineClips)
  expect(compatibility.clipDuration).toBe(clipDuration)
  const project = makeProjectFixture(), timeline = createTimelineProject(project)
  const snapshot = JSON.stringify({ project, timeline })
  const result = resolveTimelineClips(timeline, project)
  expect(result.visual[0]).toMatchObject({ missing: false, aspectRatio: '16:9', startSeconds: 0, endSeconds: 8 })
  expect(clipDuration({ ...result.visual[0].clip, playbackRate: 2 })).toBe(4)
  expect(JSON.stringify({ project, timeline })).toBe(snapshot)
})

test('candidate and active selection use the same order without adding owned state', () => {
  const project = makeProjectFixture(), timeline = createTimelineProject(project)
  const candidates = candidateSources(project, [])
  expect(candidates.map(item => item.id)).toEqual(['node:shot-1', 'node:rain-audio'])
  expect(allClips(timeline)).toHaveLength(2)
  const visual = resolveTimelineClips(timeline, project).visual
  expect(activeAt(visual, undefined, 8)).toBe(visual[0])
  expect(activeAt(visual, 'unknown', 100)).toBe(visual[0])
  expect(activeAt([], undefined, 0)).toBeUndefined()
})

test('source resolution preserves video-node semantics and missing source fallbacks', () => {
  const project = makeProjectFixture()
  project.nodes[0].kind = 'video'
  expect(canvasTimelineCandidate(project, 'shot-1')?.kind).toBe('video')
  expect(canvasTimelineCandidate(project, 'unknown')).toBeUndefined()
  const timeline = createTimelineProject(project)
  project.assets = []
  timeline.tracks[0].clips[0].source.url = undefined
  expect(resolveTimelineClips(timeline, project).visual[0].missing).toBe(true)
})

test('JSON and EDL descriptors preserve serialized content, filename, MIME and feedback', () => {
  vi.useFakeTimers()
  try {
    vi.setSystemTime(new Date('2026-08-27T10:00:00Z'))
    const timeline = createTimelineProject(makeProjectFixture())
    expect(buildTimelineDownload(timeline, 'json')).toEqual({ content: serializeTimelineJson(timeline), filename: '霜河渡剪辑.json', mimeType: 'application/json', feedback: 'JSON 已开始下载' })
    expect(buildTimelineDownload(timeline, 'edl')).toEqual({ content: serializeTimelineEdl(timeline), filename: '霜河渡剪辑.edl', mimeType: 'text/plain', feedback: 'EDL 已开始下载' })
    expect(JSON.parse(buildTimelineDownload(timeline, 'json').content)).toMatchObject({ format: 'wireless-canvas-timeline', version: 1, exportedAt: '2026-08-27T10:00:00.000Z', project: timeline })
  } finally { vi.useRealTimers() }
})
