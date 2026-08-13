import Dexie from 'dexie'
import { afterEach, describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import { ProjectSpaceRepository } from './project-space-repository'

const databaseNames: string[] = []

function createRepositories() {
  const name = `project-space-${crypto.randomUUID()}`
  databaseNames.push(name)
  const database = new WirelessCanvasDatabase(name)
  let sequence = 0
  return {
    database,
    projects: new ProjectRepository(database),
    projectSpace: new ProjectSpaceRepository(database, {
      now: () => '2026-08-13T08:00:00.000Z',
      randomId: () => `folder-${++sequence}`,
    }),
  }
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('project space repository', () => {
  test('upgrades a version 8 workspace without losing existing projects', async () => {
    const name = `project-space-v8-${crypto.randomUUID()}`
    databaseNames.push(name)
    const legacy = new Dexie(name)
    legacy.version(8).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, &fingerprint',
      workflowRuns: 'id, projectId, updatedAt, status',
      timelineProjects: 'id, projectId, updatedAt',
      publishedWorks: 'id, &projectId, status, publishedAt, updatedAt',
      collaborators: 'id, projectId, role, updatedAt',
      changeComments: 'id, projectId, targetType, targetId, status, createdAt',
      membership: 'id, plan, status, updatedAt',
      homeContent: 'id, kind, category, order',
    })
    await legacy.open()
    await legacy.table('projects').put(makeProjectFixture())
    legacy.close()

    const database = new WirelessCanvasDatabase(name)
    const projectSpace = new ProjectSpaceRepository(database)

    expect(await projectSpace.listFolders()).toEqual([])
    expect((await database.projects.toArray())[0].title).toBe('霜河渡')
  })

  test('creates trimmed folders in stable name order and rejects empty or duplicate names', async () => {
    const { projectSpace } = createRepositories()

    await projectSpace.createFolder('  B 目录  ')
    await projectSpace.createFolder('A 目录')

    expect(await projectSpace.listFolders()).toEqual([
      expect.objectContaining({ id: 'folder-2', name: 'A 目录' }),
      expect.objectContaining({ id: 'folder-1', name: 'B 目录' }),
    ])
    await expect(projectSpace.createFolder('   ')).rejects.toThrow('请输入文件夹名称')
    await expect(projectSpace.createFolder('b 目录')).rejects.toThrow('文件夹名称已存在')
  })

  test('moves an existing project into a folder and back to unclassified', async () => {
    const { projects, projectSpace } = createRepositories()
    const project = makeProjectFixture()
    await projects.save(project)
    const folder = await projectSpace.createFolder('短片')

    await projectSpace.moveProject(project.id, folder.id)
    expect(await projectSpace.listLocations()).toEqual([
      {
        projectId: project.id,
        folderId: folder.id,
        updatedAt: '2026-08-13T08:00:00.000Z',
      },
    ])

    await projectSpace.moveProject(project.id)
    expect(await projectSpace.listLocations()).toEqual([])
  })

  test('rejects locations for missing projects or folders without writing orphan records', async () => {
    const { projects, projectSpace } = createRepositories()
    const project = makeProjectFixture()
    await projects.save(project)

    await expect(projectSpace.moveProject('missing-project')).rejects.toThrow('项目不存在')
    await expect(projectSpace.moveProject(project.id, 'missing-folder')).rejects.toThrow('文件夹不存在')
    expect(await projectSpace.listLocations()).toEqual([])
  })
})
