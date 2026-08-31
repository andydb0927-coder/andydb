import Dexie from 'dexie'
import { afterEach, describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import { createTimelineProject } from '../timeline/timeline-project'
import { TimelineRepository } from '../timeline/timeline-repository'
import { buildDemoWorks } from './demo-works'
import { CommunityRepository } from './community-repository'

const databaseNames: string[] = []

function createRepositories() {
  const name = `wireless-canvas-community-${crypto.randomUUID()}`
  databaseNames.push(name)
  const database = new WirelessCanvasDatabase(name)
  return {
    database,
    community: new CommunityRepository(database),
    projects: new ProjectRepository(database),
    timelines: new TimelineRepository(database),
  }
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('community repository', () => {
  test('persists local visibility and favorites after reopen and republish without changing publication status', async () => {
    const { community, database } = createRepositories()
    const project = makeProjectFixture()
    const work = await community.publish(project, createTimelineProject(project), { author: '小安', tags: [] })
    await Promise.all([community.setVisibility(work.id, 'public'), community.toggleFavorite(work.id)])
    database.close()
    const reopened = new WirelessCanvasDatabase(database.name)
    const repository = new CommunityRepository(reopened)
    expect(await repository.get(work.id)).toMatchObject({ visibility: 'public', status: 'published', viewer: { favorited: true } })
    const republished = await repository.publish(project, createTimelineProject(project), { author: '小安', tags: [] })
    expect(republished.visibility).toBe('public')
    expect(republished.viewer.favorited).toBe(true)
    await repository.setVisibility(work.id, 'private')
    expect((await repository.get(work.id))?.visibility).toBe('private')
    reopened.close()
  })
  test('opens a version 5 database without losing project and timeline data', async () => {
    const name = `wireless-canvas-community-legacy-${crypto.randomUUID()}`
    databaseNames.push(name)
    const legacy = new Dexie(name)
    legacy.version(5).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, &fingerprint',
      workflowRuns: 'id, projectId, updatedAt, status',
      timelineProjects: 'id, projectId, updatedAt',
    })
    await legacy.open()
    const project = makeProjectFixture()
    const timeline = createTimelineProject(project)
    await legacy.table('projects').put(project)
    await legacy.table('timelineProjects').put(timeline)
    legacy.close()

    const database = new WirelessCanvasDatabase(name)
    const community = new CommunityRepository(database)

    expect(await new ProjectRepository(database).load(project.id)).toEqual(project)
    expect(await new TimelineRepository(database).load(project.id)).toEqual(timeline)
    expect(await community.listMine()).toEqual([])
  })

  test('seeds all fixed demo works and remains idempotent', async () => {
    const { community } = createRepositories()

    expect(await community.ensureDemoWorks()).toBe(true)
    expect(await community.ensureDemoWorks()).toBe(false)

    const works = await community.listPublished({ query: '', tag: 'all', sort: 'latest' })
    expect(works).toHaveLength(buildDemoWorks().length)
    expect(new Set(works.map(({ id }) => id)).size).toBe(works.length)
  })

  test('supplements missing demo ids without overwriting existing interaction data', async () => {
    const { community, database } = createRepositories()
    const existing = {
      ...buildDemoWorks()[0],
      tags: buildDemoWorks()[0].tags.filter((tag) => tag !== '长叙事'),
      metrics: { views: 999, likes: 88, favorites: 77 },
    }
    await database.publishedWorks.put(existing)

    expect(await community.ensureDemoWorks()).toBe(true)
    const works = await community.listPublished({ query: '', tag: 'all', sort: 'latest' })
    expect(works).toHaveLength(buildDemoWorks().length)
    expect((await community.get(existing.id))?.metrics).toEqual(existing.metrics)
    expect((await community.get(existing.id))?.tags).toContain('长叙事')
    expect(await community.ensureDemoWorks()).toBe(false)
  })

  test('publishes one snapshot per project and preserves metrics on republish', async () => {
    const { community } = createRepositories()
    const project = makeProjectFixture()
    const timeline = createTimelineProject(project)

    const first = await community.publish(project, timeline, {
      title: '初版',
      author: '安迪',
      tags: ['雨夜'],
    })
    await community.recordView(first.id)
    await community.toggleLike(first.id)
    const second = await community.publish(project, timeline, {
      title: '重剪版',
      author: '安迪',
      tags: ['电影'],
    })

    expect(second.id).toBe(first.id)
    expect(second.title).toBe('重剪版')
    expect(second.metrics).toMatchObject({ views: 1, likes: 1 })
    expect(await community.listMine()).toHaveLength(1)
    expect((await community.findByProjectId(project.id))?.id).toBe(first.id)
  })

  test('persists views, likes, favorites and status changes transactionally', async () => {
    const { community } = createRepositories()
    const project = makeProjectFixture()
    const published = await community.publish(
      project,
      createTimelineProject(project),
      { author: '安迪', tags: [] },
    )

    await community.recordView(published.id)
    await community.recordView(published.id)
    const liked = await community.toggleLike(published.id)
    const favorited = await community.toggleFavorite(published.id)
    const unlisted = await community.setStatus(published.id, 'unlisted')

    expect(liked?.viewer.liked).toBe(true)
    expect(favorited?.viewer.favorited).toBe(true)
    expect(unlisted?.metrics).toEqual({ views: 2, likes: 1, favorites: 1 })
    expect(await community.listPublished({ query: '', tag: 'all', sort: 'latest' })).toEqual([])
    expect((await community.get(published.id))?.status).toBe('unlisted')
  })

  test('lists durable timeline projects for personal publishing management', async () => {
    const { timelines } = createRepositories()
    const first = {
      ...createTimelineProject(makeProjectFixture()),
      updatedAt: '2026-08-13T11:00:00.000Z',
    }
    const second = {
      ...first,
      id: 'project-later',
      projectId: 'project-later',
      updatedAt: '2026-08-13T12:00:00.000Z',
    }
    await timelines.save(first)
    await timelines.save(second)

    expect((await timelines.list()).map(({ projectId }) => projectId)).toEqual([
      'project-later',
      first.projectId,
    ])
  })
})
