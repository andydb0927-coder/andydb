import Dexie from 'dexie'
import { afterEach, describe, expect, test } from 'vitest'

import { WirelessCanvasDatabase } from '../project/project-repository'
import { MembershipRepository } from './membership-repository'
import { makeProjectFixture } from '../../test/fixtures'

const names: string[] = []

function createRepository() {
  const name = `membership-${crypto.randomUUID()}`
  names.push(name)
  return new MembershipRepository(new WirelessCanvasDatabase(name), () =>
    '2026-08-13T08:00:00.000Z')
}

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)))
})

describe('membership repository', () => {
  test('upgrades a version 6 workspace without losing existing projects', async () => {
    const name = `membership-v6-${crypto.randomUUID()}`
    names.push(name)
    const legacy = new Dexie(name)
    legacy.version(6).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, &fingerprint',
      workflowRuns: 'id, projectId, updatedAt, status',
      timelineProjects: 'id, projectId, updatedAt',
      publishedWorks: 'id, &projectId, status, publishedAt, updatedAt',
    })
    await legacy.open()
    await legacy.table('projects').put(makeProjectFixture())
    legacy.close()

    const database = new WirelessCanvasDatabase(name)
    const membership = await new MembershipRepository(database).get()

    expect(membership.plan).toBe('free')
    expect((await database.projects.toArray())[0].title).toBe('霜河渡')
  })

  test('defaults to free and persists local subscribe, cancel and renew actions', async () => {
    const repository = createRepository()

    expect(await repository.get()).toMatchObject({ plan: 'free', status: 'active' })
    expect(await repository.subscribe('professional')).toMatchObject({
      plan: 'professional',
      status: 'active',
    })
    expect(await repository.cancel()).toMatchObject({
      plan: 'free',
      status: 'cancelled',
    })
    expect(await repository.renew()).toMatchObject({
      plan: 'professional',
      status: 'active',
    })
  })
})
