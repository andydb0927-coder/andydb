import type { Project } from '../project/model'
import {
  getTimelineDuration,
  type TimelineClip,
  type TimelineProject,
} from '../timeline/timeline-project'

export type WorkStatus = 'published' | 'unlisted'
export type WorkSort = 'latest' | 'hot'

export interface WorkMetrics {
  views: number
  likes: number
  favorites: number
}

export interface WorkViewerState {
  liked: boolean
  favorited: boolean
}

export interface PublishedWork {
  id: string
  projectId: string
  title: string
  author: string
  authorVerified?: boolean
  tags: string[]
  coverUrl: string
  durationSeconds: number
  status: WorkStatus
  publishedAt: string
  updatedAt: string
  projectSnapshot: Project
  timelineSnapshot: TimelineProject
  metrics: WorkMetrics
  viewer: WorkViewerState
}

export interface PublishWorkInput {
  title?: string
  author: string
  tags: string[]
}

export interface WorkFilter {
  query: string
  tag: string
  sort: WorkSort
}

export interface CommunityEnvironment {
  now(): string
  randomId(): string
}

const defaultEnvironment: CommunityEnvironment = {
  now: () => new Date().toISOString(),
  randomId: () => crypto.randomUUID(),
}

export type CommunityPublicationErrorReason = 'missing-visual'

export class CommunityPublicationError extends Error {
  readonly reason: CommunityPublicationErrorReason

  constructor(reason: CommunityPublicationErrorReason) {
    super(reason === 'missing-visual' ? '时间线缺少可发布的视觉片段' : reason)
    this.name = 'CommunityPublicationError'
    this.reason = reason
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function normalizedText(value: string | undefined, fallback: string) {
  return value?.trim() || fallback
}

export function normalizeWorkTags(tags: string[]): string[] {
  const unique: string[] = []
  for (const value of tags) {
    const tag = value.trim().slice(0, 16)
    if (!tag || unique.includes(tag)) continue
    unique.push(tag)
    if (unique.length === 5) break
  }
  return unique
}

function visualClips(timeline: TimelineProject): TimelineClip[] {
  return [...timeline.tracks]
    .sort((left, right) => left.order - right.order)
    .filter(({ kind }) => kind === 'video' || kind === 'image')
    .flatMap(({ clips }) =>
      [...clips].sort(
        (left, right) =>
          left.startSeconds - right.startSeconds || left.order - right.order,
      ),
    )
}

export function deriveWorkCover(
  project: Project,
  timeline: TimelineProject,
): string | undefined {
  for (const clip of visualClips(timeline)) {
    if (clip.source.url) return clip.source.url
    const asset = clip.source.assetId
      ? project.assets.find(({ id }) => id === clip.source.assetId)
      : undefined
    if (asset?.url) return asset.url
  }
  return undefined
}

export function createPublishedWork(
  project: Project,
  timeline: TimelineProject,
  input: PublishWorkInput,
  existing?: PublishedWork,
  environment: CommunityEnvironment = defaultEnvironment,
): PublishedWork {
  const coverUrl = deriveWorkCover(project, timeline)
  if (!coverUrl) throw new CommunityPublicationError('missing-visual')

  const timestamp = environment.now()
  return {
    id: existing?.id ?? environment.randomId(),
    projectId: project.id,
    title: normalizedText(input.title, project.title),
    author: normalizedText(input.author, '本地创作者'),
    authorVerified: existing?.authorVerified ?? false,
    tags: normalizeWorkTags(input.tags),
    coverUrl,
    durationSeconds: getTimelineDuration(timeline),
    status: 'published',
    publishedAt: existing?.publishedAt ?? timestamp,
    updatedAt: timestamp,
    projectSnapshot: clone(project),
    timelineSnapshot: clone(timeline),
    metrics: clone(existing?.metrics ?? { views: 0, likes: 0, favorites: 0 }),
    viewer: clone(existing?.viewer ?? { liked: false, favorited: false }),
  }
}

export function setWorkStatus(
  work: PublishedWork,
  status: WorkStatus,
  environment: CommunityEnvironment = defaultEnvironment,
): PublishedWork {
  return { ...work, status, updatedAt: environment.now() }
}

export function recordWorkView(
  work: PublishedWork,
  environment: CommunityEnvironment = defaultEnvironment,
): PublishedWork {
  return {
    ...work,
    metrics: { ...work.metrics, views: work.metrics.views + 1 },
    updatedAt: environment.now(),
  }
}

export function toggleWorkLike(
  work: PublishedWork,
  environment: CommunityEnvironment = defaultEnvironment,
): PublishedWork {
  const liked = !work.viewer.liked
  return {
    ...work,
    metrics: {
      ...work.metrics,
      likes: Math.max(0, work.metrics.likes + (liked ? 1 : -1)),
    },
    viewer: { ...work.viewer, liked },
    updatedAt: environment.now(),
  }
}

export function toggleWorkFavorite(
  work: PublishedWork,
  environment: CommunityEnvironment = defaultEnvironment,
): PublishedWork {
  const favorited = !work.viewer.favorited
  return {
    ...work,
    metrics: {
      ...work.metrics,
      favorites: Math.max(0, work.metrics.favorites + (favorited ? 1 : -1)),
    },
    viewer: { ...work.viewer, favorited },
    updatedAt: environment.now(),
  }
}

export function workHeat(work: PublishedWork): number {
  return (
    work.metrics.views +
    work.metrics.likes * 4 +
    work.metrics.favorites * 6
  )
}

export function filterAndSortWorks(
  works: PublishedWork[],
  filter: WorkFilter,
): PublishedWork[] {
  const query = filter.query.trim().toLocaleLowerCase()
  const visible = works.filter((work) => {
    if (work.status !== 'published') return false
    if (filter.tag !== 'all' && !work.tags.includes(filter.tag)) return false
    if (!query) return true
    return [work.title, work.author, ...work.tags].some((value) =>
      value.toLocaleLowerCase().includes(query),
    )
  })

  return [...visible].sort((left, right) => {
    if (filter.sort === 'hot') {
      const heat = workHeat(right) - workHeat(left)
      if (heat !== 0) return heat
    }
    return right.publishedAt.localeCompare(left.publishedAt)
  })
}
