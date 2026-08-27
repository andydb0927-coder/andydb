import type { Asset, CanvasNode } from '../project/model'

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
