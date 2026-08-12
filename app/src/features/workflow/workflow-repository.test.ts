import Dexie from 'dexie'
import { afterEach, describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import { buildWorkflowRun } from './workflow-model'
import { WorkflowRepository } from './workflow-repository'

const databaseNames: string[] = []

function createRepository() {
  const name = `wireless-canvas-workflow-${crypto.randomUUID()}`
  databaseNames.push(name)
  return new WorkflowRepository(new WirelessCanvasDatabase(name))
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('workflow repository', () => {
  test('round-trips a complete run and overwrites the same aggregate id', async () => {
    const repository = createRepository()
    const run = buildWorkflowRun(makeProjectFixture(), ['shot-1'], 'serial')
    await repository.save(run)

    expect(await repository.load(run.id)).toEqual(run)

    const updated = {
      ...run,
      status: 'running' as const,
      updatedAt: '2026-08-13T10:00:00.000Z',
      logs: [
        ...run.logs,
        {
          id: 'log-running',
          timestamp: '2026-08-13T10:00:00.000Z',
          level: 'info' as const,
          message: '运行已开始',
        },
      ],
    }
    await repository.save(updated)

    expect(await repository.load(run.id)).toEqual(updated)
  })

  test('lists only the requested project with newest updates first', async () => {
    const repository = createRepository()
    const base = makeProjectFixture()
    const older = {
      ...buildWorkflowRun(base, ['shot-1'], 'serial'),
      id: 'older',
      updatedAt: '2026-08-13T08:00:00.000Z',
    }
    const newer = {
      ...buildWorkflowRun(base, ['shot-1'], 'parallel'),
      id: 'newer',
      updatedAt: '2026-08-13T09:00:00.000Z',
    }
    const otherProject = {
      ...newer,
      id: 'other',
      projectId: 'project-other',
    }

    await Promise.all([
      repository.save(older),
      repository.save(newer),
      repository.save(otherProject),
    ])

    expect(
      (await repository.listByProject(base.id)).map(({ id }) => id),
    ).toEqual(['newer', 'older'])
  })

  test('opens a version 3 database without losing projects or library schema', async () => {
    const name = `wireless-canvas-workflow-legacy-${crypto.randomUUID()}`
    databaseNames.push(name)
    const legacy = new Dexie(name)
    legacy.version(3).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, &fingerprint',
    })
    await legacy.open()
    const project = makeProjectFixture()
    await legacy.table('projects').put(project)
    legacy.close()

    const database = new WirelessCanvasDatabase(name)
    const workflows = new WorkflowRepository(database)

    expect(await new ProjectRepository(database).load(project.id)).toEqual(project)
    expect(await workflows.listByProject(project.id)).toEqual([])

    const run = buildWorkflowRun(project, ['shot-1'], 'serial')
    await workflows.save(run)
    expect(await workflows.load(run.id)).toEqual(run)
  })
})
