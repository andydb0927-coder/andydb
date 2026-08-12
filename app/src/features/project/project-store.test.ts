import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import {
  appendNodeVersion,
  createProject,
  type Asset,
  type CanvasNode,
  type DependencyEdge,
} from './model'
import {
  WirelessCanvasDatabase,
  ProjectRepository,
} from './project-repository'
import { AssetLibraryRepository } from '../assets/asset-library-repository'
import { buildCreativeCardCreation } from './creative-card'
import { useProjectStore } from './project-store'

const databaseNames: string[] = []

async function createVersionOneDatabase(project: ReturnType<typeof makeProjectFixture>) {
  const databaseName = `wireless-canvas-v1-${crypto.randomUUID()}`
  databaseNames.push(databaseName)
  const legacy = new Dexie(databaseName)
  legacy.version(1).stores({ projects: 'id, updatedAt' })
  await legacy.open()
  await legacy.table('projects').put(project)

  return { databaseName, legacy }
}

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
  test('opens a version 1 project database after adding the library table', async () => {
    const project = makeProjectFixture()
    const { databaseName, legacy } = await createVersionOneDatabase(project)
    legacy.close()
    const database = new WirelessCanvasDatabase(databaseName)

    expect(await new ProjectRepository(database).load(project.id)).toEqual(project)
    expect(await new AssetLibraryRepository(database).list()).toEqual([])
  })

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
  test('edits a creative card atomically, invalidates downstream nodes, and supports undo', () => {
    const base = useProjectStore.getState().activeProject!
    const upstreamCreation = buildCreativeCardCreation(
      base,
      {
        kind: 'worldview',
        title: '世界观卡 01',
        background: '潮汐城',
        artStyle: '低饱和蓝绿',
        rules: '',
      },
      { x: 0, y: 80 },
      {
        now: () => '2026-08-13T08:00:00.000Z',
        randomId: (() => {
          const ids = ['worldview-card', 'worldview-version-1']
          return () => ids.shift()!
        })(),
      },
    )
    const creation = buildCreativeCardCreation(
      base,
      {
        kind: 'script',
        title: '剧本卡 01',
        scenes: '场一：河岸',
        dialogue: '',
        shotNotes: '',
      },
      { x: 40, y: 80 },
      {
        now: () => '2026-08-13T08:00:00.000Z',
        randomId: (() => {
          const ids = ['script-card', 'script-version-1']
          return () => ids.shift()!
        })(),
      },
    )
    const project = {
      ...base,
      nodes: [creation.node, upstreamCreation.node, ...base.nodes],
      edges: [
        ...base.edges,
        {
          id: 'worldview-to-script',
          sourceNodeId: upstreamCreation.node.id,
          targetNodeId: creation.node.id,
          sourceChanged: true,
        },
        {
          id: 'script-to-shot',
          sourceNodeId: creation.node.id,
          targetNodeId: 'shot-1',
        },
      ],
    }
    useProjectStore.setState({
      projectsById: { [project.id]: project },
      activeProjectId: project.id,
      activeProject: project,
      saveStatus: 'saved',
      past: [],
      future: [],
    })

    useProjectStore.getState().updateCreativeCard('script-card', {
      kind: 'script',
      title: '剧本卡 01',
      scenes: '场一：河岸\n场二：桥下',
      dialogue: '林渊：等我。',
      shotNotes: '横移跟拍。',
    })

    const edited = useProjectStore.getState().activeProject!
    expect(edited.nodes[0].versions).toHaveLength(2)
    expect(
      edited.edges.find(({ id }) => id === 'worldview-to-script')?.sourceChanged,
    ).toBe(false)
    expect(edited.nodes.find(({ id }) => id === 'shot-1')?.sourceChanged).toBe(true)
    expect(useProjectStore.getState().past).toEqual([project])
    expect(useProjectStore.getState().saveStatus).toBe('dirty')

    useProjectStore.getState().undo()
    expect(useProjectStore.getState().activeProject).toEqual(project)
    useProjectStore.getState().redo()
    expect(
      useProjectStore.getState().activeProject?.nodes[0].versions,
    ).toHaveLength(2)
  })

  test('creates canvas content atomically through undo and redo', () => {
    const originalProject = useProjectStore.getState().activeProject!
    const node: CanvasNode = {
      id: 'image-created',
      kind: 'image',
      title: '图片 01',
      position: { x: 420, y: 300 },
      versions: [
        {
          id: 'version-image-created',
          createdAt: '2026-08-09T08:00:00.000Z',
          prompt: '雨夜参考',
          assetId: 'asset-image-created',
        },
      ],
      activeVersionId: 'version-image-created',
      sourceChanged: false,
    }
    const asset: Asset = {
      id: 'asset-image-created',
      kind: 'image',
      url: 'data:image/png;base64,AA==',
      mimeType: 'image/png',
    }

    useProjectStore.getState().createCanvasContent({ node, asset })

    expect(useProjectStore.getState().activeProject?.nodes.at(-1)).toEqual(node)
    expect(useProjectStore.getState().activeProject?.assets.at(-1)).toEqual(
      asset,
    )
    expect(useProjectStore.getState().past).toEqual([originalProject])
    expect(useProjectStore.getState().future).toEqual([])
    expect(useProjectStore.getState().saveStatus).toBe('dirty')

    useProjectStore.getState().undo()
    expect(
      useProjectStore
        .getState()
        .activeProject?.nodes.some(({ id }) => id === node.id),
    ).toBe(false)
    expect(
      useProjectStore
        .getState()
        .activeProject?.assets.some(({ id }) => id === asset.id),
    ).toBe(false)

    useProjectStore.getState().redo()
    expect(
      useProjectStore
        .getState()
        .activeProject?.nodes.some(({ id }) => id === node.id),
    ).toBe(true)
    expect(
      useProjectStore
        .getState()
        .activeProject?.assets.some(({ id }) => id === asset.id),
    ).toBe(true)
  })

  test.each([
    ['node', 'shot-1', 'asset-new'],
    ['asset', 'node-new', 'asset-shot-river-v1'],
  ] as const)(
    'rejects a duplicate canvas %s ID without changing project history',
    (_conflict, nodeId, assetId) => {
      const originalProject = useProjectStore.getState().activeProject
      const node: CanvasNode = {
        id: nodeId,
        kind: 'image',
        title: '冲突图片',
        position: { x: 420, y: 300 },
        versions: [],
        activeVersionId: '',
        sourceChanged: false,
      }
      const asset: Asset = {
        id: assetId,
        kind: 'image',
        url: 'data:image/png;base64,AA==',
        mimeType: 'image/png',
      }

      useProjectStore.getState().createCanvasContent({ node, asset })

      expect(useProjectStore.getState().activeProject).toBe(originalProject)
      expect(useProjectStore.getState().past).toEqual([])
      expect(useProjectStore.getState().future).toEqual([])
      expect(useProjectStore.getState().saveStatus).toBe('saved')
    },
  )

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
      assetId: 'asset-shot-river-v1',
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

  test('adds an image-backed storyboard once through the shared timeline entry', () => {
    const project = useProjectStore.getState().activeProject!
    const withoutShot = {
      ...project,
      timeline: project.timeline.filter(({ nodeId }) => nodeId !== 'shot-1'),
    }
    useProjectStore.setState({
      activeProject: withoutShot,
      projectsById: { [withoutShot.id]: withoutShot },
    })
    useProjectStore.getState().addToTimeline({
      id: 'timeline-storyboard',
      nodeId: 'shot-1',
      order: 2,
      durationSeconds: 5,
      track: 'video',
    })
    useProjectStore.getState().addToTimeline({
      id: 'timeline-storyboard-duplicate',
      nodeId: 'shot-1',
      order: 3,
      durationSeconds: 5,
      track: 'video',
    })

    expect(
      useProjectStore
        .getState()
        .activeProject?.timeline.filter(({ nodeId }) => nodeId === 'shot-1'),
    ).toHaveLength(1)
  })

  test('connects and disconnects one dependency per history entry', () => {
    const original = useProjectStore.getState().activeProject!
    const text = {
      ...original.nodes[0],
      id: 'text-source',
      kind: 'text' as const,
      title: '文本来源',
    }
    const video = {
      ...original.nodes[0],
      id: 'video-consumer',
      kind: 'video' as const,
      title: '视频结果',
    }
    const project = {
      ...original,
      nodes: [text, { ...original.nodes[0], sourceChanged: false }, video],
      edges: [
        {
          id: 'storyboard-video',
          sourceNodeId: original.nodes[0].id,
          targetNodeId: video.id,
        },
      ],
    }
    useProjectStore.setState({
      projectsById: { [project.id]: project },
      activeProjectId: project.id,
      activeProject: project,
      saveStatus: 'saved',
      past: [],
      future: [],
    })

    expect(
      useProjectStore.getState().connectNodes({
        id: 'text-storyboard',
        sourceNodeId: text.id,
        targetNodeId: original.nodes[0].id,
      }),
    ).toEqual({ ok: true })
    expect(useProjectStore.getState().past).toHaveLength(1)
    expect(
      useProjectStore.getState().activeProject?.nodes
        .filter(({ sourceChanged }) => sourceChanged)
        .map(({ id }) => id),
    ).toEqual([original.nodes[0].id, video.id])

    expect(useProjectStore.getState().disconnectNodes('text-storyboard')).toBe(
      true,
    )
    expect(useProjectStore.getState().past).toHaveLength(2)
    expect(useProjectStore.getState().activeProject?.edges).toEqual([
      { ...project.edges[0], sourceChanged: true },
    ])
    useProjectStore.getState().undo()
    expect(
      useProjectStore
        .getState()
        .activeProject?.edges.some(({ id }) => id === 'text-storyboard'),
    ).toBe(true)
  })

  test('returns a reason and leaves state identity untouched for invalid changes', () => {
    const before = useProjectStore.getState()
    const result = before.connectNodes({
      id: 'invalid',
      sourceNodeId: 'shot-1',
      targetNodeId: 'rain-audio',
    })
    expect(result).toEqual({ ok: false, reason: 'duplicate' })
    expect(useProjectStore.getState().activeProject).toBe(before.activeProject)
    expect(useProjectStore.getState().saveStatus).toBe('saved')
    expect(useProjectStore.getState().past).toEqual([])
    expect(useProjectStore.getState().future).toEqual([])
    expect(useProjectStore.getState().disconnectNodes('missing-edge')).toBe(false)
    expect(useProjectStore.getState().activeProject).toBe(before.activeProject)
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

  test('marks canvas mutations and history traversal dirty until persisted', () => {
    expect(useProjectStore.getState().saveStatus).toBe('saved')

    useProjectStore.getState().updateNode('shot-1', {
      position: { x: 640, y: 360 },
    })
    expect(useProjectStore.getState().saveStatus).toBe('dirty')

    useProjectStore.setState({ saveStatus: 'saved' })
    useProjectStore.getState().undo()
    expect(useProjectStore.getState().saveStatus).toBe('dirty')

    useProjectStore.setState({ saveStatus: 'saved' })
    useProjectStore.getState().redo()
    expect(useProjectStore.getState().saveStatus).toBe('dirty')
  })

  test('persists a moved node and the later undo snapshot through Dexie', async () => {
    const repository = createRepository()

    useProjectStore.getState().updateNodePositions([
      { nodeId: 'shot-1', position: { x: 640, y: 360 } },
    ])
    await useProjectStore.getState().persistActive(repository)
    expect((await repository.load('project-frost-river'))?.nodes[0].position).toEqual({
      x: 640,
      y: 360,
    })

    useProjectStore.getState().undo()
    await useProjectStore.getState().persistActive(repository)
    useProjectStore.setState({
      projectsById: {},
      activeProjectId: undefined,
      activeProject: undefined,
      saveStatus: 'saved',
      past: [],
      future: [],
    })
    await useProjectStore
      .getState()
      .hydrate('project-frost-river', repository)

    expect(useProjectStore.getState().activeProject?.nodes[0].position).toEqual({
      x: 120,
      y: 240,
    })
  })

  test('persists connected and disconnected dependencies through Dexie and undo', async () => {
    const repository = createRepository()
    const original = useProjectStore.getState().activeProject!
    const text = {
      ...original.nodes[0],
      id: 'text-source',
      kind: 'text' as const,
      title: '文本来源',
    }
    const video = {
      ...original.nodes[0],
      id: 'video-consumer',
      kind: 'video' as const,
      title: '视频结果',
    }
    const project = {
      ...original,
      nodes: [text, { ...original.nodes[0], sourceChanged: false }, video],
      edges: [
        {
          id: 'storyboard-video',
          sourceNodeId: original.nodes[0].id,
          targetNodeId: video.id,
        },
      ],
    }
    useProjectStore.setState({
      projectsById: { [project.id]: project },
      activeProjectId: project.id,
      activeProject: project,
      saveStatus: 'saved',
      past: [],
      future: [],
    })

    expect(
      useProjectStore.getState().connectNodes({
        id: 'text-storyboard',
        sourceNodeId: text.id,
        targetNodeId: original.nodes[0].id,
      }),
    ).toEqual({ ok: true })
    await useProjectStore.getState().persistActive(repository)
    useProjectStore.setState({
      projectsById: {},
      activeProjectId: undefined,
      activeProject: undefined,
      saveStatus: 'saved',
      past: [],
      future: [],
    })
    await useProjectStore.getState().hydrate(project.id, repository)
    expect(useProjectStore.getState().activeProject?.edges.map(({ id }) => id)).toEqual([
      'storyboard-video',
      'text-storyboard',
    ])
    expect(
      useProjectStore.getState().activeProject?.edges.map(
        ({ id, sourceChanged }) => ({ id, sourceChanged }),
      ),
    ).toEqual([
      { id: 'storyboard-video', sourceChanged: true },
      { id: 'text-storyboard', sourceChanged: false },
    ])
    expect(
      useProjectStore.getState().activeProject?.nodes.map(
        ({ id, sourceChanged }) => ({ id, sourceChanged }),
      ),
    ).toEqual([
      { id: 'text-source', sourceChanged: false },
      { id: 'shot-1', sourceChanged: true },
      { id: 'video-consumer', sourceChanged: true },
    ])

    expect(useProjectStore.getState().disconnectNodes('text-storyboard')).toBe(
      true,
    )
    await useProjectStore.getState().persistActive(repository)
    const disconnected = await repository.load(project.id)
    expect(disconnected?.edges.map(({ id }) => id)).toEqual(['storyboard-video'])
    expect(
      disconnected?.edges.map(
        ({ id, sourceChanged }) => ({ id, sourceChanged }),
      ),
    ).toEqual([{ id: 'storyboard-video', sourceChanged: true }])
    expect(
      disconnected?.nodes.map(
        ({ id, sourceChanged }) => ({ id, sourceChanged }),
      ),
    ).toEqual([
      { id: 'text-source', sourceChanged: false },
      { id: 'shot-1', sourceChanged: true },
      { id: 'video-consumer', sourceChanged: true },
    ])

    useProjectStore.getState().undo()
    await useProjectStore.getState().persistActive(repository)
    const undone = await repository.load(project.id)
    expect(undone?.edges.map(({ id }) => id)).toEqual([
      'storyboard-video',
      'text-storyboard',
    ])
    expect(
      undone?.edges.map(({ id, sourceChanged }) => ({ id, sourceChanged })),
    ).toEqual([
      { id: 'storyboard-video', sourceChanged: true },
      { id: 'text-storyboard', sourceChanged: false },
    ])
    expect(
      undone?.nodes.map(
        ({ id, sourceChanged }) => ({ id, sourceChanged }),
      ),
    ).toEqual([
      { id: 'text-source', sourceChanged: false },
      { id: 'shot-1', sourceChanged: true },
      { id: 'video-consumer', sourceChanged: true },
    ])

    useProjectStore.getState().redo()
    await useProjectStore.getState().persistActive(repository)
    useProjectStore.setState({
      projectsById: {},
      activeProjectId: undefined,
      activeProject: undefined,
      saveStatus: 'saved',
      past: [],
      future: [],
    })
    await useProjectStore.getState().hydrate(project.id, repository)
    expect(useProjectStore.getState().activeProject?.edges.map(({ id }) => id)).toEqual([
      'storyboard-video',
    ])
    expect(
      useProjectStore.getState().activeProject?.edges.map(
        ({ id, sourceChanged }) => ({ id, sourceChanged }),
      ),
    ).toEqual([{ id: 'storyboard-video', sourceChanged: true }])
    expect(
      useProjectStore.getState().activeProject?.nodes.map(
        ({ id, sourceChanged }) => ({ id, sourceChanged }),
      ),
    ).toEqual([
      { id: 'text-source', sourceChanged: false },
      { id: 'shot-1', sourceChanged: true },
      { id: 'video-consumer', sourceChanged: true },
    ])
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

  test('resolves regenerated input state while marking only downstream consumers stale', () => {
    const base = makeProjectFixture()
    const makeNode = (
      id: string,
      sourceChanged: boolean,
      createdAt: string,
    ): CanvasNode => ({
      id,
      kind: 'storyboard',
      title: id,
      position: { x: 0, y: 0 },
      versions: [
        {
          id: `version-${id}-old`,
          createdAt,
          prompt: `${id} old`,
          assetId: 'asset-shot-river-v1',
        },
      ],
      activeVersionId: `version-${id}-old`,
      sourceChanged,
    })
    const project = {
      ...base,
      id: 'project-chain',
      nodes: [
        makeNode('A', false, '2026-08-06T08:00:00.000Z'),
        makeNode('B', true, '2026-08-06T08:01:00.000Z'),
        makeNode('C', true, '2026-08-06T08:02:00.000Z'),
      ],
      edges: [
        {
          id: 'A-B',
          sourceNodeId: 'A',
          targetNodeId: 'B',
          sourceChanged: true,
        },
        {
          id: 'B-C',
          sourceNodeId: 'B',
          targetNodeId: 'C',
          sourceChanged: true,
        },
      ],
      timeline: [],
      jobs: [],
    }
    useProjectStore.setState({
      projectsById: { [project.id]: project },
      activeProjectId: project.id,
      activeProject: project,
      past: [],
      future: [],
    })

    useProjectStore.getState().appendVersion('B', {
      prompt: 'B regenerated',
      generationJobId: 'job-B-current',
    })

    const next = useProjectStore.getState().activeProject!
    expect(next.nodes.find(({ id }) => id === 'B')?.sourceChanged).toBe(false)
    expect(next.nodes.find(({ id }) => id === 'C')?.sourceChanged).toBe(true)
    expect(next.edges.find(({ id }) => id === 'A-B')?.sourceChanged).toBe(false)
    expect(next.edges.find(({ id }) => id === 'B-C')?.sourceChanged).toBe(true)
    expect(next.assets).toEqual(project.assets)
    expect(next.nodes.find(({ id }) => id === 'B')?.versions).toHaveLength(2)
    expect(useProjectStore.getState().past).toEqual([project])
  })

  test('propagates a large source change with a linear number of edge reads', () => {
    const base = makeProjectFixture()
    const nodeCount = 500
    const nodes = Array.from({ length: nodeCount }, (_, index): CanvasNode => ({
      ...base.nodes[0],
      id: `chain-${index}`,
      title: `Chain ${index}`,
      sourceChanged: false,
    }))
    let sourceReads = 0
    const edges = Array.from(
      { length: nodeCount - 1 },
      (_, index): DependencyEdge => ({
        id: `chain-edge-${index}-${index + 1}`,
        get sourceNodeId() {
          sourceReads += 1
          return `chain-${index}`
        },
        targetNodeId: `chain-${index + 1}`,
        sourceChanged: false,
      }),
    )
    const project = {
      ...base,
      id: 'project-large-propagation-chain',
      nodes,
      edges,
      timeline: [],
      jobs: [],
    }
    useProjectStore.setState({
      projectsById: { [project.id]: project },
      activeProjectId: project.id,
      activeProject: project,
      past: [],
      future: [],
    })
    sourceReads = 0

    useProjectStore.getState().appendVersion('chain-0', {
      prompt: 'regenerated chain source',
      generationJobId: 'job-chain-current',
    })

    const next = useProjectStore.getState().activeProject!
    expect(sourceReads).toBeLessThanOrEqual(edges.length * 2)
    expect(next.nodes[0].sourceChanged).toBe(false)
    expect(next.nodes.slice(1).every(({ sourceChanged }) => sourceChanged)).toBe(
      true,
    )
    expect(next.edges.every(({ sourceChanged }) => sourceChanged)).toBe(true)
  })

  test('rejects a dependency edge that would create a cycle without adding history', () => {
    const originalProject = useProjectStore.getState().activeProject

    useProjectStore.getState().connectNodes({
      id: 'edge-audio-to-shot',
      sourceNodeId: 'rain-audio',
      targetNodeId: 'shot-1',
    })

    expect(useProjectStore.getState().activeProject).toBe(originalProject)
    expect(useProjectStore.getState().past).toEqual([])
  })

  test('validates a large dependency graph with linear edge traversal', () => {
    const base = makeProjectFixture()
    const nodeCount = 200
    const nodes = Array.from({ length: nodeCount }, (_, index): CanvasNode => ({
      ...base.nodes[0],
      id: `node-${index}`,
      kind: index === 0 ? 'video' : 'storyboard',
      title: `Node ${index}`,
      position: { x: index * 10, y: 0 },
    }))
    let sourceReads = 0
    const edges = Array.from(
      { length: nodeCount - 1 },
      (_, index): DependencyEdge => ({
        id: `edge-${index}-${index + 1}`,
        get sourceNodeId() {
          sourceReads += 1
          return `node-${index}`
        },
        targetNodeId: `node-${index + 1}`,
      }),
    )
    const project = {
      ...base,
      id: 'project-large-chain',
      nodes,
      edges,
      timeline: [],
      jobs: [],
    }
    useProjectStore.setState({
      projectsById: { [project.id]: project },
      activeProjectId: project.id,
      activeProject: project,
      past: [],
      future: [],
    })
    sourceReads = 0

    useProjectStore.getState().connectNodes({
      id: 'edge-close-chain',
      sourceNodeId: `node-${nodeCount - 1}`,
      targetNodeId: 'node-0',
    })

    expect(useProjectStore.getState().activeProject).toBe(project)
    expect(useProjectStore.getState().past).toEqual([])
    expect(sourceReads).toBeLessThanOrEqual(edges.length * 3)
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

    expect(useProjectStore.getState().saveStatus).toBe('error')
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

    expect(useProjectStore.getState().saveStatus).toBe('dirty')
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

  test('serializes overlapping saves so the newer snapshot is written last', async () => {
    const first = createDeferred<void>()
    const second = createDeferred<void>()
    const savedTitles: string[] = []
    const save = vi.fn<(project: ReturnType<typeof makeProjectFixture>) => Promise<void>>()
      .mockImplementationOnce(async (project) => {
        await first.promise
        savedTitles.push(project.nodes[0].title)
      })
      .mockImplementationOnce(async (project) => {
        await second.promise
        savedTitles.push(project.nodes[0].title)
      })

    const olderPersistence = useProjectStore.getState().persistActive({ save })
    useProjectStore.getState().updateNode('shot-1', { title: '最新标题' })
    const latestPersistence = useProjectStore.getState().persistActive({ save })

    await Promise.resolve()
    expect(save).toHaveBeenCalledTimes(1)
    first.resolve(undefined)
    await olderPersistence
    expect(save).toHaveBeenCalledTimes(2)
    second.resolve(undefined)
    await latestPersistence

    expect(savedTitles).toEqual(['河岸寻人', '最新标题'])
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
