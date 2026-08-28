import { describe, expect, test, vi } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { addClip, addSubtitleClip, createTimelineProject, resolveTimelineClips, splitClip, updateClipPlaybackRate } from './timeline-project'
import { addAudioTrack, assignClipLanes, editSubtitle, setAudioEnvelope, setClipPlacement, setTransition } from './timeline-editing'
import { framePlan, gainAt, normalizeSubtitleStyle } from './timeline-composition'
import { serializeTimelineJson } from './timeline-serialization'
import { scheduleCompositionAudio } from './timeline-browser-composition'

function setup() {
  const project = { ...makeProjectFixture(), timeline: [] }
  let timeline = createTimelineProject(project)
  for (const name of ['红', '蓝']) timeline = addClip(timeline, { id: name, name, kind: 'image', durationSeconds: 4, source: { type: 'library-asset', url: `/${name}.png`, mimeType: 'image/png' } })
  return { project, timeline, clips: timeline.tracks.find(t => t.kind === 'image')!.clips }
}

describe('timeline composition contracts', () => {
  test('dissolve holds the previous final frame without moving timeline boundaries', () => {
    const { project, timeline, clips } = setup()
    const edited = setTransition(timeline, clips[1].id, { kind: 'dissolve', durationSeconds: 2 })
    const plan = framePlan(resolveTimelineClips(edited, project), 5)
    expect(plan.layers.map(l => [l.item.clip.name, l.opacity])).toEqual([['红', 1], ['蓝', 0.5]])
    expect(plan.layers[0].mediaTime).toBeCloseTo(4 - 1 / 24)
    expect(edited.tracks.find(t => t.kind === 'image')!.clips[1].startSeconds).toBe(4)
    expect(clips[1].transitionIn).toBeUndefined()
  })
  test('fade and black have distinct fade envelopes and respect gaps', () => {
    const { project, timeline, clips } = setup()
    const fade = resolveTimelineClips(setTransition(timeline, clips[1].id, { kind: 'fade', durationSeconds: 2 }), project)
    expect(framePlan(fade, 3.5).layers[0].opacity).toBeCloseTo(0.5)
    expect(framePlan(fade, 4.5).layers[0].opacity).toBeCloseTo(0.5)
    const black = resolveTimelineClips(setTransition(timeline, clips[1].id, { kind: 'black', durationSeconds: 2 }), project)
    expect(framePlan(black, 4.1).layers[0].opacity).toBe(0)
    expect(framePlan(fade, 8.5).layers).toEqual([])
  })
  test('transition duration clamps to adjacent clips and invalid numbers do not mutate', () => {
    const { timeline, clips } = setup()
    expect(setTransition(timeline, clips[0].id, { kind: 'fade', durationSeconds: 1 })).toBe(timeline)
    expect(setTransition(timeline, clips[1].id, { kind: 'fade', durationSeconds: NaN })).toBe(timeline)
    const next = setTransition(timeline, clips[1].id, { kind: 'fade', durationSeconds: 20 })
    expect(next.tracks.find(t => t.kind === 'image')!.clips[1].transitionIn?.durationSeconds).toBe(4)
  })
  test('subtitles edit interval and style with validated defaults and JSON persistence', () => {
    let { timeline, project } = setup()
    timeline = addSubtitleClip(timeline, '清晨', 0, 2)
    const clip = timeline.tracks.find(t => t.kind === 'subtitle')!.clips[0]
    timeline = editSubtitle(timeline, clip.id, { text: '清晨\n古桥', startSeconds: 1, endSeconds: 3, style: { fontSize: 64, color: '#ffcc00', background: '#000000', position: 'top', bold: true } })
    expect(framePlan(resolveTimelineClips(timeline, project), 0).subtitles).toEqual([])
    expect(framePlan(resolveTimelineClips(timeline, project), 1).subtitles[0].text).toBe('清晨\n古桥')
    expect(JSON.parse(serializeTimelineJson(timeline)).project).toEqual(timeline)
    expect(normalizeSubtitleStyle({ fontSize: NaN, color: 'url(invalid)' })).toMatchObject({ fontSize: 64, color: '#ffffff' })
    expect(editSubtitle(timeline, clip.id, { text: '', startSeconds: 4, endSeconds: 3 })).toBe(timeline)
  })
  test('audio keyframes interpolate linearly, deduplicate times, and clamp boundaries', () => {
    expect(gainAt(undefined, 2)).toBe(1)
    const points = [{ timeSeconds: 0, value: 0 }, { timeSeconds: 2, value: 1 }, { timeSeconds: 4, value: 0.5 }]
    expect(gainAt(points, 1)).toBe(0.5)
    expect(gainAt(points, 3)).toBe(0.75)
    expect(gainAt(points, -1)).toBe(0)
    expect(gainAt(points, 99)).toBe(0.5)
  })
  test('Web Audio schedules all tracks at absolute timeline offsets with linear gain ramps and stops them', () => {
    const { project, timeline } = setup()
    const base = resolveTimelineClips(timeline, project).visual[0]
    const source = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), playbackRate: { value: 1 }, buffer: null })
    const gain = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } })
    const sources = [source(), source()], gains = [gain(), gain()]
    const context = { currentTime: 10, createBufferSource: vi.fn().mockReturnValueOnce(sources[0]).mockReturnValueOnce(sources[1]), createGain: vi.fn().mockReturnValueOnce(gains[0]).mockReturnValueOnce(gains[1]) } as unknown as AudioContext
    const items = sources.map((_, i) => ({ item: { ...base, clip: { ...base.clip, startSeconds: i, sourceInSeconds: 1, sourceOutSeconds: 5, playbackRate: 2, volumeKeyframes: [{ timeSeconds: 0, value: 0 }, { timeSeconds: 2, value: 1 }] } }, buffer: {} as AudioBuffer }))
    const stop = scheduleCompositionAudio(context, {} as AudioNode, items)
    expect(sources[0].start).toHaveBeenCalledWith(10, 1, 4)
    expect(sources[1].start).toHaveBeenCalledWith(11, 1, 4)
    expect(sources[0].playbackRate.value).toBe(2)
    expect(gains[1].gain.setValueAtTime).toHaveBeenCalledWith(0, 11)
    expect(gains[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 13)
    stop()
    for (const item of sources) { expect(item.stop).toHaveBeenCalledOnce(); expect(item.disconnect).toHaveBeenCalledOnce() }
  })
  test('independent audio tracks support aligned overlapping placements and envelope data', () => {
    let { timeline } = setup()
    const source = { id: 'music', name: '配乐', kind: 'audio' as const, durationSeconds: 4, source: { type: 'library-asset' as const, url: '/music.wav', mimeType: 'audio/wav' } }
    timeline = addClip(addClip(timeline, source), source)
    const clips = timeline.tracks.find(t => t.kind === 'audio')!.clips
    timeline = addAudioTrack(timeline)
    const second = timeline.tracks.filter(t => t.kind === 'audio')[1]
    timeline = setClipPlacement(timeline, clips[1].id, second.id, 0)
    timeline = setAudioEnvelope(timeline, clips[1].id, [{ timeSeconds: 2, value: 0.5 }, { timeSeconds: 0, value: 1 }])
    expect(timeline.tracks.find(t => t.id === second.id)!.clips[0]).toMatchObject({ startSeconds: 0, volumeKeyframes: [{ timeSeconds: 0, value: 1 }, { timeSeconds: 2, value: 0.5 }] })
    expect(setClipPlacement(timeline, clips[1].id, second.id, -1)).toBe(timeline)
    expect(setAudioEnvelope(timeline, clips[1].id, [{ timeSeconds: 1, value: Infinity }])).toBe(timeline)
  })
  test('overlapping clips reuse only a free lane, not the number of prior overlaps', () => {
    const { clips } = setup()
    const intervals = [[0, 10], [5, 20], [15, 25], [16, 18], [25, 26]]
    const overlapping = intervals.map(([start, end], order) => ({ ...clips[0], id: String(order), order, startSeconds: start, sourceInSeconds: 0, sourceOutSeconds: end - start }))
    expect(assignClipLanes(overlapping)).toEqual({ '0': 0, '1': 1, '2': 0, '3': 2, '4': 0 })
    expect(assignClipLanes([...overlapping].reverse())).toEqual(assignClipLanes(overlapping))
  })
  test('speed changes and splitting preserve source-aligned envelope values and locked placement', () => {
    let { timeline } = setup()
    timeline = addClip(timeline, { id: 'a', name: 'a', kind: 'audio', durationSeconds: 8, source: { type: 'library-asset', url: '/a.wav', mimeType: 'audio/wav' } })
    const clip = timeline.tracks.find(t => t.kind === 'audio')!.clips[0]
    timeline = setClipPlacement(timeline, clip.id, clip.trackId, 2)
    timeline = setAudioEnvelope(timeline, clip.id, [{ timeSeconds: 0, value: 0 }, { timeSeconds: 8, value: 1 }])
    timeline = updateClipPlaybackRate(timeline, clip.id, 2)
    expect(timeline.tracks.find(t => t.kind === 'audio')!.clips[0].volumeKeyframes?.at(-1)?.timeSeconds).toBe(4)
    timeline = splitClip(timeline, clip.id, 2)
    const [left, right] = timeline.tracks.find(t => t.kind === 'audio')!.clips
    expect(left.startSeconds).toBe(2); expect(right.startSeconds).toBe(4)
    expect(left.sourceOutSeconds).toBe(4); expect(right.sourceInSeconds).toBe(4)
    expect(gainAt(left.volumeKeyframes, 2)).toBeCloseTo(0.5)
    expect(gainAt(right.volumeKeyframes, 0)).toBeCloseTo(0.5)
    expect(gainAt(right.volumeKeyframes, 2)).toBeCloseTo(1)
  })
})
