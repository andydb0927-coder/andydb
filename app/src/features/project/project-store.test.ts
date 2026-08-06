import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { appendNodeVersion, createProject, type CanvasNode } from './model'
import {
  WirelessCanvasDatabase,
  ProjectRepository,
} from './project-repository'
import { useProjectStore } from './project-store'

const databaseNames: string[] = []

function createRepository() {
  const name = `wireless-canvas-test-${crypto.randomUUID()}`
  databaseNames.push(name)
  return new ProjectRepository(new WirelessCanvasDatabase(name))
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

function activateFixture() {
  const project = makeProjectFixture()
  useProjectStore.setState({
    projectsById: { [project.id]: project },
    activeProjectId: project.id,
    activeProject: project,
    saveStatus: 'saved',
    past: [],
    future: [],
  })
}

beforeEach(() => {
  activateFixture()
})

afterEach(async () => {
  vi.restoreAllMocks()
  useProjectStore.setState({
    projectsById: {},
    activeProjectId: undefined,
    activeProject: undefined,
    saveStatus: 'saved',
    past: [],
    future: [],
  })

  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('project domain', () => {
  test('creates an empty project ready for canvas editing', () => {
    const project = createProject('霜河渡', '雨夜寻找失踪的弟弟')

    expect(project.title).toBe('霜河渡')
    expect(project.intent).toBe('雨夜寻找失踪的弟弟')
    expect(project.timeline).toEqual([])
    expect(project.nodes).toEqual([])
    expect(project.assets).toEqual([])
  })

  test('appends a node version without changing prior versions or asset records', () => {
    const projectWithFixture = makeProjectFixture()

    const next = appendNodeVersion(projectWithFixture, 'shot-1', {
      assetId: 'asset-shot-river-v2',
      prompt: '近景，人物望向河面',
    })

    expect(next).not.toBe(projectWithFixture)
    expect(next.nodes[0].versions).toHaveLength(2)
    expect(next.nodes[0].activeVersionId).toBe(next.nodes[0].versions[1].id)
    expect(next.nodes[0].versions[0].assetId).toBe('asset-shot-river-v1')
    expect(
      next.assets.find((asset) => asset.id === 'asset-shot-river-v1')?.url,
    ).toBe('/demo/shot-river.png')
    expect(projectWithFixture.nodes[0].versions).toHaveLength(1)
  })
})

describe('project repository', () => {
  test('round-trips the complete project graph through IndexedDB', async () => {
    const repository = createRepository()
    const project = makeProjectFixture()

    await repository.save(project)
    const reloaded = await repository.load(project.id)

    expect(reloaded?.id).toBe('project-frost-river')
    expect(reloaded?.assets).toEqual(project.assets)
    expect(reloaded?.nodes.map((node) => node.position)).toEqual([
      { x: 120, y: 240 },
      { x: 520, y: 240 },
    ])
    expect(reloaded?.edges).toEqual(project.edges)
    expect(reloaded?.nodes.map((node) => node.versions)).toEqual(
      project.nodes.map((node) => node.versions),
    )
    expect(reloaded?.timeline.map((item) => item.id)).toEqual([
      'timeline-shot-1',
      'timeline-rain-audio',
    ])
  })

  test('lists the most recently updated projects first and respects the limit', async () => {
    const repository = createRepository()
    const older = makeProjectFixture()
    const newer = {
      ...createProject('新项目', '新意图'),
      updatedAt: '2026-08-07T08:00:00.000Z',
    }

    await repository.save(older)
    await repository.save(newer)

    const recent = await repository.listRecent(1)

    expect(recent.map((project) => project.id)).toEqual([newer.id])
  })
})

describe('project store history and persistence', () => {
  test('applies add, connect, version, timeline, reorder, and delete as immutable edits', () => {
    const newNode: CanvasNode = {
      id: 'shot-2',
      kind: 'video',
      title: '桥下追踪',
      position: { x: 760, y: 320 },
      versions: [],
      activeVersionId: '',
      sourceChanged: false,
    }

    useProjectStore.getState().addNode(newNode)
    useProjectStore.getState().connectNodes({
      id: 'edge-shot-1-to-shot-2',
      sourceNodeId: 'shot-1',
      targetNodeId: 'shot-2',
    })
    useProjectStore.getState().appendVersion('shot-2', {
      prompt: '中景，人物从桥下跑过',
      generationJobId: 'generation-job-2',
    })
    useProjectStore.getState().addToTimeline({
      id: 'timeline-shot-2',
      nodeId: 'shot-2',
      order: 2,
      durationSeconds: 5,
      track: 'video',
    })
    useProjectStore
      .getState()
      .reorderTimeline(['timeline-shot-2', 'timeline-shot-1', 'timeline-rain-audio'])

    let active = useProjectStore.getState().activeProject
    expect(active?.nodes.find((node) => node.id === 'shot-2')?.versions).toHaveLength(1)
    expect(active?.edges.some((edge) => edge.targetNodeId === 'shot-2')).toBe(true)
    expect(active?.timeline.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: 'timeline-shot-2', order: 0 },
      { id: 'timeline-shot-1', order: 1 },
      { id: 'timeline-rain-audio', order: 2 },
    ])

    useProjectStore.getState().deleteNode('shot-2')
    active = useProjectStore.getState().activeProject
    expect(active?.nodes.some((node) => node.id === 'shot-2')).toBe(false)
    expect(active?.edges.some((edge) => edge.targetNodeId === 'shot-2')).toBe(false)
    expect(active?.timeline.some((item) => item.nodeId === 'shot-2')).toBe(false)
  })

  test('undoes and redoes whole-project edits and a new edit clears the future', () => {
    useProjectStore
      .getState()
      .updateNode('shot-1', { position: { x: 900, y: 460 } })

    expect(
      useProjectStore.getState().activeProject?.nodes[0].position,
    ).toEqual({ x: 900, y: 460 })

    useProjectStore.getState().undo()
    expect(
      useProjectStore.getState().activeProject?.nodes[0].position,
    ).toEqual({ x: 120, y: 240 })

    useProjectStore.getState().redo()
    expect(
      useProjectStore.getState().activeProject?.nodes[0].position,
    ).toEqual({ x: 900, y: 460 })

    useProjectStore.getState().undo()
    useProjectStore.getState().updateNode('shot-1', { title: '河岸重逢' })
    useProjectStore.getState().redo()

    expect(useProjectStore.getState().activeProject?.nodes[0].title).toBe(
      '河岸重逢',
    )
    expect(
      useProjectStore.getState().activeProject?.nodes[0].position,
    ).toEqual({ x: 120, y: 240 })
    expect(useProjectStore.getState().future).toEqual([])
  })

  test('updateNode cannot replace immutable versions or select an unknown active version', () => {
    const originalNode = useProjectStore.getState().activeProject?.nodes[0]
    const unsafeChanges = {
      title: '只更新可编辑标题',
      versions: [],
      activeVersionId: 'unknown-version',
    } as unknown as Parameters<
      ReturnType<typeof useProjectStore.getState>['updateNode']
    >[1]

    useProjectStore.getState().updateNode('shot-1', unsafeChanges)

    const updatedNode = useProjectStore.getState().activeProject?.nodes[0]
    expect(updatedNode?.title).toBe('只更新可编辑标题')
    expect(updatedNode?.versions).toEqual(originalNode?.versions)
    expect(updatedNode?.activeVersionId).toBe('version-shot-river-v1')
  })

  test('rejects a timeline reorder containing duplicate IDs without adding history', () => {
    const originalTimeline = useProjectStore.getState().activeProject?.timeline

    useProjectStore
      .getState()
      .reorderTimeline(['timeline-shot-1', 'timeline-shot-1'])

    expect(useProjectStore.getState().activeProject?.timeline).toEqual(
      originalTimeline,
    )
    expect(useProjectStore.getState().past).toEqual([])
  })

  test('deleting a node removes its generation jobs and undo restores them', () => {
    useProjectStore.getState().deleteNode('shot-1')

    expect(
      useProjectStore
        .getState()
        .activeProject?.jobs.some((job) => job.nodeId === 'shot-1'),
    ).toBe(false)

    useProjectStore.getState().undo()

    expect(
      useProjectStore
        .getState()
        .activeProject?.jobs.map((job) => job.id),
    ).toEqual(['generation-job-shot-1'])
  })

  test('keeps an edit after a rejected save and allows a later retry', async () => {
    useProjectStore.getState().updateNode('shot-1', { title: '失败后仍保留' })
    const save = vi
      .fn<(project: ReturnType<typeof makeProjectFixture>) => Promise<void>>()
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValueOnce(undefined)
    const repository = { save }

    await useProjectStore.getState().persistActive(repository)

    expect(useProjectStore.getState().saveStatus).toBe('failed')
    expect(useProjectStore.getState().activeProject?.nodes[0].title).toBe(
      '失败后仍保留',
    )

    await useProjectStore.getState().persistActive(repository)

    expect(useProjectStore.getState().saveStatus).toBe('saved')
    expect(useProjectStore.getState().activeProject?.nodes[0].title).toBe(
      '失败后仍保留',
    )
  })

  test('does not mark a newer edit saved when an older snapshot finishes saving', async () => {
    const deferred = createDeferred<void>()
    const persistence = useProjectStore
      .getState()
      .persistActive({ save: () => deferred.promise })
    useProjectStore.getState().updateNode('shot-1', { title: '保存期间的新编辑' })

    deferred.resolve(undefined)
    await persistence

    expect(useProjectStore.getState().saveStatus).toBe('saving')
    expect(useProjectStore.getState().activeProject?.nodes[0].title).toBe(
      '保存期间的新编辑',
    )
  })

  test('ignores a stale save failure after hydration activates another project', async () => {
    const saveDeferred = createDeferred<void>()
    const persistence = useProjectStore
      .getState()
      .persistActive({ save: () => saveDeferred.promise })
    const hydrated = {
      ...createProject('新激活项目', '切换项目'),
      id: 'project-hydrated',
    }

    await useProjectStore
      .getState()
      .hydrate(hydrated.id, { load: async () => hydrated })
    saveDeferred.reject(new Error('stale request failure'))
    await persistence

    expect(useProjectStore.getState().activeProject?.id).toBe('project-hydrated')
    expect(useProjectStore.getState().saveStatus).toBe('saved')
  })

  test('ignores an older overlapping save after the latest save succeeds', async () => {
    const first = createDeferred<void>()
    const second = createDeferred<void>()
    const save = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    const olderPersistence = useProjectStore.getState().persistActive({ save })
    const latestPersistence = useProjectStore.getState().persistActive({ save })
    second.resolve(undefined)
    await latestPersistence
    first.reject(new Error('older request failed late'))
    await olderPersistence

    expect(useProjectStore.getState().saveStatus).toBe('saved')
  })

  test('reports offline without discarding the local edit', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    useProjectStore.getState().updateNode('shot-1', { title: '离线本地编辑' })
    const save = vi.fn<() => Promise<void>>()

    await useProjectStore.getState().persistActive({ save })

    expect(save).not.toHaveBeenCalled()
    expect(useProjectStore.getState().saveStatus).toBe('offline')
    expect(useProjectStore.getState().activeProject?.nodes[0].title).toBe(
      '离线本地编辑',
    )
  })

  test('hydrates a saved project without creating an undo entry', async () => {
    const repository = createRepository()
    const project = makeProjectFixture()
    await repository.save(project)
    useProjectStore.setState({
      projectsById: {},
      activeProjectId: undefined,
      activeProject: undefined,
      past: [],
      future: [],
    })

    await useProjectStore.getState().hydrate(project.id, repository)

    expect(useProjectStore.getState().activeProject?.id).toBe(project.id)
    expect(useProjectStore.getState().past).toEqual([])
  })

  test('clears a stale active project when the requested project is missing', async () => {
    const hydrated = await useProjectStore
      .getState()
      .hydrate('project-missing', { load: async () => undefined })

    expect(hydrated).toBe(false)
    expect(useProjectStore.getState().activeProjectId).toBeUndefined()
    expect(useProjectStore.getState().activeProject).toBeUndefined()
    expect(useProjectStore.getState().past).toEqual([])
    expect(useProjectStore.getState().future).toEqual([])
  })

  test('allows only the latest overlapping hydration to activate a project', async () => {
    const first = createDeferred<ReturnType<typeof makeProjectFixture>>()
    const second = createDeferred<ReturnType<typeof makeProjectFixture>>()
    const firstProject = {
      ...makeProjectFixture(),
      id: 'project-first',
      title: '先选项目',
    }
    const secondProject = {
      ...makeProjectFixture(),
      id: 'project-second',
      title: '后选项目',
    }
    const load = vi.fn((projectId: string) =>
      projectId === firstProject.id ? first.promise : second.promise,
    )

    const firstHydration = useProjectStore
      .getState()
      .hydrate(firstProject.id, { load })
    const secondHydration = useProjectStore
      .getState()
      .hydrate(secondProject.id, { load })

    second.resolve(secondProject)
    expect(await secondHydration).toBe(true)
    first.resolve(firstProject)
    expect(await firstHydration).toBe(false)

    expect(useProjectStore.getState().activeProject?.id).toBe(
      secondProject.id,
    )
  })
})
