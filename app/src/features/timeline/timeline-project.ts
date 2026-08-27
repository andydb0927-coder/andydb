import type { Project } from '../project/model'
import type {
  TimelineTrackKind,
  TimelineClip,
  TimelineTrack,
  TimelineProject,
  TimelineSourceCandidate,
  TimelineClipLayout,
  TimelineEnvironment,
} from './timeline-types'
import { clipDuration } from './timeline-math'
import { activeAsset, trackForCanvasNode } from './timeline-sources'

// 保留原入口，持久化契约与调用方无需随文件拆分迁移。
export type * from './timeline-types'
export { clipDuration } from './timeline-math'
export { canvasTimelineCandidate, libraryTimelineCandidate, resolveTimelineClips } from './timeline-sources'

const defaultEnvironment: TimelineEnvironment = {
  now: () => new Date().toISOString(),
  randomId: () => crypto.randomUUID(),
}

const trackCopy: Record<TimelineTrackKind, string> = {
  video: '视频轨道',
  audio: '音频轨道',
  image: '图片轨道',
  subtitle: '字幕轨道',
}

const defaultKinds: TimelineTrackKind[] = [
  'video',
  'audio',
  'image',
  'subtitle',
]

function cloneWithTracks(
  timeline: TimelineProject,
  tracks: TimelineTrack[],
  environment: TimelineEnvironment,
) {
  return { ...timeline, tracks, updatedAt: environment.now() }
}

function packClips(clips: TimelineClip[]) {
  let cursor = 0
  return clips.map((clip, order) => {
    const packed = { ...clip, order, startSeconds: cursor }
    cursor += clipDuration(packed)
    return packed
  })
}

function appendToTrack(
  timeline: TimelineProject,
  kind: TimelineTrackKind,
  clip: Omit<TimelineClip, 'trackId' | 'order' | 'startSeconds'>,
  environment: TimelineEnvironment,
) {
  const target = timeline.tracks.find((track) => track.kind === kind)
  if (!target) return timeline
  const startSeconds = target.clips.reduce(
    (end, item) => Math.max(end, item.startSeconds + clipDuration(item)),
    0,
  )
  const nextClip: TimelineClip = {
    ...clip,
    trackId: target.id,
    order: target.clips.length,
    startSeconds,
  }
  return cloneWithTracks(
    timeline,
    timeline.tracks.map((track) =>
      track.id === target.id
        ? { ...track, clips: [...track.clips, nextClip] }
        : track,
    ),
    environment,
  )
}

