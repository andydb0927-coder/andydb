import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { AssetLibraryRepository } from '../assets/asset-library-repository'
import type { Project } from './model'
import { ProjectRepository, WirelessCanvasDatabase } from './project-repository'
import { useProjectStore } from './project-store'

const databases: WirelessCanvasDatabase[] = []
function repositories() {
  const database = new WirelessCanvasDatabase(`foundation-persistence-${crypto.randomUUID()}`)
  databases.push(database)
  return { database, repository: new ProjectRepository(database), library: new AssetLibraryRepository(database) }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(async () => {
  const fixture = makeProjectFixture()
  await useProjectStore.getState().hydrate(fixture.id, { load: async () => fixture })
})

afterEach(async () => {
  vi.restoreAllMocks()
  useProjectStore.setState({ projectsById: {}, activeProjectId: undefined, activeProject: undefined, past: [], future: [], saveStatus: 'saved' })
  for (const database of databases.splice(0)) {
    database.close()
    await Dexie.delete(database.name)
  }
})

describe('项目保存恢复兼容契约', () => {
  test('旧项目规范化后重复保存恢复幂等，不复制资产/版本/任务或丢失其他画布', async () => {
    const { database, repository, library } = repositories()
    const normalized = useProjectStore.getState().activeProject!
    const secondary = { ...normalized.canvases![0], id: 'secondary', title: '第二画布', viewport: { x: 35, y: -20, zoom: 0.5 } }
    await useProjectStore.getState().hydrate(normalized.id, { load: async () => ({ ...normalized, canvases: [...normalized.canvases!, secondary] }) })
    await useProjectStore.getState().persistActive(repository)
    await library.rename(normalized.assets[0].id, '手工命名不能被覆盖')
    await library.move(normalized.assets[0].id, 'inspiration')
    const saved = await repository.load(normalized.id)
    const assets = await library.list()
    for (let index = 0; index < 3; index += 1) {
      expect(await useProjectStore.getState().hydrate(normalized.id, repository)).toBe(true)
      await useProjectStore.getState().persistActive(repository)
      expect(await repository.load(normalized.id)).toEqual(saved)
      expect(await library.list()).toEqual(assets)
      expect(useProjectStore.getState().past).toEqual([])
      expect(useProjectStore.getState().saveStatus).toBe('saved')
    }
    expect(await database.projects.count()).toBe(1)
    expect(await database.libraryAssets.count()).toBe(normalized.assets.length)
  })

  test('加载失败不覆盖当前草稿与撤销栈，原错误抛给调用者后可重试', async () => {
    useProjectStore.getState().updateNode('shot-1', { title: '未保存的草稿' })
    const before = useProjectStore.getState()
    const failure = new Error('fixture read failed')
    const load = vi.fn<(id: string) => Promise<Project | undefined>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ ...makeProjectFixture(), id: 'second' })
    await expect(useProjectStore.getState().hydrate('second', { load })).rejects.toBe(failure)
    expect(useProjectStore.getState().activeProject).toBe(before.activeProject)
    expect(useProjectStore.getState().past).toBe(before.past)
    expect(useProjectStore.getState().saveStatus).toBe('dirty')
    expect(await useProjectStore.getState().hydrate('second', { load })).toBe(true)
    expect(useProjectStore.getState().activeProjectId).toBe('second')
    expect(useProjectStore.getState().past).toEqual([])
  })

  test('加载期间取消不激活返回的项目，不清当前草稿', async () => {
    useProjectStore.getState().updateNode('shot-1', { title: '仍在编辑' })
    const before = useProjectStore.getState()
    const pending = deferred<Project | undefined>()
    const controller = new AbortController()
    const hydration = useProjectStore.getState().hydrate('second', { load: () => pending.promise }, controller.signal)
    controller.abort()
    pending.resolve({ ...makeProjectFixture(), id: 'second' })
    expect(await hydration).toBe(false)
    expect(useProjectStore.getState().activeProject).toBe(before.activeProject)
    expect(useProjectStore.getState().saveStatus).toBe('dirty')
  })

  test('旧写入失败后已排队的新快照仍会保存，失败不毒化串行写链', async () => {
    const first = deferred<void>()
    const save = vi.fn<(project: Project) => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(undefined)
    const oldSave = useProjectStore.getState().persistActive({ save })
    useProjectStore.getState().updateNode('shot-1', { title: '最终快照' })
    const newSave = useProjectStore.getState().persistActive({ save })
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    first.reject(new Error('fixture first write failed'))
    await Promise.all([oldSave, newSave])
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][0].nodes[0].title).toBe('最终快照')
    expect(useProjectStore.getState().activeProject?.nodes[0].title).toBe('最终快照')
    expect(useProjectStore.getState().saveStatus).toBe('saved')
  })

  test('项目写入失败回滚同事务的素材索引，重试后两者一致', async () => {
    const { database, repository, library } = repositories()
    const project = useProjectStore.getState().activeProject!
    const failure = new Error('fixture project write failure')
    vi.spyOn(database.projects, 'put').mockRejectedValueOnce(failure)
    await expect(repository.save(project)).rejects.toBe(failure)
    expect(await repository.load(project.id)).toBeUndefined()
    expect(await library.list()).toEqual([])
    await repository.save(project)
    expect(await repository.load(project.id)).toEqual(project)
    expect(await library.list()).toHaveLength(project.assets.length)
  })
})
