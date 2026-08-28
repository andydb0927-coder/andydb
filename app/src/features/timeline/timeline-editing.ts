import { clipDuration } from './timeline-math'
import { normalizeSubtitleStyle } from './timeline-composition'
import type { TimelineClip, TimelineProject, TimelineSubtitleStyle, TimelineTransition, TimelineVolumeKeyframe } from './timeline-types'

/** Presentation-only lanes keep overlapping audio/subtitle clips individually reachable. */
export function assignClipLanes(clips: TimelineClip[]): Record<string, number> {
  const laneEnds: number[] = [], result: Record<string, number> = {}
  for (const clip of clips.toSorted((a, b) => a.startSeconds - b.startSeconds || a.order - b.order || a.id.localeCompare(b.id))) {
    const free = laneEnds.findIndex(end => end <= clip.startSeconds)
    const lane = free < 0 ? laneEnds.length : free
    laneEnds[lane] = clip.startSeconds + clipDuration(clip)
    result[clip.id] = lane
  }
  return result
}

function replaceClip(timeline: TimelineProject, id: string, edit: (clip: TimelineClip) => TimelineClip): TimelineProject {
  return { ...timeline, updatedAt: new Date().toISOString(), tracks: timeline.tracks.map(track => ({ ...track, clips: track.clips.map(clip => clip.id === id ? edit(clip) : clip) })) }
}

export function setTransition(timeline: TimelineProject, id: string, transition: TimelineTransition | undefined) {
  const track = timeline.tracks.find(t => t.clips.some(c => c.id === id))
  const index = track?.clips.findIndex(c => c.id === id) ?? -1
  const clip = track?.clips[index], previous = track?.clips[index - 1]
  if (!clip || !previous || !['image', 'video'].includes(clip.kind)) return timeline
  if (transition && (!Number.isFinite(transition.durationSeconds) || transition.durationSeconds <= 0)) return timeline
  return replaceClip(timeline, id, c => ({ ...c, transitionIn: transition ? { ...transition, durationSeconds: Math.min(transition.durationSeconds, clipDuration(c), clipDuration(previous)) } : undefined }))
}

export function editSubtitle(timeline: TimelineProject, id: string, edit: { text: string; startSeconds: number; endSeconds: number; style?: Partial<TimelineSubtitleStyle> }) {
  const clip = timeline.tracks.flatMap(t => t.clips).find(c => c.id === id)
  if (clip?.kind !== 'subtitle' || !edit.text.trim() || ![edit.startSeconds, edit.endSeconds].every(Number.isFinite) || edit.startSeconds < 0 || edit.endSeconds <= edit.startSeconds) return timeline
  const duration = edit.endSeconds - edit.startSeconds
  return replaceClip(timeline, id, c => ({ ...c, name: edit.text.trim(), text: edit.text, startSeconds: edit.startSeconds, sourceInSeconds: 0, sourceOutSeconds: duration, sourceDurationSeconds: duration, playbackRate: 1, positionLocked: true, subtitleStyle: normalizeSubtitleStyle({ ...c.subtitleStyle, ...edit.style }) }))
}

export function addAudioTrack(timeline: TimelineProject): TimelineProject {
  const count = timeline.tracks.filter(t => t.kind === 'audio').length
  return { ...timeline, updatedAt: new Date().toISOString(), tracks: [...timeline.tracks, { id: crypto.randomUUID(), kind: 'audio', name: `音频轨道 ${count + 1}`, order: timeline.tracks.length, clips: [] }] }
}

export function setClipPlacement(timeline: TimelineProject, id: string, trackId: string, startSeconds: number) {
  const clip = timeline.tracks.flatMap(t => t.clips).find(c => c.id === id)
  const target = timeline.tracks.find(t => t.id === trackId)
  if (!clip || !target || target.kind !== clip.kind || !Number.isFinite(startSeconds) || startSeconds < 0) return timeline
  return { ...timeline, updatedAt: new Date().toISOString(), tracks: timeline.tracks.map(track => {
    const clips = track.clips.filter(c => c.id !== id)
    if (track.id === trackId) clips.push({ ...clip, trackId, startSeconds, positionLocked: true })
    return { ...track, clips: clips.sort((a, b) => a.startSeconds - b.startSeconds).map((c, order) => ({ ...c, order })) }
  }) }
}

export function setAudioEnvelope(timeline: TimelineProject, id: string, points: TimelineVolumeKeyframe[]) {
  const clip = timeline.tracks.flatMap(t => t.clips).find(c => c.id === id)
  if (clip?.kind !== 'audio' || points.some(p => !Number.isFinite(p.timeSeconds) || !Number.isFinite(p.value) || p.timeSeconds < 0 || p.timeSeconds > clipDuration(clip) || p.value < 0 || p.value > 1)) return timeline
  const unique = [...new Map(points.map(p => [p.timeSeconds, { ...p }])).values()].sort((a, b) => a.timeSeconds - b.timeSeconds)
  return replaceClip(timeline, id, c => ({ ...c, volumeKeyframes: unique }))
}