export function createTimelineProject(
  project: Project,
  environment: TimelineEnvironment = defaultEnvironment,
): TimelineProject {
  const timestamp = environment.now()
  const timeline: TimelineProject = {
    id: project.id,
    projectId: project.id,
    title: `${project.title}剪辑`,
    schemaVersion: 1,
    frameRate: 24,
    width: 1920,
    height: 1080,
    tracks: defaultKinds.map((kind, order) => ({
      id: `${project.id}:track:${kind}`,
      kind,
      name: trackCopy[kind],
      order,
      clips: [],
    })),
    removedLegacyItemIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  return mergeLegacyTimeline(timeline, project, environment)
}

export function mergeLegacyTimeline(
  timeline: TimelineProject,
  project: Project,
  environment: TimelineEnvironment = defaultEnvironment,
): TimelineProject {
  const existing = new Set(
    timeline.tracks.flatMap((track) =>
      track.clips.flatMap((clip) =>
        clip.legacyTimelineItemId ? [clip.legacyTimelineItemId] : [],
      ),
    ),
  )
  for (const removedId of timeline.removedLegacyItemIds ?? []) {
    existing.add(removedId)
  }
  let next = timeline
  for (const item of [...project.timeline].sort((a, b) => a.order - b.order)) {
    if (existing.has(item.id)) continue
    const { node, asset } = activeAsset(project, item.nodeId)
    const kind = trackForCanvasNode(node, asset, item.track)
    next = appendToTrack(
      next,
      kind,
      {
        id: item.id,
        kind,
        name: node?.title ?? `缺少片段 ${item.nodeId}`,
        sourceInSeconds: 0,
        sourceOutSeconds: item.durationSeconds,
        sourceDurationSeconds: Math.max(
          item.durationSeconds,
          asset?.durationSeconds ?? item.durationSeconds,
        ),
        source: {
          type: 'canvas-node',
          nodeId: item.nodeId,
          assetId: asset?.id,
          url: asset?.url,
          mimeType: asset?.mimeType,
        },
        legacyTimelineItemId: item.id,
      },
      environment,
    )
    existing.add(item.id)
  }
  return next
}

export function addClip(
  timeline: TimelineProject,
  candidate: TimelineSourceCandidate,
  environment: TimelineEnvironment = defaultEnvironment,
  targetKind: TimelineTrackKind = candidate.kind,
): TimelineProject {
  if (targetKind === 'subtitle') return timeline
  const duration = Math.max(1 / timeline.frameRate, candidate.durationSeconds)
  return appendToTrack(
    timeline,
    targetKind,
    {
      id: environment.randomId(),
      kind: candidate.kind,
      name: candidate.name,
      sourceInSeconds: 0,
      sourceOutSeconds: duration,
      sourceDurationSeconds: duration,
      source: candidate.source,
    },
    environment,
  )
}

export function addSubtitleClip(
  timeline: TimelineProject,
  text: string,
  startSeconds: number,
  durationSeconds: number,
  environment: TimelineEnvironment = defaultEnvironment,
): TimelineProject {
  const normalized = text.trim()
  const target = timeline.tracks.find((track) => track.kind === 'subtitle')
  if (!normalized || !target || durationSeconds <= 0 || startSeconds < 0) {
    return timeline
  }
  const clip: TimelineClip = {
    id: environment.randomId(),
    trackId: target.id,
    kind: 'subtitle',
    name: normalized,
    order: target.clips.length,
    startSeconds,
    sourceInSeconds: 0,
    sourceOutSeconds: durationSeconds,
    sourceDurationSeconds: durationSeconds,
    source: { type: 'subtitle' },
    text: normalized,
  }
  return cloneWithTracks(
    timeline,
    timeline.tracks.map((track) =>
      track.id === target.id
        ? { ...track, clips: [...track.clips, clip] }
        : track,
    ),
    environment,
  )
}

export function moveClip(
  timeline: TimelineProject,
  clipId: string,
  direction: -1 | 1,
  environment: TimelineEnvironment = defaultEnvironment,
): TimelineProject {
  const target = timeline.tracks.find((track) =>
    track.clips.some((clip) => clip.id === clipId),
  )
  if (!target) return timeline
  const index = target.clips.findIndex((clip) => clip.id === clipId)
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= target.clips.length) return timeline
  const clips = [...target.clips]
  const [moved] = clips.splice(index, 1)
  clips.splice(nextIndex, 0, moved)
  return cloneWithTracks(
    timeline,
    timeline.tracks.map((track) =>
      track.id === target.id ? { ...track, clips: packClips(clips) } : track,
    ),
    environment,
  )
}

export function trimClip(
  timeline: TimelineProject,
  clipId: string,
  sourceInSeconds: number,
  sourceOutSeconds: number,
  environment: TimelineEnvironment = defaultEnvironment,
): TimelineProject {
  const target = timeline.tracks.find((track) =>
    track.clips.some((clip) => clip.id === clipId),
  )
  const clip = target?.clips.find((candidate) => candidate.id === clipId)
  if (
    !target ||
    !clip ||
    !Number.isFinite(sourceInSeconds) ||
    !Number.isFinite(sourceOutSeconds) ||
    sourceInSeconds < 0 ||
    sourceOutSeconds <= sourceInSeconds ||
    sourceOutSeconds > clip.sourceDurationSeconds
  ) {
    return timeline
  }
  const clips = target.clips.map((candidate) =>
    candidate.id === clipId
      ? { ...candidate, sourceInSeconds, sourceOutSeconds }
      : candidate,
  )
  return cloneWithTracks(
    timeline,
    timeline.tracks.map((track) =>
      track.id === target.id ? { ...track, clips: packClips(clips) } : track,
    ),
    environment,
  )
}

