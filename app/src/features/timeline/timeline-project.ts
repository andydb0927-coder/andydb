import type { LibraryAssetRecord } from '../assets/library-model'
import type { Asset, CanvasNode, Project } from '../project/model'

export type TimelineTrackKind = 'video' | 'audio' | 'image' | 'subtitle'
export type TimelineClipKind = TimelineTrackKind

export interface TimelineClipSource {
  type: 'canvas-node' | 'library-asset' | 'subtitle'
  nodeId?: string
  assetId?: string
  url?: string
  mimeType?: string
}

export interface TimelineClip {
  id: string
  trackId: string
  kind: TimelineClipKind
  name: string
  order: number
  startSeconds: number
  sourceInSeconds: number
  sourceOutSeconds: number
  sourceDurationSeconds: number
  source: TimelineClipSource
  text?: string
  legacyTimelineItemId?: string
  playbackRate?: number
  layout?: TimelineClipLayout
}

export type TimelineClipLayoutMode = 'full' | 'picture-in-picture' | 'thirds'
export type TimelineClipLayoutSlot = 'main' | 'overlay' | 'left' | 'center' | 'right'

export interface TimelineClipLayout {
  mode: TimelineClipLayoutMode
  x: number
  y: number
  width: number
  height: number
  slot: TimelineClipLayoutSlot
}

export interface TimelineTrack {
  id: string
  kind: TimelineTrackKind
  name: string
  order: number
  clips: TimelineClip[]
}

export interface TimelineProject {
  id: string
  projectId: string
  title: string
  schemaVersion: 1
  frameRate: 24
  width: 1920
  height: 1080
  tracks: TimelineTrack[]
  removedLegacyItemIds: string[]
  createdAt: string
  updatedAt: string
}

export interface TimelineSourceCandidate {
  id: string
  name: string
  kind: Exclude<TimelineClipKind, 'subtitle'>
  durationSeconds: number
  source: TimelineClipSource
}

export interface ResolvedTimelineClip {
  clip: TimelineClip
  node?: CanvasNode
  asset?: Asset
  missing: boolean
  startSeconds: number
  endSeconds: number
  aspectRatio?: string
}

export interface ResolvedTimelineProject {
  visual: ResolvedTimelineClip[]
  audio: ResolvedTimelineClip[]
  subtitles: ResolvedTimelineClip[]
}

export interface TimelineEnvironment {
  now(): string
  randomId(): string
}

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

export function clipDuration(clip: TimelineClip): number {
  const playbackRate = clip.playbackRate ?? 1
  return Math.max(0, clip.sourceOutSeconds - clip.sourceInSeconds) / playbackRate
}

function activeAsset(project: Project, nodeId: string) {
  const node = project.nodes.find((candidate) => candidate.id === nodeId)
  const version = node?.versions.find(
    (candidate) => candidate.id === node.activeVersionId,
  )
  const asset = project.assets.find(
    (candidate) => candidate.id === version?.assetId,
  )
  return { node, asset }
}

function trackForAsset(asset: Asset | undefined, fallback: TimelineTrackKind) {
  return asset?.kind === 'text' ? fallback : asset?.kind ?? fallback
}

// 画布视频节点的 demo 产物可能是 PNG 缩略图，但语义上属于视频轨；
// 其余节点（分镜/预览等）按媒体类型归属轨道
function trackForCanvasNode(
  node: CanvasNode | undefined,
  asset: Asset | undefined,
  fallback: TimelineTrackKind,
): Exclude<TimelineTrackKind, 'subtitle'> {
  if (node?.kind === 'video') return 'video'
  const kind = trackForAsset(asset, fallback)
  return kind === 'subtitle' ? (fallback === 'subtitle' ? 'image' : fallback) : kind
}

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

export function canvasTimelineCandidate(
  project: Project,
  nodeId: string,
): TimelineSourceCandidate | undefined {
  const { node, asset } = activeAsset(project, nodeId)
  if (!node || !asset) return undefined
  const kind = trackForCanvasNode(node, asset, 'image')
  return {
    id: `node:${node.id}`,
    name: node.title,
    kind,
    durationSeconds: asset.durationSeconds ?? 5,
    source: {
      type: 'canvas-node',
      nodeId: node.id,
      assetId: asset.id,
      url: asset.url,
      mimeType: asset.mimeType,
    },
  }
}

export function libraryTimelineCandidate(
  record: LibraryAssetRecord,
): TimelineSourceCandidate {
  return {
    id: `library:${record.id}`,
    name: record.name,
    kind: record.kind === 'text' ? 'image' : record.kind,
    durationSeconds: record.durationSeconds ?? (record.kind === 'image' ? 5 : 5),
    source: {
      type: 'library-asset',
      assetId: record.id,
      url: record.url,
      mimeType: record.mimeType,
    },
  }
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

function describeAspectRatio(asset?: Asset) {
  if (!asset?.width || !asset.height) return undefined
  const ratio = asset.width / asset.height
  if (Math.abs(ratio - 16 / 9) < 0.02) return '16:9'
  if (Math.abs(ratio - 9 / 16) < 0.02) return '9:16'
  return `${asset.width}:${asset.height}`
}

function resolveClip(project: Project, clip: TimelineClip): ResolvedTimelineClip {
  const node = clip.source.nodeId
    ? project.nodes.find((candidate) => candidate.id === clip.source.nodeId)
    : undefined
  const projectAsset = clip.source.assetId
    ? project.assets.find((candidate) => candidate.id === clip.source.assetId)
    : undefined
  const asset = projectAsset ??
    (clip.source.url && clip.source.mimeType && clip.kind !== 'subtitle'
      ? {
          id: clip.source.assetId ?? clip.id,
          kind: clip.kind,
          url: clip.source.url,
          mimeType: clip.source.mimeType,
          durationSeconds: clip.sourceDurationSeconds,
        } satisfies Asset
      : undefined)
  return {
    clip,
    node,
    asset,
    missing: clip.kind !== 'subtitle' && !asset,
    startSeconds: clip.startSeconds,
    endSeconds: clip.startSeconds + clipDuration(clip),
    aspectRatio: describeAspectRatio(asset),
  }
}

export function resolveTimelineClips(
  timeline: TimelineProject,
  project: Project,
): ResolvedTimelineProject {
  const tracks = [...timeline.tracks].sort((a, b) => a.order - b.order)
  const resolved = tracks.flatMap((track) =>
    [...track.clips]
      .sort((a, b) => a.startSeconds - b.startSeconds || a.order - b.order)
      .map((clip) => resolveClip(project, clip)),
  )
  const byStart = (left: ResolvedTimelineClip, right: ResolvedTimelineClip) =>
    left.startSeconds - right.startSeconds || left.clip.order - right.clip.order
  return {
    visual: resolved
      .filter(({ clip }) => clip.kind === 'video' || clip.kind === 'image')
      .sort(byStart),
    audio: resolved.filter(({ clip }) => clip.kind === 'audio').sort(byStart),
    subtitles: resolved
      .filter(({ clip }) => clip.kind === 'subtitle')
      .sort(byStart),
  }
}
