import type { LibraryAssetRecord } from '../assets/library-model'
import type { Asset, CanvasNode, Project } from '../project/model'
import type {
  TimelineTrackKind,
  TimelineSourceCandidate,
  TimelineClip,
  TimelineProject,
  ResolvedTimelineClip,
  ResolvedTimelineProject,
} from './timeline-types'
import { clipDuration } from './timeline-math'

export function activeAsset(project: Project, nodeId: string) {
  const node = project.nodes.find((candidate) => candidate.id === nodeId)
  const version = node?.versions.find(
    (candidate) => candidate.id === node.activeVersionId,
  )
  const asset = project.assets.find(
    (candidate) => candidate.id === version?.assetId,
  )
  return { node, asset }
}

export function trackForAsset(asset: Asset | undefined, fallback: TimelineTrackKind) {
  return asset?.kind === 'text' ? fallback : asset?.kind ?? fallback
}

// 画布视频节点的 demo 产物可能是 PNG 缩略图，但语义上属于视频轨；
// 其余节点（分镜/预览等）按媒体类型归属轨道
export function trackForCanvasNode(
  node: CanvasNode | undefined,
  asset: Asset | undefined,
  fallback: TimelineTrackKind,
): Exclude<TimelineTrackKind, 'subtitle'> {
  if (node?.kind === 'video') return 'video'
  const kind = trackForAsset(asset, fallback)
  return kind === 'subtitle' ? (fallback === 'subtitle' ? 'image' : fallback) : kind
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

export function describeAspectRatio(asset?: Asset) {
  if (!asset?.width || !asset.height) return undefined
  const ratio = asset.width / asset.height
  if (Math.abs(ratio - 16 / 9) < 0.02) return '16:9'
  if (Math.abs(ratio - 9 / 16) < 0.02) return '9:16'
  return `${asset.width}:${asset.height}`
}

export function resolveClip(project: Project, clip: TimelineClip): ResolvedTimelineClip {
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