export function updateClipPlaybackRate(
  timeline: TimelineProject,
  clipId: string,
  playbackRate: number,
  environment: TimelineEnvironment = defaultEnvironment,
): TimelineProject {
  if (!Number.isFinite(playbackRate) || playbackRate < 0.25 || playbackRate > 4) {
    return timeline
  }
  const target = timeline.tracks.find((track) =>
    track.clips.some((clip) => clip.id === clipId),
  )
  if (!target) return timeline
  const current = target.clips.find((clip) => clip.id === clipId)
  if (!current || (current.playbackRate ?? 1) === playbackRate) return timeline
  const clips = target.clips.map((clip) =>
    clip.id === clipId ? { ...clip, playbackRate } : clip,
  )
  return cloneWithTracks(
    timeline,
    timeline.tracks.map((track) =>
      track.id === target.id ? { ...track, clips: packClips(clips) } : track,
    ),
    environment,
  )
}

function validLayout(layout: TimelineClipLayout) {
  return [layout.x, layout.y, layout.width, layout.height].every(Number.isFinite) &&
    layout.x >= 0 &&
    layout.y >= 0 &&
    layout.width > 0 &&
    layout.height > 0 &&
    layout.x + layout.width <= 1.000001 &&
    layout.y + layout.height <= 1.000001
}

export function updateClipLayout(
  timeline: TimelineProject,
  clipId: string,
  layout: TimelineClipLayout,
  environment: TimelineEnvironment = defaultEnvironment,
): TimelineProject {
  if (!validLayout(layout)) return timeline
  const target = timeline.tracks.find((track) =>
    track.clips.some((clip) => clip.id === clipId),
  )
  if (!target) return timeline
  const clips = target.clips.map((clip) =>
    clip.id === clipId ? { ...clip, layout: { ...layout } } : clip,
  )
  return cloneWithTracks(
    timeline,
    timeline.tracks.map((track) =>
      track.id === target.id ? { ...track, clips } : track,
    ),
    environment,
  )
}

export function splitClip(
  timeline: TimelineProject,
  clipId: string,
  offsetSeconds: number,
  environment: TimelineEnvironment = defaultEnvironment,
): TimelineProject {
  const target = timeline.tracks.find((track) =>
    track.clips.some((clip) => clip.id === clipId),
  )
  const index = target?.clips.findIndex((clip) => clip.id === clipId) ?? -1
  const clip = target?.clips[index]
  if (!target || !clip || offsetSeconds <= 0 || offsetSeconds >= clipDuration(clip)) {
    return timeline
  }
  const sourceSplit = clip.sourceInSeconds + offsetSeconds
  const clips = [...target.clips]
  clips.splice(
    index,
    1,
    { ...clip, sourceOutSeconds: sourceSplit },
    {
      ...clip,
      id: environment.randomId(),
      legacyTimelineItemId: undefined,
      sourceInSeconds: sourceSplit,
    },
  )
  return cloneWithTracks(
    timeline,
    timeline.tracks.map((track) =>
      track.id === target.id ? { ...track, clips: packClips(clips) } : track,
    ),
    environment,
  )
}

export function deleteClip(
  timeline: TimelineProject,
  clipId: string,
  environment: TimelineEnvironment = defaultEnvironment,
): TimelineProject {
  const target = timeline.tracks.find((track) =>
    track.clips.some((clip) => clip.id === clipId),
  )
  if (!target) return timeline
  const next = cloneWithTracks(
    timeline,
    timeline.tracks.map((track) =>
      track.id === target.id
        ? {
            ...track,
            clips: packClips(track.clips.filter((clip) => clip.id !== clipId)),
          }
        : track,
    ),
    environment,
  )
  const removed = target.clips.find((clip) => clip.id === clipId)
    ?.legacyTimelineItemId
  return removed
    ? {
        ...next,
        removedLegacyItemIds: [
          ...new Set([...(timeline.removedLegacyItemIds ?? []), removed]),
        ],
      }
    : next
}

export function getTimelineDuration(timeline: TimelineProject): number {
  return timeline.tracks
    .flatMap((track) => track.clips)
    .reduce(
      (duration, clip) =>
        Math.max(duration, clip.startSeconds + clipDuration(clip)),
      0,
    )
}
