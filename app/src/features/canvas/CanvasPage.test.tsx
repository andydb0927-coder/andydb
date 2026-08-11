import Dexie from 'dexie'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ComponentType } from 'react'
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type {
  GenerationAdapter,
  GenerationResult,
} from '../generation/generation-adapter'
import type { Project } from '../project/model'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import { useProjectStore } from '../project/project-store'
import { CanvasPage } from './CanvasPage'
import { sortNodesForList } from './NodeListView'
import { PreviewPage } from '../timeline/PreviewPage'

interface FlowNodeFixture {
  id: string
  type?: string
  selected?: boolean
  position: { x: number; y: number }
  measured?: { width?: number; height?: number }
  data: Record<string, unknown>
}

interface FlowPropsFixture {
  nodes: FlowNodeFixture[]
  edges: Array<{
    id: string
    source: string
    target: string
    selected?: boolean
    hidden?: boolean
    focusable?: boolean
    selectable?: boolean
    ariaLabel?: string
    data?: {
      visible: boolean
      sourceChanged: boolean
      ariaLabel: string
      onDelete(edgeId: string): void
    }
  }>
  nodeTypes: Record<string, ComponentType<Record<string, unknown>>>
  onNodesChange(changes: unknown[]): void
  onEdgesChange(changes: unknown[]): void
  onConnect(connection: { source: string; target: string }): void
  onConnectStart?(event: unknown, params: unknown): void
  isValidConnection(connection: {
    source: string | null
    target: string | null
  }): boolean
  onConnectEnd?(
    event: unknown,
    state: {
      isValid: boolean
      fromNode?: { id: string }
      toNode?: { id: string }
      fromHandle?: { type: 'source' | 'target' }
    },
  ): void
  zoomOnScroll: boolean
  panOnScroll: boolean
  panActivationKeyCode: string
  selectionOnDrag: boolean
  zoomOnDoubleClick: boolean
  onPaneClick?(event: { clientX: number; clientY: number }): void
  onNodeClick?(
    event: { target?: EventTarget | null },
    node: FlowNodeFixture,
  ): void
  onEdgeClick?(
    event: { target?: EventTarget | null },
    edge: FlowPropsFixture['edges'][number],
  ): void
  edgesFocusable?: boolean
  deleteKeyCode?: string[]
  onInit?(instance: {
    fitView(options: unknown): Promise<boolean>
    screenToFlowPosition(position: { x: number; y: number }): {
      x: number
      y: number
    }
  }): void
}

let latestFlowProps: FlowPropsFixture | undefined

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  BaseEdge: () => null,
  Controls: () => null,
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
  MarkerType: { ArrowClosed: 'arrowclosed' },
  ReactFlow: (props: FlowPropsFixture & { 'aria-label'?: string }) => {
    latestFlowProps = props
    return (
      <div role="region" aria-label={props['aria-label']}>
        {props.nodes.map((node) => {
          const Node = props.nodeTypes[node.type ?? 'asset']
          return (
            <div key={node.id} className="react-flow__node">
              <Node
                id={node.id}
                data={node.data}
                selected={node.selected ?? false}
              />
            </div>
          )
        })}
      </div>
    )
  },
  getBezierPath: () => ['M0 0L10 10'],
}))

function makeCanvasProject(): Project {
  const createdAt = '2026-08-06T08:00:00.000Z'
  const node = (
    id: string,
    kind: Project['nodes'][number]['kind'],
    title: string,
    x: number,
    y: number,
    assetId: string,
    minute: number,
  ): Project['nodes'][number] => ({
    id,
    kind,
    title,
    position: { x, y },
    versions: [
      {
        id: `version-${id}`,
        createdAt: `2026-08-06T08:${String(minute).padStart(2, '0')}:00.000Z`,
        prompt: `${title}创作描述`,
        assetId,
      },
    ],
    activeVersionId: `version-${id}`,
    sourceChanged: false,
  })

  return {
    id: 'project-canvas',
    title: '雨夜追寻',
    intent: '在暴雨中追寻失踪的同伴',
    createdAt,
    updatedAt: createdAt,
    assets: [
      {
        id: 'asset-character',
        kind: 'image',
        url: '/demo/character-lin-yuan.png',
        mimeType: 'image/png',
      },
      {
        id: 'asset-scene',
        kind: 'image',
        url: '/demo/scene-rain-street.png',
        mimeType: 'image/png',
      },
      {
        id: 'asset-shot',
        kind: 'image',
        url: '/demo/shot-rooftop.png',
        mimeType: 'image/png',
      },
      {
        id: 'asset-video',
        kind: 'image',
        url: '/demo/shot-river.png',
        mimeType: 'image/png',
      },
    ],
    nodes: [
      node('character', 'character', '角色参考', 80, 80, 'asset-character', 0),
      node('scene', 'scene', '场景设定', 390, 210, 'asset-scene', 1),
      node('storyboard', 'storyboard', '分镜 02', 720, 350, 'asset-shot', 2),
      node('video', 'video', '视频片段', 1030, 520, 'asset-video', 3),
      node('preview', 'preview', '成片预览', 1300, 680, 'asset-video', 4),
    ],
    edges: [
      { id: 'character-scene', sourceNodeId: 'character', targetNodeId: 'scene' },
      { id: 'scene-storyboard', sourceNodeId: 'scene', targetNodeId: 'storyboard' },
      { id: 'storyboard-video', sourceNodeId: 'storyboard', targetNodeId: 'video' },
      { id: 'video-preview', sourceNodeId: 'video', targetNodeId: 'preview' },
    ],
    timeline: [],
    jobs: [
      {
        id: 'job-storyboard',
        nodeId: 'storyboard',
        status: 'succeeded',
        prompt: '分镜 02 创作描述',
        createdAt,
        updatedAt: createdAt,
        assetId: 'asset-shot',
      },
    ],
    exportJobs: [],
  }
}

function activate(project = makeCanvasProject()) {
  useProjectStore.setState({
    projectsById: { [project.id]: project },
    activeProjectId: project.id,
    activeProject: project,
    saveStatus: 'saved',
    past: [],
    future: [],
  })
}

const noOpCanvasRepository = {
  load: async () => undefined,
  save: async () => undefined,
}

function renderCanvas(
  props: ComponentProps<typeof CanvasPage> = {
    repository: noOpCanvasRepository,
  },
) {
  return render(
    <MemoryRouter initialEntries={['/project/project-canvas']}>
      <Routes>
        <Route path="/project/:projectId" element={<CanvasPage {...props} />} />
      </Routes>
    </MemoryRouter>,
  )
}

function SwitchingCanvas({ repository }: ComponentProps<typeof CanvasPage>) {
  const navigate = useNavigate()
  return (
    <>
      <button type="button" onClick={() => navigate('/project/project-b')}>
        切换到项目 B
      </button>
      <Routes>
        <Route
          path="/project/:projectId"
          element={<CanvasPage repository={repository} />}
        />
      </Routes>
    </>
  )
}

function initializeFlow(
  flowPosition = { x: 777, y: 333 },
) {
  const fitView = vi.fn().mockResolvedValue(true)
  const screenToFlowPosition = vi.fn(() => flowPosition)
  act(() => latestFlowProps?.onInit?.({ fitView, screenToFlowPosition }))
  return { fitView, screenToFlowPosition }
}

function clickPane(clientX = 420, clientY = 300) {
  act(() => latestFlowProps?.onPaneClick?.({ clientX, clientY }))
}

beforeEach(() => {
  latestFlowProps = undefined
  act(() => activate())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  act(() => {
    useProjectStore.setState({
      projectsById: {},
      activeProjectId: undefined,
      activeProject: undefined,
      saveStatus: 'saved',
      past: [],
      future: [],
    })
  })
})

