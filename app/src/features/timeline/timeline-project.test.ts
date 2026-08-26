import { describe, expect, test } from 'vitest'

import type { LibraryAssetRecord } from '../assets/library-model'
import { makeProjectFixture } from '../../test/fixtures'
import {
  addClip,
  addSubtitleClip,
  canvasTimelineCandidate,
  createTimelineProject,
  deleteClip,
  getTimelineDuration,
  libraryTimelineCandidate,
  mergeLegacyTimeline,
  moveClip,
  resolveTimelineClips,
  splitClip,
  updateClipLayout,
  updateClipPlaybackRate,
  trimClip,
  type TimelineEnvironment,
} from './timeline-project'

function environment(ids = ['timeline-project', 'clip-1', 'clip-2']) {
  let index = 0
  return {
    now: () => '2026-08-13T12:00:00.000Z',
    randomId: () => ids[index++] ?? `id-${index}`,
  } satisfies TimelineEnvironment
}

describe('professional timeline aggregate', () => {
  test('creates four named tracks and migrates legacy items without duplicates', () => {
    const project = makeProjectFixture()
    const timeline = createTimelineProject(project, environment())

    expect(timeline.tracks.map(({ kind }) => kind)).toEqual([
      'video',
      'audio',
      'image',
      'subtitle',
    ])
    expect(timeline.tracks.flatMap(({ clips }) => clips)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'timeline-shot-1',
          kind: 'image',
          legacyTimelineItemId: 'timeline-shot-1',
          sourceInSeconds: 0,
          sourceOutSeconds: 8,
        }),
        expect.objectContaining({
          id: 'timeline-rain-audio',
          kind: 'audio',
          legacyTimelineItemId: 'timeline-rain-audio',
          sourceOutSeconds: 12,
        }),
      ]),
    )

    expect(mergeLegacyTimeline(timeline, project, environment())).toBe(timeline)
  })

  test('adds canvas and library sources to matching track ends without mutating input', () => {
    const project = makeProjectFixture()
    const original = createTimelineProject({ ...project, timeline: [] }, environment())
    const canvasCandidate = canvasTimelineCandidate(project, 'shot-1')
    const record: LibraryAssetRecord = {
      id: 'library-video',
      name: '屋顶奔跑',
      kind: 'video',
      mimeType: 'video/mp4',
      url: '/demo/roof.mp4',
      durationSeconds: 6,
      createdAt: '2026-08-13T10:00:00.000Z',
      source: 'upload',
    }

    const withCanvas = addClip(original, canvasCandidate!, environment(['canvas']))
    const withLibrary = addClip(
      withCanvas,
      libraryTimelineCandidate(record),
      environment(['library']),
    )

    expect(original.tracks.every(({ clips }) => clips.length === 0)).toBe(true)
    expect(
      withLibrary.tracks.find(({ kind }) => kind === 'image')?.clips[0],
    ).toMatchObject({ id: 'canvas', name: '河岸寻人', kind: 'image' })
    expect(
      withLibrary.tracks.find(({ kind }) => kind === 'video')?.clips[0],
    ).toMatchObject({
      id: 'library',
      name: '屋顶奔跑',
      sourceOutSeconds: 6,
      source: { type: 'library-asset', assetId: 'library-video' },
    })
  })

  test('reorders a track and packs starts while preserving other tracks', () => {
    const project = makeProjectFixture()
    project.assets.push({
      id: 'video-2',
      kind: 'video',
      mimeType: 'video/mp4',
      url: '/two.mp4',
      durationSeconds: 4,
    })
    const base = createTimelineProject({ ...project, timeline: [] }, environment())
    const record = (id: string, durationSeconds: number): LibraryAssetRecord => ({
      id,
      name: id,
      kind: 'video',
      mimeType: 'video/mp4',
      url: `/${id}.mp4`,
      durationSeconds,
      createdAt: '2026-08-13T10:00:00.000Z',
      source: 'upload',
    })
    const first = addClip(base, libraryTimelineCandidate(record('one', 3)), environment(['one']))
    const second = addClip(first, libraryTimelineCandidate(record('two', 4)), environment(['two']))

    const moved = moveClip(second, 'two', -1, environment())
    const video = moved.tracks.find(({ kind }) => kind === 'video')!

    expect(video.clips.map(({ id, order, startSeconds }) => ({ id, order, startSeconds }))).toEqual([
      { id: 'two', order: 0, startSeconds: 0 },
      { id: 'one', order: 1, startSeconds: 4 },
    ])
    expect(second.tracks.find(({ kind }) => kind === 'video')?.clips.map(({ id }) => id)).toEqual(['one', 'two'])
  })

  test('trims, splits, and deletes clips with immutable source time', () => {
    const base = createTimelineProject(
      { ...makeProjectFixture(), timeline: [] },
      environment(),
    )
    const record: LibraryAssetRecord = {
      id: 'source',
      name: '长镜头',
      kind: 'video',
      mimeType: 'video/mp4',
      url: '/source.mp4',
      durationSeconds: 10,
      createdAt: '2026-08-13T10:00:00.000Z',
      source: 'upload',
    }
    const inserted = addClip(base, libraryTimelineCandidate(record), environment(['clip']))
    const trimmed = trimClip(inserted, 'clip', 2, 8, environment())
    const split = splitClip(trimmed, 'clip', 3, environment(['clip-b']))
    const clips = split.tracks.find(({ kind }) => kind === 'video')!.clips

    expect(clips).toEqual([
      expect.objectContaining({
        id: 'clip',
        sourceInSeconds: 2,
        sourceOutSeconds: 5,
        startSeconds: 0,
      }),
      expect.objectContaining({
        id: 'clip-b',
        sourceInSeconds: 5,
        sourceOutSeconds: 8,
        startSeconds: 3,
      }),
    ])
    expect(deleteClip(split, 'clip', environment()).tracks.find(({ kind }) => kind === 'video')!.clips[0]).toMatchObject({
      id: 'clip-b',
      order: 0,
      startSeconds: 0,
    })
    expect(trimClip(trimmed, 'clip', 8, 2, environment())).toBe(trimmed)
    expect(splitClip(trimmed, 'clip', 0, environment())).toBe(trimmed)
  })

  test('adds subtitle clips and resolves visual gaps, active assets, and total duration', () => {
    const project = makeProjectFixture()
    const base = createTimelineProject(project, environment())
    const withSubtitle = addSubtitleClip(
      base,
      '雨一直下',
      2,
      3,
      environment(['subtitle']),
    )
    const resolved = resolveTimelineClips(withSubtitle, project)

    expect(withSubtitle.tracks.find(({ kind }) => kind === 'subtitle')?.clips[0]).toMatchObject({
      id: 'subtitle',
      text: '雨一直下',
      startSeconds: 2,
      sourceOutSeconds: 3,
    })
    expect(resolved.visual[0]).toMatchObject({
      clip: { id: 'timeline-shot-1' },
      asset: { id: 'asset-shot-river-v1' },
      missing: false,
      startSeconds: 0,
      endSeconds: 8,
    })
    expect(getTimelineDuration(withSubtitle)).toBe(12)
  })

  test('persists 0.25x-4x playback rates and repacks real timeline duration', () => {
    const base = createTimelineProject(
      { ...makeProjectFixture(), timeline: [] },
      environment(),
    )
    const record: LibraryAssetRecord = {
      id: 'speed-source',
      name: '变速镜头',
      kind: 'video',
      mimeType: 'video/mp4',
      url: '/speed.mp4',
      durationSeconds: 8,
      createdAt: '2026-08-13T10:00:00.000Z',
      source: 'upload',
    }
    const inserted = addClip(base, libraryTimelineCandidate(record), environment(['speed']))
    const fast = updateClipPlaybackRate(inserted, 'speed', 4, environment())

    expect(fast.tracks.find(({ kind }) => kind === 'video')?.clips[0]).toMatchObject({
      playbackRate: 4,
      startSeconds: 0,
    })
    expect(getTimelineDuration(fast)).toBe(2)
    expect(updateClipPlaybackRate(fast, 'speed', 4.25, environment())).toBe(fast)
  })

  test('persists picture-in-picture and thirds layout geometry', () => {
    const base = createTimelineProject(makeProjectFixture(), environment())
    const clipId = base.tracks.find(({ clips }) => clips.length)?.clips[0].id
    const pip = updateClipLayout(base, clipId!, {
      mode: 'picture-in-picture',
      x: 0.68,
      y: 0.62,
      width: 0.28,
      height: 0.3,
      slot: 'overlay',
    }, environment())
    const thirds = updateClipLayout(pip, clipId!, {
      mode: 'thirds',
      x: 1 / 3,
      y: 0,
      width: 1 / 3,
      height: 1,
      slot: 'center',
    }, environment())

    expect(thirds.tracks.flatMap(({ clips }) => clips).find(({ id }) => id === clipId)?.layout).toEqual({
      mode: 'thirds',
      x: 1 / 3,
      y: 0,
      width: 1 / 3,
      height: 1,
      slot: 'center',
    })
  })
})
