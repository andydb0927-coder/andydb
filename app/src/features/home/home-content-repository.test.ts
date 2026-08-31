import Dexie from 'dexie'
import { afterEach, describe, expect, test } from 'vitest'

import { WirelessCanvasDatabase } from '../project/project-repository'
import { buildHomeContentSeed, type HomeContentRecord } from './home-content'
import { HomeContentRepository } from './home-content-repository'

const databaseNames: string[] = []

function createRepository() {
  const name = `wireless-canvas-home-${crypto.randomUUID()}`
  databaseNames.push(name)
  const database = new WirelessCanvasDatabase(name)
  return { database, repository: new HomeContentRepository(database) }
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('home content repository', () => {
  test('opens a version 7 database and adds the home content table without losing data', async () => {
    const name = `wireless-canvas-home-legacy-${crypto.randomUUID()}`
    databaseNames.push(name)
    const legacy = new Dexie(name)
    legacy.version(7).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, &fingerprint',
      workflowRuns: 'id, projectId, updatedAt, status',
      timelineProjects: 'id, projectId, updatedAt',
      publishedWorks: 'id, &projectId, status, publishedAt, updatedAt',
      collaborators: 'id, projectId, role, updatedAt',
      changeComments: 'id, projectId, targetType, targetId, status, createdAt',
      membership: 'id, plan, status, updatedAt',
    })
    await legacy.open()
    await legacy.table('membership').put({
      id: 'local-membership',
      plan: 'free',
      status: 'active',
      updatedAt: '2026-08-13T00:00:00.000Z',
    })
    legacy.close()

    const database = new WirelessCanvasDatabase(name)
    const repository = new HomeContentRepository(database)

    expect(await database.membership.get('local-membership')).toBeDefined()
    expect(await repository.list()).toEqual([])
  })

  test('seeds missing fixed ids, preserves existing records and remains idempotent', async () => {
    const { database, repository } = createRepository()
    const seed = buildHomeContentSeed()
    const customized: HomeContentRecord = {
      ...seed[0],
      title: '保留的本地活动文案',
    }
    const staleMode: HomeContentRecord = {
      ...seed.find(({ kind }) => kind === 'mode')!,
      title: '旧版创作模式',
    }
    await database.homeContent.bulkPut([customized, staleMode])

    expect(await repository.ensureSeed()).toBe(true)
    expect(await repository.ensureSeed()).toBe(false)

    const records = await repository.list()
    expect(records).toHaveLength(seed.length)
    expect(records.find(({ id }) => id === customized.id)?.title).toBe(
      '保留的本地活动文案',
    )
    expect(records.find(({ id }) => id === staleMode.id)?.title).toBe(
      '长叙事视频工作流',
    )
    expect(records.map(({ order }) => order)).toEqual(
      [...records.map(({ order }) => order)].sort((a, b) => a - b),
    )
  })
})
