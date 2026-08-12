import Dexie from 'dexie'
import { afterEach, describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { deriveLibraryRecord } from '../assets/library-model'
import { WirelessCanvasDatabase } from '../project/project-repository'
import { createTimelineProject } from '../timeline/timeline-project'
import { CollaborationRepository } from './collaboration-repository'
import { ProjectPackageRepository } from './project-package-repository'

const names: string[] = []

function createDatabase() {
  const name = `project-package-${crypto.randomUUID()}`
  names.push(name)
  return new WirelessCanvasDatabase(name)
}

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)))
})

describe('project package repository', () => {
  test('exports project, referenced library assets, timeline and collaboration', async () => {
    const database = createDatabase()
    const project = makeProjectFixture()
    await database.projects.put(project)
    await database.libraryAssets.put(deriveLibraryRecord(project, project.assets[0]))
    await database.timelineProjects.put(createTimelineProject(project))
    const collaboration = new CollaborationRepository(database)
    await collaboration.ensureOwner(project.id)
    await collaboration.addComment(project.id, 'node', 'shot-1', '保留雨夜氛围')

    const packageValue = await new ProjectPackageRepository(database).exportProject(project.id)

    expect(packageValue.project).toEqual(project)
    expect(packageValue.libraryAssets.map(({ id }) => id)).toEqual(['asset-shot-river-v1'])
    expect(packageValue.timeline?.projectId).toBe(project.id)
    expect(packageValue.collaboration.collaborators[0].role).toBe('owner')
    expect(packageValue.collaboration.comments[0].body).toBe('保留雨夜氛围')
  })

  test('restores a package transactionally into another local database', async () => {
    const source = createDatabase()
    const project = makeProjectFixture()
    await source.projects.put(project)
    await source.timelineProjects.put(createTimelineProject(project))
    await new CollaborationRepository(source).ensureOwner(project.id)
    const packageValue = await new ProjectPackageRepository(source).exportProject(project.id)

    const target = createDatabase()
    await new ProjectPackageRepository(target).importProject(packageValue)

    expect(await target.projects.get(project.id)).toEqual(project)
    expect((await target.timelineProjects.toArray())[0].projectId).toBe(project.id)
    expect((await target.collaborators.toArray())[0].role).toBe('owner')
  })

  test('creates a workspace backup containing every local project', async () => {
    const database = createDatabase()
    const first = makeProjectFixture()
    const second = { ...makeProjectFixture(), id: 'project-second', title: '第二项目' }
    await database.projects.bulkPut([first, second])

    const backup = await new ProjectPackageRepository(database).exportWorkspace()
    expect(backup.kind).toBe('wireless-canvas-workspace')
    expect(backup.projects.map(({ project }) => project.id).sort()).toEqual([
      'project-frost-river',
      'project-second',
    ])
  })
})
