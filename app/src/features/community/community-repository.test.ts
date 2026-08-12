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
    community: new CommunityRepository(database),
    projects: new ProjectRepository(database),
    timelines: new TimelineRepository(database),
  }
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('community repository', () => {
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

  test('seeds demo works only for an empty table and remains idempotent', async () => {
    const { community } = createRepositories()

    expect(await community.ensureDemoWorks()).toBe(true)
    expect(await community.ensureDemoWorks()).toBe(false)

    const works = await community.listPublished({ query: '', tag: 'all', sort: 'latest' })
    expect(works).toHaveLength(buildDemoWorks().length)
    expect(new Set(works.map(({ id }) => id)).size).toBe(works.length)
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
    const first = createTimelineProject(makeProjectFixture())
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
