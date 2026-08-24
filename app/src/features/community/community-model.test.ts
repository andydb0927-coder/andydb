import { describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject } from '../timeline/timeline-project'
import { createWorkflowSnapshot } from '../canvas/canvas-workflow-export'
import {
  CommunityPublicationError,
  createPublishedWork,
  filterAndSortWorks,
  setWorkStatus,
  toggleWorkFavorite,
  toggleWorkLike,
  type CommunityEnvironment,
  type PublishedWork,
} from './community-model'

const environment: CommunityEnvironment = {
  now: () => '2026-08-13T10:00:00.000Z',
  randomId: () => 'work-local-1',
}

function makeWork(overrides: Partial<PublishedWork> = {}): PublishedWork {
  const project = makeProjectFixture()
  return {
    ...createPublishedWork(
      project,
      createTimelineProject(project),
      { author: '安迪', tags: ['电影', '雨夜'] },
      undefined,
      environment,
    ),
    ...overrides,
  }
}

describe('community work model', () => {
  test('publishes an immutable project and timeline snapshot with derived card data', () => {
    const project = makeProjectFixture()
    const timeline = createTimelineProject(project)

    const work = createPublishedWork(
      project,
      timeline,
      {
        title: '  霜河渡 · 终剪  ',
        author: '  安迪  ',
        tags: [' 雨夜 ', '电影', '雨夜', '', '河岸'],
      },
      undefined,
      environment,
    )

    expect(work).toMatchObject({
      id: 'work-local-1',
      projectId: project.id,
      title: '霜河渡 · 终剪',
      author: '安迪',
      tags: ['雨夜', '电影', '河岸'],
      coverUrl: '/demo/shot-river.png',
      durationSeconds: 12,
      status: 'published',
      metrics: { views: 0, likes: 0, favorites: 0 },
      viewer: { liked: false, favorited: false },
    })
    expect(work.projectSnapshot).not.toBe(project)
    expect(work.timelineSnapshot).not.toBe(timeline)

    project.title = '后来修改'
    timeline.title = '后来修改'
    expect(work.projectSnapshot.title).toBe('霜河渡')
    expect(work.timelineSnapshot.title).toBe('霜河渡剪辑')
  })

  test('stores local publication metadata and the shared workflow snapshot contract', () => {
    const project = makeProjectFixture()
    const timeline = createTimelineProject(project)
    const workflowSnapshot = createWorkflowSnapshot(
      project,
      new Date('2026-08-21T06:00:00.000Z'),
    )

    const work = createPublishedWork(
      project,
      timeline,
      {
        title: '雨夜成片',
        description: '一段关于重逢的本地演示作品。',
        author: '安迪',
        tags: ['雨夜'],
        coverUrl: '/covers/selected-result.png',
        coverNodeId: 'shot-1',
        workflowSnapshot,
        canvasSnapshotUrl: 'data:image/svg+xml;charset=utf-8,%3Csvg%3E',
      },
      undefined,
      environment,
    )

    expect(work).toMatchObject({
      description: '一段关于重逢的本地演示作品。',
      coverUrl: '/covers/selected-result.png',
      coverNodeId: 'shot-1',
      workflowSnapshot,
      canvasSnapshotUrl: 'data:image/svg+xml;charset=utf-8,%3Csvg%3E',
      localOnly: true,
    })
  })

  test('rejects a timeline without a visual preview source', () => {
    const project = makeProjectFixture()
    const timeline = createTimelineProject({ ...project, timeline: project.timeline.slice(1) })

    expect(() =>
      createPublishedWork(project, timeline, { author: '安迪', tags: [] }, undefined, environment),
    ).toThrowError(new CommunityPublicationError('missing-visual'))
  })

  test('republishes the same work while retaining publication age and interaction data', () => {
    const project = makeProjectFixture()
    const timeline = createTimelineProject(project)
    const existing = makeWork({
      status: 'unlisted',
      publishedAt: '2026-08-01T08:00:00.000Z',
      metrics: { views: 20, likes: 4, favorites: 3 },
      viewer: { liked: true, favorited: true },
    })

    const republished = createPublishedWork(
      project,
      timeline,
      { title: '新标题', author: '安迪', tags: ['重发'] },
      existing,
      environment,
    )

    expect(republished.id).toBe(existing.id)
    expect(republished.status).toBe('published')
    expect(republished.publishedAt).toBe(existing.publishedAt)
    expect(republished.metrics).toEqual(existing.metrics)
    expect(republished.viewer).toEqual(existing.viewer)
    expect(republished.title).toBe('新标题')
  })

  test('toggles local reactions without allowing counters below zero', () => {
    const work = makeWork()
    const liked = toggleWorkLike(work, environment)
    const saved = toggleWorkFavorite(liked, environment)

    expect(saved.metrics).toEqual({ views: 0, likes: 1, favorites: 1 })
    expect(saved.viewer).toEqual({ liked: true, favorited: true })
    expect(toggleWorkLike(saved, environment).metrics.likes).toBe(0)
    expect(
      toggleWorkFavorite({
        ...work,
        viewer: { ...work.viewer, favorited: true },
      }, environment).metrics.favorites,
    ).toBe(0)
  })

  test('unlists without deleting the work or its metrics', () => {
    const work = makeWork({ metrics: { views: 9, likes: 2, favorites: 1 } })
    const unlisted = setWorkStatus(work, 'unlisted', environment)

    expect(unlisted.status).toBe('unlisted')
    expect(unlisted.metrics).toEqual(work.metrics)
    expect(unlisted.updatedAt).toBe(environment.now())
  })

  test('filters published works by title, author, tag and selected tag', () => {
    const rain = makeWork({ id: 'rain', title: '雨夜河岸', author: '安迪', tags: ['电影', '雨夜'] })
    const city = makeWork({ id: 'city', title: '屋顶来信', author: '小林', tags: ['城市'] })
    const hidden = makeWork({ id: 'hidden', title: '雨夜下架', status: 'unlisted', tags: ['雨夜'] })

    expect(filterAndSortWorks([rain, city, hidden], { query: '小林', tag: 'all', sort: 'latest' })).toEqual([city])
    expect(filterAndSortWorks([rain, city, hidden], { query: '电影', tag: '雨夜', sort: 'latest' })).toEqual([rain])
  })

  test('sorts latest by publish time and hot by weighted engagement', () => {
    const olderHot = makeWork({
      id: 'hot',
      publishedAt: '2026-08-01T08:00:00.000Z',
      metrics: { views: 10, likes: 10, favorites: 3 },
    })
    const newer = makeWork({
      id: 'new',
      publishedAt: '2026-08-12T08:00:00.000Z',
      metrics: { views: 30, likes: 0, favorites: 0 },
    })

    expect(filterAndSortWorks([olderHot, newer], { query: '', tag: 'all', sort: 'latest' }).map(({ id }) => id)).toEqual(['new', 'hot'])
    expect(filterAndSortWorks([olderHot, newer], { query: '', tag: 'all', sort: 'hot' }).map(({ id }) => id)).toEqual(['hot', 'new'])
  })
})