describe('creative canvas', () => {
  test('keeps legacy cyclic dependency data in stable creation order', () => {
    const project = makeCanvasProject()
    const nodes = project.nodes.slice(0, 3)
    const cyclicEdges = [
      {
        id: 'character-scene',
        sourceNodeId: 'character',
        targetNodeId: 'scene',
      },
      {
        id: 'scene-character',
        sourceNodeId: 'scene',
        targetNodeId: 'character',
      },
      {
        id: 'scene-storyboard',
        sourceNodeId: 'scene',
        targetNodeId: 'storyboard',
      },
    ]

    expect(sortNodesForList(nodes, cyclicEdges, []).map((node) => node.id)).toEqual([
      'character',
      'scene',
      'storyboard',
    ])
  })

  test('hydrates a saved project when the project URL is opened directly', async () => {
    const project = makeCanvasProject()
    useProjectStore.setState({
      projectsById: {},
      activeProjectId: undefined,
      activeProject: undefined,
      past: [],
      future: [],
    })

    renderCanvas({
      repository: { load: async () => project, save: async () => undefined },
    })

    expect(
      await screen.findByRole('heading', { name: '雨夜追寻' }),
    ).toBeVisible()
    expect(useProjectStore.getState().activeProject?.id).toBe('project-canvas')
  })

  test('returns from preview to the focused origin node and reveals it in React Flow', async () => {
    const user = userEvent.setup()
    const project = {
      ...makeCanvasProject(),
      timeline: [
        {
          id: 'timeline-video',
          nodeId: 'video',
          order: 0,
          durationSeconds: 5,
          track: 'video' as const,
        },
      ],
    }
    act(() => activate(project))
    const fitView = vi.fn().mockResolvedValue(true)

    render(
      <MemoryRouter
        initialEntries={['/project/project-canvas/preview']}
      >
        <Routes>
          <Route
            path="/project/:projectId/preview"
            element={<PreviewPage />}
          />
          <Route path="/project/:projectId" element={<CanvasPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('link', { name: '返回画布' }))
    expect(await screen.findByRole('region', { name: '项目画布' })).toBeVisible()
    act(() =>
      latestFlowProps?.onInit?.({
        fitView,
        screenToFlowPosition: (position) => position,
      }),
    )

    await waitFor(() => {
      expect(
        latestFlowProps?.nodes.find((node) => node.id === 'video')?.selected,
      ).toBe(true)
    })
    expect(fitView).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: [{ id: 'video' }] }),
    )
  })

  test('ignores a focus query that does not belong to the active project', () => {
    const fitView = vi.fn().mockResolvedValue(true)
    render(
      <MemoryRouter
        initialEntries={['/project/project-canvas?focus=missing-node']}
      >
        <Routes>
          <Route path="/project/:projectId" element={<CanvasPage />} />
        </Routes>
      </MemoryRouter>,
    )

    act(() =>
      latestFlowProps?.onInit?.({
        fitView,
        screenToFlowPosition: (position) => position,
      }),
    )

    expect(latestFlowProps?.nodes.every((node) => !node.selected)).toBe(true)
    expect(fitView).not.toHaveBeenCalled()
  })

  test('hides an old route project after load failure and retries successfully', async () => {
    const user = userEvent.setup()
    const requestedProject = makeCanvasProject()
    const oldProject = {
      ...makeCanvasProject(),
      id: 'project-old',
      title: '旧项目',
    }
    const load = vi
      .fn<(projectId: string) => Promise<Project | undefined>>()
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValueOnce(requestedProject)
    act(() => activate(oldProject))

    renderCanvas({ repository: { load, save: async () => undefined } })

    expect(screen.queryByRole('heading', { name: '旧项目' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: '预览' }),
    ).not.toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('无法加载项目')
    expect(
      screen.queryByRole('link', { name: '预览' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重试加载' }))

    expect(
      await screen.findByRole('heading', { name: '雨夜追寻' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: '预览' })).toHaveAttribute(
      'href',
      '/project/project-canvas/preview',
    )
  })

  test('shows a not-found state without leaking the previous project', async () => {
    const oldProject = {
      ...makeCanvasProject(),
      id: 'project-old',
      title: '旧项目',
    }
    act(() => activate(oldProject))

    renderCanvas({ repository: noOpCanvasRepository })

    expect(await screen.findByRole('alert')).toHaveTextContent('未找到项目')
    expect(screen.queryByText('旧项目')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: '预览' }),
    ).not.toBeInTheDocument()
  })

  test('renders all creative nodes and reveals actions for the selected storyboard', async () => {
    const user = userEvent.setup()
    renderCanvas()

    expect(screen.getByRole('region', { name: '项目画布' })).toBeVisible()
    for (const name of ['角色参考', '场景设定', '分镜 02', '视频片段', '成片预览']) {
      expect(screen.getByRole('button', { name })).toBeVisible()
    }

    await user.click(screen.getByRole('button', { name: '分镜 02' }))

    for (const action of ['重生成', '扩展镜头', '生成视频']) {
      expect(screen.getByRole('button', { name: action })).toBeVisible()
    }
    expect(screen.queryByRole('button', { name: '加入时间线' })).not.toBeInTheDocument()
  })

  test('renders text and image kinds with compatible actions in canvas and node list', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    const textNode: Project['nodes'][number] = {
      id: 'text-created',
      kind: 'text',
      title: '文本 01',
      position: { x: 1600, y: 720 },
      versions: [
        {
          id: 'version-text-created',
          createdAt: '2026-08-06T08:05:00.000Z',
          prompt: '雨落在旧车站',
        },
      ],
      activeVersionId: 'version-text-created',
      sourceChanged: false,
    }
    const imageNode: Project['nodes'][number] = {
      id: 'image-created',
      kind: 'image',
      title: '图片 01',
      position: { x: 1900, y: 720 },
      versions: [
        {
          id: 'version-image-created',
          createdAt: '2026-08-06T08:06:00.000Z',
          prompt: '雨夜人物参考',
          assetId: 'asset-character',
        },
      ],
      activeVersionId: 'version-image-created',
      sourceChanged: false,
    }
    act(() => activate({ ...project, nodes: [...project.nodes, textNode, imageNode] }))
    renderCanvas()

    await user.click(screen.getByRole('button', { name: '文本 01' }))
    expect(screen.getByRole('button', { name: '生成分镜' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '重生成' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '图片 01' }))
    expect(screen.getByRole('button', { name: '生成视频' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '生成分镜' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '节点列表' }))
    const nodeList = screen.getByRole('dialog', { name: '节点列表' })
    expect(
      within(
        within(nodeList).getByRole('button', { name: '选择 文本 01' }),
      ).getByText('文本', { selector: 'span' }),
    ).toBeVisible()
    expect(
      within(
        within(nodeList).getByRole('button', { name: '选择 图片 01' }),
      ).getByText('图片', { selector: 'span' }),
    ).toBeVisible()
    expect(
      within(nodeList).queryByRole('button', { name: '重生成 文本 01' }),
    ).not.toBeInTheDocument()
    expect(
      within(nodeList).getByRole('button', { name: '生成分镜 文本 01' }),
    ).toBeVisible()
    expect(
      within(nodeList).getByRole('button', { name: '生成视频 图片 01' }),
    ).toBeVisible()
  })

  test('runs a selected-node regeneration through the queue and preserves its old version', async () => {
    const user = userEvent.setup()
    renderCanvas()
    await user.click(screen.getByRole('button', { name: '分镜 02' }))

    vi.useFakeTimers()
    act(() => screen.getByRole('button', { name: '重生成' }).click())
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByText('生成中')).toBeVisible()
    const job = useProjectStore
      .getState()
      .activeProject?.jobs.find(
        (candidate) =>
          candidate.nodeId === 'storyboard' && candidate.status === 'running',
      )
    expect(job?.status).toBe('running')

    await act(() => vi.advanceTimersByTimeAsync(1200))

    const project = useProjectStore.getState().activeProject!
    const node = project.nodes.find((candidate) => candidate.id === 'storyboard')!
    expect(node.versions).toHaveLength(2)
    expect(node.versions[0].assetId).toBe('asset-shot')
    expect(node.versions[1]).toMatchObject({
      generationJobId: job?.id,
    })
    expect(
      project.assets.find((asset) => asset.id === node.versions[1].assetId),
    ).toBeDefined()
  })

  test('creates and selects the corresponding video from the selected storyboard action', async () => {
    const user = userEvent.setup()
    renderCanvas()
    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    vi.useFakeTimers()

    act(() => screen.getByRole('button', { name: '生成视频' }).click())
    await act(() => vi.advanceTimersByTimeAsync(1200))

    const project = useProjectStore.getState().activeProject!
    const video = project.nodes.find((node) => node.title === '视频 02')!
    expect(video.kind).toBe('video')
    expect(project.edges).toContainEqual(
      expect.objectContaining({
        sourceNodeId: 'storyboard',
        targetNodeId: video.id,
      }),
    )
    expect(latestFlowProps?.nodes.find((node) => node.id === video.id)?.selected).toBe(
      true,
    )
  })

  test('uses an injected generation adapter for canvas results', async () => {
    const user = userEvent.setup()
    const injectedResult: GenerationResult = {
      asset: {
        id: 'asset-injected-video',
        kind: 'image',
        url: '/injected/video-thumbnail.png',
        mimeType: 'image/png',
      },
      version: {
        id: 'version-injected-video',
        createdAt: '2026-08-11T08:00:00.000Z',
        prompt: 'injected generation result',
        assetId: 'asset-injected-video',
      },
    }
    const adapter: GenerationAdapter = {
      start: async () => injectedResult,
    }

    renderCanvas({
      repository: noOpCanvasRepository,
      generationAdapter: adapter,
    })
    await user.click(screen.getByRole('button', { name: '角色参考' }))
    await user.click(screen.getByRole('button', { name: '生成视频' }))

    expect(
      await screen.findByRole('button', { name: '视频 01' }),
    ).toBeVisible()
    expect(useProjectStore.getState().activeProject?.assets).toContainEqual(
      injectedResult.asset,
    )
  })

  test('autosaves generated video and timeline state and rehydrates it from Dexie', async () => {
    const user = userEvent.setup()
    const database = new WirelessCanvasDatabase(
      `wireless-canvas-durable-${crypto.randomUUID()}`,
    )
    const repository = new ProjectRepository(database)
    const view = renderCanvas({ repository })
    let rehydratedView: ReturnType<typeof renderCanvas> | undefined

    try {
      await user.click(screen.getByRole('button', { name: '分镜 02' }))
      await user.click(screen.getByRole('button', { name: '生成视频' }))
      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: '视频 02' })).toBeVisible()
        },
        { timeout: 2500 },
      )

      await user.click(screen.getByRole('button', { name: '加入时间线' }))
      await waitFor(() => {
        expect(useProjectStore.getState().saveStatus).toBe('saved')
      })

      const saved = await repository.load('project-canvas')
      const video = saved?.nodes.find((node) => node.title === '视频 02')
      const version = video?.versions.find(
        (candidate) => candidate.id === video.activeVersionId,
      )
      expect(video?.kind).toBe('video')
      expect(saved?.assets.some((asset) => asset.id === version?.assetId)).toBe(true)
      expect(saved?.jobs.find((job) => job.id === version?.generationJobId)).toMatchObject({
        status: 'succeeded',
        nodeId: video?.id,
      })
      expect(saved?.timeline).toContainEqual(
        expect.objectContaining({ nodeId: video?.id, track: 'video' }),
      )

      view.unmount()
      act(() => {
        useProjectStore.setState({
          projectsById: {},
          activeProjectId: undefined,
          activeProject: undefined,
          saveStatus: 'saved',
          past: [],
          future: [],
        })
      })
      rehydratedView = renderCanvas({ repository })

      expect(await screen.findByRole('button', { name: '视频 02' })).toBeVisible()
      const rehydrated = useProjectStore.getState().activeProject
      expect(rehydrated?.nodes.find((node) => node.id === video?.id)?.versions).toEqual(
        video?.versions,
      )
      expect(rehydrated?.timeline).toEqual(saved?.timeline)
      expect(rehydrated?.assets).toEqual(saved?.assets)
      expect(rehydrated?.jobs).toEqual(saved?.jobs)
    } finally {
      view.unmount()
      rehydratedView?.unmount()
      database.close()
      await Dexie.delete(database.name)
    }
  })

  test('reloads toolbar-created image content from real Dexie persistence', async () => {
    const user = userEvent.setup()
    const database = new WirelessCanvasDatabase(
      `wireless-canvas-toolbar-image-${crypto.randomUUID()}`,
    )
    const repository = new ProjectRepository(database)
    const firstView = renderCanvas({ repository })
    let rehydratedView: ReturnType<typeof renderCanvas> | undefined

    try {
      initializeFlow({ x: 612, y: 428 })
      await user.click(screen.getByRole('button', { name: '图片' }))
      clickPane(360, 280)
      await user.upload(
        screen.getByLabelText('本地图片'),
        new File(['durable-image-bytes'], 'durable.png', {
          type: 'image/png',
        }),
      )
      await user.clear(screen.getByLabelText('标题'))
      await user.type(screen.getByLabelText('标题'), '持久图片参考')
      await user.type(
        screen.getByLabelText('图片描述（选填）'),
        '雨夜玻璃窗后的侧脸',
      )
      await user.click(screen.getByRole('button', { name: '确认创建' }))
      await waitFor(() => {
        expect(useProjectStore.getState().saveStatus).toBe('saved')
      })

      const saved = await repository.load('project-canvas')
      const savedNode = saved?.nodes.find(
        ({ title }) => title === '持久图片参考',
      )
      const savedVersion = savedNode?.versions.find(
        ({ id }) => id === savedNode.activeVersionId,
      )
      const savedAsset = saved?.assets.find(
        ({ id }) => id === savedVersion?.assetId,
      )
      expect(savedNode?.position).toEqual({ x: 612, y: 428 })
      expect(savedVersion?.prompt).toBe('雨夜玻璃窗后的侧脸')
      expect(savedAsset).toMatchObject({
        kind: 'image',
        mimeType: 'image/png',
        url: expect.stringMatching(/^data:image\/png;base64,/),
      })

      firstView.unmount()
      act(() => {
        useProjectStore.setState({
          projectsById: {},
          activeProjectId: undefined,
          activeProject: undefined,
          saveStatus: 'saved',
          past: [],
          future: [],
        })
      })
      rehydratedView = renderCanvas({ repository })

      expect(
        await screen.findByRole('button', { name: '持久图片参考' }),
      ).toBeVisible()
      const rehydrated = useProjectStore.getState().activeProject
      const rehydratedNode = rehydrated?.nodes.find(
        ({ id }) => id === savedNode?.id,
      )
      const rehydratedVersion = rehydratedNode?.versions.find(
        ({ id }) => id === rehydratedNode.activeVersionId,
      )
      expect(rehydratedNode?.position).toEqual({ x: 612, y: 428 })
      expect(rehydratedVersion).toEqual(savedVersion)
      expect(
        rehydrated?.assets.find(({ id }) => id === rehydratedVersion?.assetId),
      ).toEqual(savedAsset)
    } finally {
      firstView.unmount()
      rehydratedView?.unmount()
      database.close()
      await Dexie.delete(database.name)
    }
  })

  test('adds the selected video to the timeline from its contextual action', async () => {
    const user = userEvent.setup()
    renderCanvas()
    await user.click(screen.getByRole('button', { name: '视频片段' }))

    await user.click(screen.getByRole('button', { name: '加入时间线' }))

    expect(useProjectStore.getState().activeProject?.timeline).toContainEqual(
      expect.objectContaining({ nodeId: 'video', track: 'video', order: 0 }),
    )
  })

  test.each(['角色参考', '场景设定', '分镜 02', '成片预览'])(
    'hides timeline insertion for ineligible %s nodes',
    async (title) => {
      const user = userEvent.setup()
      renderCanvas()

      await user.click(screen.getByRole('button', { name: title }))

      expect(
        screen.queryByRole('button', { name: '加入时间线' }),
      ).not.toBeInTheDocument()
    },
  )

  test('offers node-local Cancel and Retry controls for generation state', async () => {
    const user = userEvent.setup()
    renderCanvas()
    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    vi.useFakeTimers()
    act(() => screen.getByRole('button', { name: '重生成' }).click())
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(screen.getByRole('button', { name: '取消生成' })).toBeVisible()
    act(() => screen.getByRole('button', { name: '取消生成' }).click())
    expect(screen.getByText('已取消')).toBeVisible()
    expect(screen.getByRole('button', { name: '重试生成' })).toBeVisible()

    act(() => screen.getByRole('button', { name: '重试生成' }).click())
    await act(() => vi.advanceTimersByTimeAsync(1200))

    expect(screen.getByText('已完成')).toBeVisible()
  })

  test('offers node-local Retry for a failed generation', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    const failedJob = {
      ...project.jobs[0],
      id: 'job-storyboard-failed',
      status: 'failed' as const,
      error: 'demo failed',
    }
    act(() =>
      activate({
        ...project,
        jobs: [failedJob],
        nodes: project.nodes.map((node) =>
          node.id === 'storyboard'
            ? {
                ...node,
                versions: node.versions.map((version) => ({
                  ...version,
                  generationJobId: failedJob.id,
                })),
              }
            : node,
        ),
      }),
    )
    renderCanvas()

    await user.click(screen.getByRole('button', { name: '分镜 02' }))

    expect(screen.getByRole('button', { name: '重试生成' })).toBeVisible()
  })

  test('retries the persisted cancelled job after the Canvas remounts', async () => {
    const user = userEvent.setup()
    const firstView = renderCanvas()
    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    vi.useFakeTimers()
    act(() => screen.getByRole('button', { name: '重生成' }).click())
    await act(() => vi.advanceTimersByTimeAsync(0))
    const firstJob = useProjectStore
      .getState()
      .activeProject?.jobs.find((job) => job.status === 'running')
    expect(firstJob).toMatchObject({ attempt: 1, sequence: 1 })

    firstView.unmount()
    expect(
      useProjectStore
        .getState()
        .activeProject?.jobs.find((job) => job.id === firstJob?.id)?.status,
    ).toBe('cancelled')

    renderCanvas()
    act(() => screen.getByRole('button', { name: '分镜 02' }).click())
    act(() => screen.getByRole('button', { name: '重试生成' }).click())
    await act(() => vi.advanceTimersByTimeAsync(1200))

    const project = useProjectStore.getState().activeProject!
    expect(project.jobs.find((job) => job.id === firstJob?.id)).toMatchObject({
      id: firstJob?.id,
      status: 'succeeded',
      attempt: 2,
      sequence: 1,
    })
    expect(
      project.nodes.find((node) => node.id === 'storyboard')?.versions,
    ).toHaveLength(2)
  })

  test('persists terminal cancellation when an in-flight Canvas unmounts', async () => {
    const user = userEvent.setup()
    let savedProject: Project | undefined
    const repository = {
      load: async () => undefined,
      save: async (project: Project) => {
        savedProject = structuredClone(project)
      },
    }
    const view = renderCanvas({ repository })
    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    vi.useFakeTimers()
    act(() => screen.getByRole('button', { name: '重生成' }).click())
    await act(() => vi.advanceTimersByTimeAsync(0))

    view.unmount()
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(
      savedProject?.jobs.find((job) => job.operation === 'regenerate')?.status,
    ).toBe('cancelled')
  })

  test('continues persisted queue sequencing for a new generation after remount', async () => {
    const user = userEvent.setup()
    const firstView = renderCanvas()
    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    vi.useFakeTimers()
    act(() => screen.getByRole('button', { name: '重生成' }).click())
    await act(() => vi.advanceTimersByTimeAsync(1200))
    firstView.unmount()

    renderCanvas()
    act(() => screen.getByRole('button', { name: '分镜 02' }).click())
    act(() => screen.getByRole('button', { name: '重生成' }).click())
    await act(() => vi.advanceTimersByTimeAsync(1200))

    const project = useProjectStore.getState().activeProject!
    const generatedJobs = project.jobs.filter(
      (job) => job.operation === 'regenerate',
    )
    expect(generatedJobs.map((job) => job.sequence)).toEqual([1, 2])
    expect(generatedJobs.at(-1)?.status).toBe('succeeded')
    expect(
      project.nodes.find((node) => node.id === 'storyboard')?.versions,
    ).toHaveLength(3)
  })

  test('cancels in-flight generation on unmount before a late result can apply', async () => {
    const user = userEvent.setup()
    const view = renderCanvas()
    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    vi.useFakeTimers()
    act(() => screen.getByRole('button', { name: '重生成' }).click())
    await act(() => vi.advanceTimersByTimeAsync(0))
    const before = useProjectStore.getState().activeProject!
    const job = before.jobs.find((candidate) => candidate.status === 'running')!

    view.unmount()
    await act(() => vi.advanceTimersByTimeAsync(1200))

    const project = useProjectStore.getState().projectsById[before.id]
    expect(project.jobs.find((candidate) => candidate.id === job.id)?.status).toBe(
      'cancelled',
    )
    expect(project.nodes.find((node) => node.id === 'storyboard')?.versions).toHaveLength(1)
  })

  test('scopes callbacks to project A when the route switches to project B', async () => {
    const user = userEvent.setup()
    const projectB = { ...makeCanvasProject(), id: 'project-b', title: '项目 B' }
    render(
      <MemoryRouter initialEntries={['/project/project-canvas']}>
        <SwitchingCanvas
          repository={{
            load: async () => projectB,
            save: async () => undefined,
          }}
        />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    vi.useFakeTimers()
    act(() => screen.getByRole('button', { name: '重生成' }).click())
    await act(() => vi.advanceTimersByTimeAsync(0))

    act(() => screen.getByRole('button', { name: '切换到项目 B' }).click())
    await act(() => vi.advanceTimersByTimeAsync(0))
    await act(() => vi.advanceTimersByTimeAsync(1200))

    const state = useProjectStore.getState()
    expect(state.activeProject?.id).toBe('project-b')
    expect(state.activeProject?.nodes.find((node) => node.id === 'storyboard')?.versions).toHaveLength(1)
    expect(
      state.projectsById['project-canvas'].jobs.some(
        (job) => job.status === 'cancelled',
      ),
    ).toBe(true)
  })

  test('keeps the floating AI director non-mutating for unknown input', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const viewport = screen.getByRole('region', { name: '项目画布' }).parentElement!
    expect(within(viewport).getByRole('heading', { name: 'AI 导演' })).toBeVisible()
    const before = useProjectStore.getState().activeProject

    await user.type(
      screen.getByRole('textbox', { name: '告诉我下一步要做什么' }),
      '让它更有感觉',
    )
    await user.click(screen.getByRole('button', { name: '提交给 AI 导演' }))

    expect(screen.getByText(/扩展这个镜头/)).toBeVisible()
    expect(screen.getByText(/重新生成这个镜头/)).toBeVisible()
    expect(screen.getByText(/把这个片段加入时间线/)).toBeVisible()
    expect(screen.queryByRole('button', { name: '执行' })).not.toBeInTheDocument()
    expect(useProjectStore.getState().activeProject).toBe(before)
  })

  test('routes a destructive Director command through dependency confirmation and restores Director focus', async () => {
    const user = userEvent.setup()
    renderCanvas()
    await user.click(screen.getByRole('button', { name: '场景设定' }))
    await user.type(
      screen.getByRole('textbox', { name: '告诉我下一步要做什么' }),
      '删除这个节点',
    )

    await user.click(screen.getByRole('button', { name: '提交给 AI 导演' }))

    expect(
      useProjectStore.getState().activeProject?.nodes.some((node) => node.id === 'scene'),
    ).toBe(true)
    expect(screen.getByText(/删除所选节点/)).toBeVisible()

    await user.click(screen.getByRole('button', { name: '执行' }))

    const dialog = screen.getByRole('dialog', { name: '删除“场景设定”？' })
    expect(within(dialog).getByText('分镜 02')).toBeVisible()
    expect(within(dialog).getByText('视频片段')).toBeVisible()
    expect(
      useProjectStore.getState().activeProject?.nodes.some((node) => node.id === 'scene'),
    ).toBe(true)

    await user.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(screen.getByRole('textbox', { name: '告诉我下一步要做什么' })).toHaveFocus()
  })

  test('invalidates a director proposal when the selected node changes', async () => {
    const user = userEvent.setup()
    renderCanvas()
    await user.click(screen.getByRole('button', { name: '场景设定' }))
    await user.type(
      screen.getByRole('textbox', { name: '告诉我下一步要做什么' }),
      '删除这个节点',
    )
    await user.click(screen.getByRole('button', { name: '提交给 AI 导演' }))
    expect(screen.getByRole('button', { name: '执行' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '视频片段' }))

    expect(screen.queryByRole('button', { name: '执行' })).not.toBeInTheDocument()
    expect(
      useProjectStore.getState().activeProject?.nodes.some((node) => node.id === 'scene'),
    ).toBe(true)
  })

  test('discloses that generation is a local PNG-thumbnail demo', () => {
    renderCanvas()

    expect(
      screen.getByText('本地演示生成 · 视频结果使用 PNG 视觉缩略图'),
    ).toBeVisible()
  })

  test('shows the active version job in both canvas and node list', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    const withCurrentJob = {
      ...project,
      nodes: project.nodes.map((node) =>
        node.id === 'storyboard'
          ? {
              ...node,
              versions: node.versions.map((version) => ({
                ...version,
                generationJobId: 'job-storyboard-current',
              })),
            }
          : node,
      ),
      jobs: [
        {
          ...project.jobs[0],
          id: 'job-storyboard-old',
          status: 'succeeded' as const,
          updatedAt: '2026-08-06T08:10:00.000Z',
        },
        {
          ...project.jobs[0],
          id: 'job-storyboard-current',
          status: 'running' as const,
          updatedAt: '2026-08-06T08:02:00.000Z',
        },
      ],
    }
    act(() => activate(withCurrentJob))
    renderCanvas()

    await user.click(screen.getByRole('button', { name: '节点列表' }))

    expect(screen.getAllByText('生成中')).toHaveLength(2)
  })

  test('uses the deterministic latest job for legacy versions without a job reference', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    const legacyProject = {
      ...project,
      jobs: [
        {
          ...project.jobs[0],
          id: 'job-storyboard-old',
          status: 'succeeded' as const,
          updatedAt: '2026-08-06T08:01:00.000Z',
        },
        {
          ...project.jobs[0],
          id: 'job-storyboard-latest',
          status: 'running' as const,
          updatedAt: '2026-08-06T08:10:00.000Z',
        },
      ],
    }
    act(() => activate(legacyProject))
    renderCanvas()

    await user.click(screen.getByRole('button', { name: '节点列表' }))

    expect(screen.getAllByText('生成中')).toHaveLength(2)
  })

  test('keeps the node selection surface available as a React Flow drag handle', () => {
    renderCanvas()

    expect(screen.getByRole('button', { name: '分镜 02' })).not.toHaveClass(
      'nodrag',
    )
  })

  test('supplies inactive connection state to every canvas node', () => {
    renderCanvas()

    expect(latestFlowProps?.nodes).toHaveLength(5)
    for (const node of latestFlowProps?.nodes ?? []) {
      expect(node.data).toMatchObject({
        connectionMode: false,
        connectionSource: false,
      })
    }
  })

  test('connects with the toolbar and reports a reverse edge as a cycle', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const connect = screen.getByRole('button', { name: '连线' })

    await user.click(connect)
    expect(screen.getByRole('status')).toHaveTextContent('请选择来源节点')
    expect(
      latestFlowProps?.nodes.every(
        (node) => node.data.connectionMode === true,
      ),
    ).toBe(true)

    const characterButton = screen.getByRole('button', { name: '角色参考' })
    await user.click(characterButton)
    expect(screen.getByRole('status')).toHaveTextContent('请选择目标节点')
    expect(
      latestFlowProps?.nodes.find(({ id }) => id === 'character')?.data,
    ).toMatchObject({ connectionMode: true, connectionSource: true })

    act(() => {
      latestFlowProps?.onNodeClick?.(
        { target: characterButton },
        latestFlowProps.nodes.find(({ id }) => id === 'character')!,
      )
    })
    expect(screen.getByRole('status')).toHaveTextContent('请选择目标节点')

    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    expect(
      useProjectStore.getState().activeProject?.edges.some(
        (edge) =>
          edge.sourceNodeId === 'character' &&
          edge.targetNodeId === 'storyboard',
      ),
    ).toBe(true)
    expect(
      latestFlowProps?.edges.some(
        (edge) => edge.source === 'character' && edge.target === 'storyboard',
      ),
    ).toBe(true)
    expect(useProjectStore.getState().past).toHaveLength(1)
    expect(connect).toHaveFocus()

    await user.click(connect)
    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    await user.click(screen.getByRole('button', { name: '角色参考' }))
    expect(screen.getByRole('status')).toHaveTextContent(
      '此连接会形成循环依赖',
    )
    expect(connect).toHaveAttribute('aria-pressed', 'true')
    expect(useProjectStore.getState().past).toHaveLength(1)

    await user.keyboard('{Escape}')
    expect(connect).toHaveFocus()
    expect(screen.queryByText('此连接会形成循环依赖')).not.toBeInTheDocument()
  })

  test('keeps an acyclic incompatible toolbar source for a valid retry', async () => {
    const user = userEvent.setup()
    act(() => activate({ ...makeCanvasProject(), edges: [] }))
    renderCanvas()
    const connect = screen.getByRole('button', { name: '连线' })

    await user.click(connect)
    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    await user.click(screen.getByRole('button', { name: '角色参考' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      '这两种节点不能建立生成依赖',
    )
    expect(connect).toHaveAttribute('aria-pressed', 'true')
    expect(
      latestFlowProps?.nodes.find(({ id }) => id === 'storyboard')?.data,
    ).toMatchObject({ connectionMode: true, connectionSource: true })
    expect(useProjectStore.getState().past).toEqual([])

    await user.click(screen.getByRole('button', { name: '视频片段' }))
    expect(
      useProjectStore.getState().activeProject?.edges.some(
        (edge) =>
          edge.sourceNodeId === 'storyboard' && edge.targetNodeId === 'video',
      ),
    ).toBe(true)
    expect(useProjectStore.getState().past).toHaveLength(1)
    expect(
      screen.queryByText('这两种节点不能建立生成依赖'),
    ).not.toBeInTheDocument()
    expect(connect).toHaveFocus()
  })

  test('routes keyboard handle actions through the existing Connect controller', async () => {
    renderCanvas()
    const sourceData = latestFlowProps?.nodes.find(
      ({ id }) => id === 'character',
    )?.data
    const sourceHandle = document.createElement('div')
    const targetHandle = document.createElement('div')

    act(() => {
      ;(
        sourceData?.onHandleActivate as
          | ((type: 'source' | 'target', trigger: HTMLElement) => void)
          | undefined
      )?.('source', sourceHandle)
    })
    expect(screen.getByRole('button', { name: '连线' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('status')).toHaveTextContent('请选择目标节点')
    expect(
      latestFlowProps?.nodes.find(({ id }) => id === 'character')?.data,
    ).toMatchObject({ connectionMode: true, connectionSource: true })

    const targetData = latestFlowProps?.nodes.find(
      ({ id }) => id === 'video',
    )?.data
    act(() => {
      ;(
        targetData?.onHandleActivate as
          | ((type: 'source' | 'target', trigger: HTMLElement) => void)
          | undefined
      )?.('target', targetHandle)
    })
    expect(
      useProjectStore.getState().activeProject?.edges.filter(
        (edge) =>
          edge.sourceNodeId === 'character' && edge.targetNodeId === 'video',
      ),
    ).toHaveLength(1)
    expect(useProjectStore.getState().past).toHaveLength(1)
    expect(screen.getByRole('button', { name: '连线' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('uses Store authority for valid drags and concrete invalid-drop feedback', async () => {
    const user = userEvent.setup()
    renderCanvas()

    expect(
      latestFlowProps?.isValidConnection({ source: 'scene', target: 'video' }),
    ).toBe(true)
    expect(
      latestFlowProps?.isValidConnection({
        source: 'storyboard',
        target: 'character',
      }),
    ).toBe(false)

    act(() => {
      latestFlowProps?.onConnect({ source: 'scene', target: 'video' })
    })
    expect(
      useProjectStore.getState().activeProject?.edges.some(
        (edge) =>
          edge.sourceNodeId === 'scene' && edge.targetNodeId === 'video',
      ),
    ).toBe(true)
    expect(useProjectStore.getState().past).toHaveLength(1)

    act(() => {
      latestFlowProps?.onConnectEnd?.({}, {
        isValid: true,
        fromNode: { id: 'scene' },
        toNode: { id: 'video' },
      })
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(useProjectStore.getState().activeProject?.edges).toHaveLength(5)
    expect(useProjectStore.getState().past).toHaveLength(1)

    act(() => {
      latestFlowProps?.onConnectEnd?.({}, {
        isValid: false,
        fromNode: { id: 'storyboard' },
        toNode: { id: 'character' },
      })
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      '此连接会形成循环依赖',
    )
    expect(screen.getByRole('status')).toHaveClass(
      'canvas-connection-hint--error',
    )
    expect(useProjectStore.getState().activeProject?.edges).toHaveLength(5)
    expect(useProjectStore.getState().past).toHaveLength(1)

    const connect = screen.getByRole('button', { name: '连线' })
    await user.click(connect)
    expect(screen.getByRole('status')).toHaveTextContent('请选择来源节点')
    expect(screen.getByRole('status')).not.toHaveClass(
      'canvas-connection-hint--error',
    )
    await user.click(connect)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(useProjectStore.getState().past).toHaveLength(1)
  })

  test('normalizes an invalid drag that starts from a target handle', async () => {
    let finishSave: (() => void) | undefined
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
        }),
    )
    const originalProject = useProjectStore.getState().activeProject
    renderCanvas({ repository: { load: async () => undefined, save } })

    act(() => {
      latestFlowProps?.onConnectEnd?.({}, {
        isValid: false,
        fromNode: { id: 'character' },
        toNode: { id: 'storyboard' },
        fromHandle: { type: 'target' },
      })
    })
    try {
      expect(screen.getByRole('status')).toHaveTextContent(
        '此连接会形成循环依赖',
      )
      expect(useProjectStore.getState()).toMatchObject({
        activeProject: originalProject,
        past: [],
        saveStatus: 'saved',
      })
      expect(useProjectStore.getState().activeProject?.edges).toHaveLength(4)
      expect(save).not.toHaveBeenCalled()
    } finally {
      await act(async () => {
        await Promise.resolve()
        finishSave?.()
        await Promise.resolve()
      })
    }
  })

  test('ignores node action controls while choosing a connection source', async () => {
    const user = userEvent.setup()
    renderCanvas()

    await user.click(screen.getByRole('button', { name: '角色参考' }))
    const regenerate = screen.getByRole('button', { name: '重生成' })
    await user.click(screen.getByRole('button', { name: '连线' }))
    expect(screen.getByRole('status')).toHaveTextContent('请选择来源节点')

    await user.click(regenerate)
    act(() => {
      latestFlowProps?.onNodeClick?.(
        { target: regenerate },
        latestFlowProps.nodes.find(({ id }) => id === 'character')!,
      )
    })

    expect(screen.getByRole('status')).toHaveTextContent('请选择来源节点')
    expect(
      latestFlowProps?.nodes.some(
        (node) => node.data.connectionSource === true,
      ),
    ).toBe(false)
    expect(useProjectStore.getState().past).toEqual([])
  })

  test('prioritizes one connection error over an active placement hint', async () => {
    const user = userEvent.setup()
    renderCanvas()

    await user.click(screen.getByRole('button', { name: '文本' }))
    expect(screen.getByRole('status')).toHaveTextContent('点击画布放置文本节点')

    act(() => {
      latestFlowProps?.onConnectEnd?.({}, {
        isValid: false,
        fromNode: { id: 'storyboard' },
        toNode: { id: 'character' },
        fromHandle: { type: 'source' },
      })
    })

    const statuses = screen.getAllByRole('status')
    expect(statuses).toHaveLength(1)
    expect(statuses[0]).toHaveTextContent('此连接会形成循环依赖')
    expect(statuses[0]).toHaveClass('canvas-connection-hint--error')
    expect(useProjectStore.getState().past).toEqual([])
  })

  test('cancels toolbar connection selection from a blank pane without history', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const connect = screen.getByRole('button', { name: '连线' })

    await user.click(connect)
    await user.click(screen.getByRole('button', { name: '角色参考' }))
    expect(screen.getByRole('status')).toHaveTextContent('请选择目标节点')
    clickPane()

    expect(screen.queryByText('请选择目标节点')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(useProjectStore.getState().past).toEqual([])
    expect(useProjectStore.getState().activeProject?.edges).toHaveLength(4)
    await waitFor(() => expect(connect).toHaveFocus())
  })

  test('activates Connect with L from the canvas and preserves Escape focus restoration', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const connect = screen.getByRole('button', { name: '连线' })

    await user.keyboard('l')

    expect(connect).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('请选择来源节点')

    await user.keyboard('{Escape}')
    expect(screen.queryByText('请选择来源节点')).not.toBeInTheDocument()
    await waitFor(() => expect(connect).toHaveFocus())
  })

  test('ignores the L shortcut for modifiers, editable targets, and an open draft dialog', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const connect = screen.getByRole('button', { name: '连线' })
    const directorInput = screen.getByLabelText('告诉我下一步要做什么')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', ctrlKey: true }))
    })
    expect(connect).toHaveAttribute('aria-pressed', 'false')

    await user.click(directorInput)
    await user.keyboard('l')
    expect(directorInput).toHaveValue('l')
    expect(connect).toHaveAttribute('aria-pressed', 'false')

    initializeFlow()
    await user.click(screen.getByRole('button', { name: '视频' }))
    clickPane()
    const cancel = screen.getByRole('button', { name: '取消' })
    cancel.focus()
    await user.keyboard('l')

    expect(
      screen.getByRole('dialog', { name: '创建视频节点' }),
    ).toBeVisible()
    expect(connect).toHaveAttribute('aria-pressed', 'false')
    expect(useProjectStore.getState().past).toEqual([])
  })

  test('ignores L throughout an active native handle connection', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const connect = screen.getByRole('button', { name: '连线' })

    act(() => latestFlowProps?.onConnectStart?.({}, {}))
    await user.keyboard('l')

    expect(connect).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('请选择来源节点')).not.toBeInTheDocument()

    act(() => {
      latestFlowProps?.onConnectEnd?.({}, { isValid: false })
    })
    await user.keyboard('l')

    expect(connect).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('请选择来源节点')
  })

  test.each([
    { label: 'active Connect', selectSource: false },
    { label: 'selected toolbar source', selectSource: true },
  ])(
    'cancels $label without focus theft before one native drag mutation',
    async ({ selectSource }) => {
      const user = userEvent.setup()
      renderCanvas()
      const connect = screen.getByRole('button', { name: '连线' })
      await user.click(connect)
      if (selectSource) {
        await user.click(screen.getByRole('button', { name: '角色参考' }))
        expect(screen.getByRole('status')).toHaveTextContent('请选择目标节点')
      } else {
        expect(screen.getByRole('status')).toHaveTextContent('请选择来源节点')
      }
      const nativeHandle = document.createElement('button')
      document.body.append(nativeHandle)
      nativeHandle.focus()

      act(() => latestFlowProps?.onConnectStart?.({}, {}))
      await Promise.resolve()

      expect(nativeHandle).toHaveFocus()
      expect(connect).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: '选择' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(
        latestFlowProps?.nodes.some(
          (node) => node.data.connectionSource === true,
        ),
      ).toBe(false)

      act(() => {
        latestFlowProps?.onConnect({ source: 'scene', target: 'video' })
        latestFlowProps?.onConnectEnd?.({}, { isValid: true })
      })
      expect(
        useProjectStore.getState().activeProject?.edges.filter(
          (edge) =>
            edge.sourceNodeId === 'scene' && edge.targetNodeId === 'video',
        ),
      ).toHaveLength(1)
      expect(useProjectStore.getState().past).toHaveLength(1)
      expect(connect).toHaveAttribute('aria-pressed', 'false')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      nativeHandle.remove()
    },
  )

  test('selects and deletes an edge with one history entry, restores source focus, and keeps timeline unchanged through undo', async () => {
    const project = makeCanvasProject()
    project.timeline = [
      {
        id: 'timeline-video',
        nodeId: 'video',
        order: 0,
        durationSeconds: 5,
        track: 'video',
      },
    ]
    activate(project)
    renderCanvas()
    const originalTimeline = structuredClone(project.timeline)
    const edge = latestFlowProps!.edges.find(
      ({ id }) => id === 'character-scene',
    )!

    act(() => latestFlowProps?.onEdgeClick?.({}, edge))
    expect(
      latestFlowProps?.edges.find(({ id }) => id === edge.id),
    ).toMatchObject({
      selected: true,
      ariaLabel: '角色参考 → 场景设定',
    })

    act(() => {
      latestFlowProps?.edges
        .find(({ id }) => id === edge.id)
        ?.data?.onDelete(edge.id)
    })

    expect(useProjectStore.getState().activeProject?.edges).not.toContainEqual(
      expect.objectContaining({ id: edge.id }),
    )
    expect(useProjectStore.getState().past).toHaveLength(1)
    expect(useProjectStore.getState().activeProject?.timeline).toEqual(
      originalTimeline,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '角色参考' })).toHaveFocus(),
    )

    act(() => useProjectStore.getState().undo())
    expect(useProjectStore.getState().activeProject?.edges).toContainEqual(
      expect.objectContaining({ id: edge.id }),
    )
    expect(useProjectStore.getState().activeProject?.timeline).toEqual(
      originalTimeline,
    )
  })

  test('routes keyboard edge removal through the same one-step disconnect command', async () => {
    const project = makeCanvasProject()
    const originalTimeline = structuredClone(project.timeline)
    renderCanvas()
    const edge = latestFlowProps!.edges.find(
      ({ id }) => id === 'scene-storyboard',
    )!

    act(() => latestFlowProps?.onEdgeClick?.({}, edge))
    act(() => latestFlowProps?.onEdgesChange([{ type: 'remove', id: edge.id }]))

    expect(useProjectStore.getState().activeProject?.edges).not.toContainEqual(
      expect.objectContaining({ id: edge.id }),
    )
    expect(useProjectStore.getState().past).toHaveLength(1)
    expect(useProjectStore.getState().activeProject?.timeline).toEqual(
      originalTimeline,
    )
    expect(latestFlowProps).toMatchObject({
      edgesFocusable: true,
      deleteKeyCode: ['Backspace', 'Delete'],
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '场景设定' })).toHaveFocus(),
    )
  })

  test('safely focuses the canvas viewport for an unavailable source with a CSS-special id', async () => {
    const specialId = String.raw`node"]):not(*),\\#`
    const project = makeCanvasProject()
    project.nodes = project.nodes.map((node) =>
      node.id === 'character' ? { ...node, id: specialId } : node,
    )
    project.edges = project.edges.map((edge) => ({
      ...edge,
      sourceNodeId:
        edge.sourceNodeId === 'character' ? specialId : edge.sourceNodeId,
      targetNodeId:
        edge.targetNodeId === 'character' ? specialId : edge.targetNodeId,
    }))
    activate(project)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderCanvas()
    const viewport = screen.getByRole('region', { name: '项目画布' })
    const edge = latestFlowProps!.edges.find(
      ({ id }) => id === 'character-scene',
    )!
    screen.getByRole('button', { name: '角色参考' }).remove()

    try {
      act(() => edge.data?.onDelete(edge.id))

      expect(useProjectStore.getState().past).toHaveLength(1)
      await waitFor(() => expect(viewport).toHaveFocus())
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  test('clears edge selection from a node or blank pane without changing history', () => {
    renderCanvas()
    const edge = latestFlowProps!.edges[0]

    act(() => latestFlowProps?.onEdgeClick?.({}, edge))
    expect(latestFlowProps?.edges[0].selected).toBe(true)

    act(() =>
      latestFlowProps?.onNodeClick?.({}, latestFlowProps.nodes[0]),
    )
    expect(latestFlowProps?.edges[0].selected).toBe(false)

    act(() => latestFlowProps?.onEdgeClick?.({}, latestFlowProps.edges[0]))
    act(() => latestFlowProps?.onPaneClick?.({ clientX: 0, clientY: 0 }))
    expect(latestFlowProps?.edges[0].selected).toBe(false)
    expect(useProjectStore.getState().past).toEqual([])
  })

  test('hides selected connections through local visibility state without changing the active project', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const edge = latestFlowProps!.edges[0]
    const beforeProject = useProjectStore.getState().activeProject
    const beforePast = useProjectStore.getState().past
    const beforeSaveStatus = useProjectStore.getState().saveStatus

    act(() => latestFlowProps?.onEdgeClick?.({}, edge))
    expect(latestFlowProps?.edges[0].selected).toBe(true)

    await user.click(screen.getByRole('button', { name: '隐藏连线' }))

    expect(latestFlowProps?.edges[0].data?.visible).toBe(false)
    expect(latestFlowProps?.edges[0]).toMatchObject({
      hidden: true,
      focusable: false,
      selectable: false,
    })
    expect(latestFlowProps?.edges[0].selected).toBe(false)
    expect(screen.getByRole('button', { name: '显示连线' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      '连线已隐藏，端口仍可使用',
    )
    expect(screen.getByRole('status')).toHaveClass('canvas-visibility-hint')
    expect(useProjectStore.getState().activeProject).toBe(beforeProject)
    expect(useProjectStore.getState().past).toBe(beforePast)
    expect(useProjectStore.getState().saveStatus).toBe(beforeSaveStatus)

    await user.click(screen.getByRole('button', { name: '显示连线' }))
    expect(latestFlowProps?.edges[0]).toMatchObject({
      hidden: false,
      focusable: true,
      selectable: true,
    })
  })

  test('disables connection visibility while loading and enables it visible by default when the project loads', async () => {
    const user = userEvent.setup()
    let resolveLoad: ((project: Project) => void) | undefined
    const load = vi.fn(
      () =>
        new Promise<Project>((resolve) => {
          resolveLoad = resolve
        }),
    )
    act(() => {
      useProjectStore.setState({
        projectsById: {},
        activeProjectId: undefined,
        activeProject: undefined,
        saveStatus: 'saved',
        past: [],
        future: [],
      })
    })

    renderCanvas({ repository: { load, save: async () => undefined } })

    expect(screen.getByRole('button', { name: '隐藏连线' })).toBeDisabled()

    await act(async () => resolveLoad?.(makeCanvasProject()))

    expect(await screen.findByRole('heading', { name: '雨夜追寻' })).toBeVisible()
    const toggle = screen.getByRole('button', { name: '隐藏连线' })
    expect(toggle).toBeEnabled()
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: '显示连线' })).toBeEnabled()
  })

  test('toggles connections with the H shortcut while preserving Connect port state', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const connect = screen.getByRole('button', { name: '连线' })

    await user.click(connect)
    await user.click(screen.getByRole('button', { name: '角色参考' }))
    expect(
      latestFlowProps?.nodes.find(({ id }) => id === 'character')?.data,
    ).toMatchObject({ connectionMode: true, connectionSource: true })

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' })))

    expect(latestFlowProps?.edges.every((edge) => edge.data?.visible === false)).toBe(
      true,
    )
    expect(screen.getByRole('status')).toHaveTextContent('请选择目标节点')
    expect(connect).toHaveAttribute('aria-pressed', 'true')
    expect(
      latestFlowProps?.nodes.find(({ id }) => id === 'character')?.data,
    ).toMatchObject({ connectionMode: true, connectionSource: true })
  })

  test('ignores the H shortcut in editable contexts and for modified or repeated key events', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const directorInput = screen.getByLabelText('告诉我下一步要做什么')

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'h', ctrlKey: true }),
      )
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', repeat: true }))
    })
    expect(latestFlowProps?.edges.every((edge) => edge.data?.visible === true)).toBe(
      true,
    )

    await user.click(directorInput)
    await user.keyboard('h')
    expect(directorInput).toHaveValue('h')
    expect(latestFlowProps?.edges.every((edge) => edge.data?.visible === true)).toBe(
      true,
    )
  })

  test('ignores the H shortcut while canvas dialogs are open', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow()

    await user.click(screen.getByRole('button', { name: '视频' }))
    clickPane()
    expect(screen.getByRole('dialog', { name: '创建视频节点' })).toBeVisible()

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' })))
    expect(latestFlowProps?.edges.every((edge) => edge.data?.visible === true)).toBe(
      true,
    )

    await user.click(screen.getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '节点列表' }))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' })))
    expect(latestFlowProps?.edges.every((edge) => edge.data?.visible === true)).toBe(
      true,
    )

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: '角色参考' }))
    await user.click(screen.getByRole('button', { name: '删除节点' }))
    expect(screen.getByRole('dialog', { name: '删除“角色参考”？' })).toBeVisible()

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' })))
    expect(latestFlowProps?.edges.every((edge) => edge.data?.visible === true)).toBe(
      true,
    )
  })

  test('resets connection visibility when the active project changes', async () => {
    const user = userEvent.setup()
    const projectB = {
      ...makeCanvasProject(),
      id: 'project-b',
      title: '第二项目',
    }
    render(
      <MemoryRouter initialEntries={['/project/project-canvas']}>
        <SwitchingCanvas
          repository={{
            load: async (id) => (id === 'project-b' ? projectB : undefined),
            save: async () => undefined,
          }}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '隐藏连线' }))
    expect(latestFlowProps?.edges[0].data?.visible).toBe(false)

    await user.click(screen.getByRole('button', { name: '切换到项目 B' }))

    expect(await screen.findByRole('heading', { name: '第二项目' })).toBeVisible()
    expect(latestFlowProps?.edges[0].data?.visible).toBe(true)
    expect(screen.getByRole('button', { name: '隐藏连线' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('switches from connection selection to a creation tool without stealing focus', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const connect = screen.getByRole('button', { name: '连线' })
    const text = screen.getByRole('button', { name: '文本' })

    await user.click(connect)
    await user.click(screen.getByRole('button', { name: '角色参考' }))
    expect(screen.getByRole('status')).toHaveTextContent('请选择目标节点')
    await user.click(text)

    expect(screen.getByRole('status')).toHaveTextContent('点击画布放置文本节点')
    expect(text).toHaveAttribute('aria-pressed', 'true')
    expect(text).toHaveFocus()
    expect(connect).toHaveAttribute('aria-pressed', 'false')
    expect(useProjectStore.getState().past).toEqual([])
  })

  test('discards connection selection on project switch without restoring old focus', async () => {
    const user = userEvent.setup()
    const projectB = {
      ...makeCanvasProject(),
      id: 'project-b',
      title: '第二项目',
    }
    render(
      <MemoryRouter initialEntries={['/project/project-canvas']}>
        <SwitchingCanvas
          repository={{
            load: async (id) => (id === 'project-b' ? projectB : undefined),
            save: async () => undefined,
          }}
        />
      </MemoryRouter>,
    )
    const connect = screen.getByRole('button', { name: '连线' })
    const switchProject = screen.getByRole('button', { name: '切换到项目 B' })

    await user.click(connect)
    await user.click(screen.getByRole('button', { name: '角色参考' }))
    expect(screen.getByRole('status')).toHaveTextContent('请选择目标节点')
    await user.click(switchProject)

    expect(await screen.findByRole('heading', { name: '第二项目' })).toBeVisible()
    expect(screen.queryByText('请选择目标节点')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(switchProject).toHaveFocus()
    expect(useProjectStore.getState().past).toEqual([])
  })

  test('cleans up active connection selection on unmount without history', async () => {
    const user = userEvent.setup()
    const view = renderCanvas()

    await user.click(screen.getByRole('button', { name: '连线' }))
    await user.click(screen.getByRole('button', { name: '角色参考' }))
    expect(screen.getByRole('status')).toHaveTextContent('请选择目标节点')
    view.unmount()
    await Promise.resolve()

    expect(useProjectStore.getState().past).toEqual([])
    expect(useProjectStore.getState().activeProject?.edges).toHaveLength(4)
    expect(document.activeElement).toBe(document.body)
  })

  test('keeps dependency creation out of the timeline and configures real canvas gestures', () => {
    renderCanvas()

    expect(latestFlowProps).toMatchObject({
      zoomOnScroll: true,
      panOnScroll: false,
      panActivationKeyCode: 'Space',
      selectionOnDrag: true,
      zoomOnDoubleClick: false,
    })

    act(() => {
      latestFlowProps?.onConnect({ source: 'character', target: 'storyboard' })
    })

    expect(useProjectStore.getState().activeProject?.edges).toHaveLength(5)
    expect(useProjectStore.getState().activeProject?.timeline).toHaveLength(0)
  })

  test('moves every selected node in one undoable mutation', () => {
    renderCanvas()

    act(() => {
      latestFlowProps?.onNodesChange([
        { id: 'character', type: 'select', selected: true },
        { id: 'scene', type: 'select', selected: true },
      ])
    })

    expect(
      latestFlowProps?.nodes
        .filter(({ selected }) => selected)
        .map(({ id }) => id),
    ).toEqual(['character', 'scene'])
    expect(screen.getAllByRole('button', { name: '重生成' })).toHaveLength(1)

    act(() => {
      latestFlowProps?.onNodesChange([
        { id: 'character', type: 'position', position: { x: 160, y: 120 } },
        { id: 'scene', type: 'position', position: { x: 490, y: 260 } },
      ])
    })

    expect(
      useProjectStore
        .getState()
        .activeProject?.nodes.slice(0, 2)
        .map(({ position }) => position),
    ).toEqual([
      { x: 160, y: 120 },
      { x: 490, y: 260 },
    ])
    expect(useProjectStore.getState().past).toHaveLength(1)

    act(() => useProjectStore.getState().undo())
    expect(
      useProjectStore
        .getState()
        .activeProject?.nodes.slice(0, 2)
        .map(({ position }) => position),
    ).toEqual([
      { x: 80, y: 80 },
      { x: 390, y: 210 },
    ])
  })

  test('renders drag positions continuously but commits one history entry on release', () => {
    renderCanvas()

    act(() => {
      latestFlowProps?.onNodesChange([
        {
          id: 'character',
          type: 'dimensions',
          dimensions: { width: 270, height: 200 },
        },
      ])
    })

    expect(
      latestFlowProps?.nodes.find(({ id }) => id === 'character')?.measured,
    ).toEqual({ width: 270, height: 200 })
    const stableSceneNode = latestFlowProps?.nodes.find(
      ({ id }) => id === 'scene',
    )

    act(() => {
      latestFlowProps?.onNodesChange([
        {
          id: 'character',
          type: 'position',
          position: { x: 160, y: 120 },
          dragging: true,
        },
      ])
    })

    expect(
      latestFlowProps?.nodes.find(({ id }) => id === 'character')?.position,
    ).toEqual({ x: 160, y: 120 })
    expect(
      latestFlowProps?.nodes.find(({ id }) => id === 'character')?.measured,
    ).toEqual({ width: 270, height: 200 })
    expect(latestFlowProps?.nodes.find(({ id }) => id === 'scene')).toBe(
      stableSceneNode,
    )
    expect(
      useProjectStore
        .getState()
        .activeProject?.nodes.find(({ id }) => id === 'character')?.position,
    ).toEqual({ x: 80, y: 80 })
    expect(useProjectStore.getState()).toMatchObject({
      saveStatus: 'saved',
      past: [],
    })

    act(() => {
      latestFlowProps?.onNodesChange([
        {
          id: 'character',
          type: 'position',
          position: { x: 160, y: 120 },
          dragging: false,
        },
      ])
    })

    expect(
      useProjectStore
        .getState()
        .activeProject?.nodes.find(({ id }) => id === 'character')?.position,
    ).toEqual({ x: 160, y: 120 })
    expect(useProjectStore.getState().past).toHaveLength(1)
  })

  test('offers canvas tools and the connection visibility control', () => {
    renderCanvas()

    const toolbar = screen.getByRole('toolbar', { name: '创作工具' })
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      '选择',
      '文本',
      '图片',
      '分镜',
      '视频',
      '连线',
      '分组',
      '隐藏连线',
    ])
  })

  test('creates nodes from the toolbar at the converted pane position', async () => {
    const user = userEvent.setup()
    const save = vi.fn().mockResolvedValue(undefined)
    renderCanvas({ repository: { load: async () => undefined, save } })
    const { screenToFlowPosition } = initializeFlow()
    const storyboardTool = screen.getByRole('button', { name: '分镜' })

    await user.click(storyboardTool)
    expect(storyboardTool).toHaveAttribute('aria-pressed', 'true')
    clickPane()

    expect(
      screen.getByRole('dialog', { name: '创建分镜节点' }),
    ).toBeVisible()
    expect(screen.getByLabelText('标题')).toHaveValue('分镜 03')
    expect(screenToFlowPosition).toHaveBeenCalledWith({ x: 420, y: 300 })
    expect(useProjectStore.getState().past).toEqual([])

    await user.type(screen.getByLabelText('画面提示词'), '远景，雨夜河岸')
    await user.click(screen.getByRole('button', { name: '确认创建' }))

    const created = useProjectStore
      .getState()
      .activeProject?.nodes.find(({ title }) => title === '分镜 03')
    expect(created).toMatchObject({
      kind: 'storyboard',
      position: { x: 777, y: 333 },
      versions: [{ prompt: '远景，雨夜河岸' }],
    })
    expect(useProjectStore.getState().past).toHaveLength(1)
    expect(screen.getByRole('button', { name: '选择' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.queryByRole('dialog', { name: '创建分镜节点' })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '分镜 03' })).toHaveFocus()
    })
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][0].nodes.at(-1)?.id).toBe(created?.id)
  })

  test.each([
    ['text', '文本', '文字内容', '旧站台旁的独白'],
    ['storyboard', '分镜', '画面提示词', '近景，雨滴落在袖口'],
    ['video', '视频', '视频提示词', '镜头缓慢推向人物'],
  ] as const)(
    'creates a %s draft with one initial prompt version',
    async (kind, toolLabel, fieldLabel, prompt) => {
      const user = userEvent.setup()
      renderCanvas()
      initializeFlow({ x: 100, y: 200 })

      await user.click(screen.getByRole('button', { name: toolLabel }))
      clickPane(160, 220)
      await user.type(screen.getByLabelText(fieldLabel), prompt)
      await user.click(screen.getByRole('button', { name: '确认创建' }))

      const created = useProjectStore.getState().activeProject?.nodes.at(-1)
      expect(created?.kind).toBe(kind)
      expect(created?.versions).toHaveLength(1)
      expect(created?.versions[0].prompt).toBe(prompt)
      expect(created?.activeVersionId).toBe(created?.versions[0].id)
    },
  )

  test('creates an image node and asset from the toolbar', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow({ x: 240, y: 360 })

    await user.click(screen.getByRole('button', { name: '图片' }))
    clickPane(240, 360)
    await user.upload(
      screen.getByLabelText('本地图片'),
      new File(['image'], 'reference.png', { type: 'image/png' }),
    )
    await user.type(screen.getByLabelText('图片描述（选填）'), '雨夜人物参考')
    await user.click(screen.getByRole('button', { name: '确认创建' }))

    const active = useProjectStore.getState().activeProject!
    const created = active.nodes.find(({ kind }) => kind === 'image')!
    const version = created.versions[0]
    const asset = active.assets.find(({ id }) => id === version.assetId)
    expect(created.position).toEqual({ x: 240, y: 360 })
    expect(asset).toMatchObject({
      kind: 'image',
      mimeType: 'image/png',
      url: expect.stringMatching(/^data:image\/png;base64,/),
    })
    expect(useProjectStore.getState().past).toHaveLength(1)
  })

  test('cancels placement without history and returns focus to its tool', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow()
    const textTool = screen.getByRole('button', { name: '文本' })

    await user.click(textTool)
    clickPane()
    expect(screen.getByRole('dialog', { name: '创建文本节点' })).toBeVisible()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: '创建文本节点' })).not.toBeInTheDocument()
    expect(useProjectStore.getState().past).toEqual([])
    expect(useProjectStore.getState().activeProject?.nodes).toHaveLength(5)
    expect(screen.getByRole('button', { name: '选择' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(textTool).toHaveFocus()
  })

  test('ignores node clicks and a second pane click while placing one draft', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow()

    await user.click(screen.getByRole('button', { name: '视频' }))
    act(() => {
      latestFlowProps?.onNodeClick?.({}, latestFlowProps.nodes[0])
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    clickPane(420, 300)
    const firstDialog = screen.getByRole('dialog', { name: '创建视频节点' })
    clickPane(900, 640)
    expect(screen.getAllByRole('dialog', { name: '创建视频节点' })).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: '创建视频节点' })).toBe(firstDialog)
  })

  test('discards a pending draft when the project route changes', async () => {
    const user = userEvent.setup()
    const projectB = {
      ...makeCanvasProject(),
      id: 'project-b',
      title: '第二项目',
    }
    render(
      <MemoryRouter initialEntries={['/project/project-canvas']}>
        <SwitchingCanvas
          repository={{
            load: async (id) => (id === 'project-b' ? projectB : undefined),
            save: async () => undefined,
          }}
        />
      </MemoryRouter>,
    )
    initializeFlow()
    await user.click(screen.getByRole('button', { name: '文本' }))
    clickPane()
    expect(screen.getByRole('dialog', { name: '创建文本节点' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '切换到项目 B' }))

    expect(await screen.findByRole('heading', { name: '第二项目' })).toBeVisible()
    expect(screen.queryByRole('dialog', { name: '创建文本节点' })).not.toBeInTheDocument()
    expect(useProjectStore.getState().activeProject?.nodes).toHaveLength(5)
    expect(useProjectStore.getState().past).toEqual([])
  })

  test('places actions before the rightmost selected node to avoid viewport clipping', async () => {
    const user = userEvent.setup()
    renderCanvas()

    await user.click(screen.getByRole('button', { name: '成片预览' }))

    expect(screen.getByLabelText('成片预览操作')).toHaveAttribute(
      'data-placement',
      'before',
    )
  })

  test('selects through the keyboard node list and returns focus to the canvas node', async () => {
    const user = userEvent.setup()
    renderCanvas()

    const listTrigger = screen.getByRole('button', { name: '节点列表' })
    listTrigger.focus()
    await user.keyboard('{Enter}')
    const listDialog = screen.getByRole('dialog', { name: '节点列表' })
    expect(listDialog).toBeVisible()

    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(
      within(listDialog).getByRole('button', {
        name: '重生成 成片预览',
      }),
    ).toHaveFocus()

    const storyboard = within(listDialog).getByRole('button', {
      name: '选择 分镜 02',
    })
    storyboard.focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: '分镜 02' })).toHaveFocus()
    expect(screen.getByRole('button', { name: '重生成' })).toBeVisible()
  })

  test('returns node-list focus to a viewport node with a CSS-special persisted id', async () => {
    const user = userEvent.setup()
    const specialId = String.raw`node"]):not(*),\\#`
    const project = makeCanvasProject()
    project.nodes = project.nodes.map((node) =>
      node.id === 'character' ? { ...node, id: specialId } : node,
    )
    project.edges = project.edges.map((edge) => ({
      ...edge,
      sourceNodeId:
        edge.sourceNodeId === 'character' ? specialId : edge.sourceNodeId,
      targetNodeId:
        edge.targetNodeId === 'character' ? specialId : edge.targetNodeId,
    }))
    activate(project)
    renderCanvas()

    await user.click(screen.getByRole('button', { name: '节点列表' }))
    const listDialog = screen.getByRole('dialog', { name: '节点列表' })
    await user.click(
      within(listDialog).getByRole('button', { name: '选择 角色参考' }),
    )
    await user.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: '角色参考' })).toHaveFocus()
  })

  test('returns focus to the node list trigger when the dialog closes without a selection', async () => {
    const user = userEvent.setup()
    renderCanvas()

    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    const listTrigger = screen.getByRole('button', { name: '节点列表' })
    listTrigger.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: '节点列表' })).toBeVisible()

    await user.keyboard('{Escape}')

    expect(listTrigger).toHaveFocus()
  })

  test('warns about all downstream consumers and preserves them as source-changed after deletion', async () => {
    const user = userEvent.setup()
    renderCanvas()
    await user.click(screen.getByRole('button', { name: '分镜 02' }))

    const deleteTrigger = screen.getByRole('button', { name: '删除节点' })
    await user.click(deleteTrigger)
    const dialog = screen.getByRole('dialog', { name: '删除“分镜 02”？' })
    expect(within(dialog).getByText('视频片段')).toBeVisible()
    expect(within(dialog).getByText('成片预览')).toBeVisible()

    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(within(dialog).getByRole('button', { name: '仍要删除' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(useProjectStore.getState().activeProject?.nodes).toHaveLength(5)
    expect(useProjectStore.getState().activeProject?.edges).toHaveLength(4)
    expect(deleteTrigger).toHaveFocus()

    await user.click(deleteTrigger)
    await user.click(screen.getByRole('button', { name: '仍要删除' }))

    const project = useProjectStore.getState().activeProject
    expect(project?.nodes.map(({ id }) => id)).not.toContain('storyboard')
    expect(project?.edges).toHaveLength(2)
    expect(project?.nodes.find(({ id }) => id === 'video')?.sourceChanged).toBe(true)
    expect(project?.nodes.find(({ id }) => id === 'preview')?.sourceChanged).toBe(true)
  })

  test('builds deletion-impact consumers with one linear adjacency pass', async () => {
    const user = userEvent.setup()
    const base = makeCanvasProject()
    const nodeCount = 80
    const nodes = Array.from({ length: nodeCount }, (_, index) => ({
      ...base.nodes[0],
      id: `impact-${index}`,
      title: `Impact ${index}`,
      kind: 'storyboard' as const,
      position: { x: index * 20, y: index * 10 },
    }))
    let sourceReads = 0
    const edges = Array.from(
      { length: nodeCount - 1 },
      (_, index): Project['edges'][number] => ({
        id: `impact-edge-${index}-${index + 1}`,
        get sourceNodeId() {
          sourceReads += 1
          return `impact-${index}`
        },
        targetNodeId: `impact-${index + 1}`,
      }),
    )
    activate({
      ...base,
      nodes,
      edges,
      timeline: [],
      jobs: [],
    })
    renderCanvas()

    await user.click(screen.getByRole('button', { name: 'Impact 0' }))
    sourceReads = 0
    await user.click(screen.getByRole('button', { name: '删除节点' }))

    expect(
      screen.getByRole('dialog', { name: '删除“Impact 0”？' }),
    ).toHaveTextContent('Impact 79')
    expect(sourceReads).toBeLessThanOrEqual(edges.length * 2)
  })
})

describe('canvas top bar', () => {
  test.each([
    ['saved', '已保存'],
    ['saving', '保存中'],
    ['error', '保存失败，本地更改已保留'],
    ['offline', '已离线，本地更改已保留'],
  ] as const)('shows %s persistence copy', (saveStatus, copy) => {
    useProjectStore.setState({ saveStatus })
    renderCanvas()
    expect(screen.getByText(copy)).toBeVisible()
  })

  test('disables history controls at boundaries and delegates undo and redo', async () => {
    const user = userEvent.setup()
    const { rerender } = renderCanvas()

    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重做' })).toBeDisabled()

    const project = makeCanvasProject()
    const previous = {
      ...project,
      nodes: project.nodes.map((node) =>
        node.id === 'character' ? { ...node, title: '旧角色' } : node,
      ),
    }
    const future = {
      ...project,
      nodes: project.nodes.map((node) =>
        node.id === 'character' ? { ...node, title: '新角色' } : node,
      ),
    }
    act(() => useProjectStore.setState({ past: [previous], future: [future] }))
    rerender(
      <MemoryRouter initialEntries={['/project/project-canvas']}>
        <Routes>
          <Route path="/project/:projectId" element={<CanvasPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '撤销' }))
    expect(useProjectStore.getState().activeProject?.nodes[0].title).toBe('旧角色')
    await user.click(screen.getByRole('button', { name: '重做' }))
    expect(useProjectStore.getState().activeProject?.nodes[0].title).toBe('角色参考')
  })
})
