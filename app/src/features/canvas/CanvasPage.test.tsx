import Dexie from 'dexie'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  ComponentProps,
  ComponentType,
  CSSProperties,
  ReactNode,
} from 'react'
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
import { EphemeralGenerationResultStore } from '../generation/ephemeral-generation-result-store'
import {
  seedanceVideoConfigFixture,
  seedanceVideoCreateSuccessFixture,
  seedanceVideoSuccessFixture,
} from '../generation/fixtures/seedance-video.fixture'
import {
  seedreamMinLoopConfigFixture,
  seedreamMinLoopMultiOutputFixture,
  seedreamMinLoopSuccessFixture,
} from '../generation/fixtures/seedream-min-loop.fixture'
import type { GenerationProviderPreferenceStore } from '../generation/generation-provider-preference'
import { createDefaultProviderRegistry } from '../generation/model-provider-registry'
import { RegistryGenerationAdapter } from '../generation/registry-generation-adapter'
import { arkImageEditConfigFixture, arkImageEditSuccessFixture } from '../generation/fixtures/ark-image-edit.fixture'
import { arkAnalysisConfigFixture, arkFrameResponseFixture } from '../generation/fixtures/ark-analysis.fixture'
import type { LibraryAssetRecord } from '../assets/library-model'
import { defaultImageGenerationSettings, type Project } from '../project/model'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import { useProjectStore } from '../project/project-store'
import { CanvasPage } from './CanvasPage'
import { createFixtureProviderRegistry, createLifecycleAdapterFixture } from '../../test/provider-fixtures'
import type { CreativeNodeAction } from './node-types'
import { sortNodesForList } from './NodeListView'
import { PreviewPage } from '../timeline/PreviewPage'
import { createPublishedWork } from '../community/community-model'
import { createTimelineProject } from '../timeline/timeline-project'

interface FlowNodeFixture {
  id: string
  type?: string
  selected?: boolean
  position: { x: number; y: number }
  measured?: { width?: number; height?: number }
  data: Record<string, unknown>
}

interface FlowPropsFixture {
  children?: ReactNode
  style?: CSSProperties
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
      onInsert(
        edgeId: string,
        midpoint: { x: number; y: number },
        trigger: HTMLButtonElement,
      ): void
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
  panOnDrag?: boolean | number[]
  nodesDraggable?: boolean
  selectionOnDrag: boolean
  zoomOnDoubleClick: boolean
  onMove?(
    event: unknown,
    viewport: { x: number; y: number; zoom: number },
  ): void
  snapToGrid?: boolean
  onPaneClick?(event: { clientX: number; clientY: number; detail?: number }): void
  onPaneContextMenu?(event: {
    clientX: number
    clientY: number
    preventDefault(): void
  }): void
  onDragOver?(event: {
    dataTransfer: { types: string[]; dropEffect: string }
    preventDefault(): void
  }): void
  onDrop?(event: {
    clientX: number
    clientY: number
    dataTransfer: { getData(type: string): string }
    preventDefault(): void
  }): void
  onNodeClick?(
    event: { target?: EventTarget | null },
    node: FlowNodeFixture,
  ): void
  onNodeContextMenu?(
    event: {
      clientX: number
      clientY: number
      preventDefault(): void
      stopPropagation(): void
      currentTarget?: EventTarget | null
    },
    node: FlowNodeFixture,
  ): void
  onNodeDragStart?(event: MouseEvent, node: FlowNodeFixture): void
  onNodeDragStop?(event: MouseEvent, node: FlowNodeFixture): void
  onEdgeClick?(
    event: { target?: EventTarget | null },
    edge: FlowPropsFixture['edges'][number],
  ): void
  edgesFocusable?: boolean
  deleteKeyCode?: string[] | null
  onInit?(instance: {
    fitView(options: unknown): Promise<boolean>
    getViewport?(): { x: number; y: number; zoom: number }
    zoomIn?(options?: unknown): Promise<boolean>
    zoomOut?(options?: unknown): Promise<boolean>
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
  MiniMap: () => <div role="img" aria-label="画布小地图" />,
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
  MarkerType: { ArrowClosed: 'arrowclosed' },
  ReactFlow: (props: FlowPropsFixture & { 'aria-label'?: string }) => {
    latestFlowProps = props
    return (
      <div role="region" aria-label={props['aria-label']} style={props.style}>
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
        {props.children}
      </div>
    )
  },
  ViewportPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
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

const libtvPreferenceStore: GenerationProviderPreferenceStore = {
  read: () => ({
    provider: 'libtv',
    selection: {
      projectUuid: '11111111-2222-3333-4444-555555555555',
      projectName: '低成本验收画布',
      imageModelKey: 'image-key',
      imageModelName: 'Image Model',
      videoModelKey: 'video-key',
      videoModelName: 'Video Model',
    },
  }),
  write: vi.fn(),
}

function renderCanvas(
  props: ComponentProps<typeof CanvasPage> = {
    repository: noOpCanvasRepository,
  },
) {
  const registry = props.providerRegistry ?? createFixtureProviderRegistry()
  return render(
    <MemoryRouter initialEntries={['/project/project-canvas']}>
      <Routes>
        <Route path="/project/:projectId" element={<CanvasPage providerRegistry={registry} generationAdapter={props.generationPreferenceStore ? undefined : createLifecycleAdapterFixture(registry)} {...props} />} />
      </Routes>
    </MemoryRouter>,
  )
}

function triggerCanvasNodeAction(
  nodeId: string,
  action: CreativeNodeAction,
  trigger?: HTMLElement,
) {
  const node = latestFlowProps?.nodes.find(({ id }) => id === nodeId)
  const onAction = node?.data.onAction as
    | ((nextAction: CreativeNodeAction, nextTrigger?: HTMLElement) => void)
    | undefined
  if (!onAction) throw new Error(`Missing canvas action handler for ${nodeId}`)
  onAction(action, trigger)
}

function SwitchingCanvas(props: ComponentProps<typeof CanvasPage>) {
  const { repository, ...canvasProps } = props
  const registry = props.providerRegistry ?? createFixtureProviderRegistry()
  const navigate = useNavigate()
  return (
    <>
      <button type="button" onClick={() => navigate('/project/project-b')}>
        切换到项目 B
      </button>
      <Routes>
        <Route
          path="/project/:projectId"
          element={<CanvasPage repository={repository} providerRegistry={registry} generationAdapter={props.generationPreferenceStore ? undefined : createLifecycleAdapterFixture(registry)} {...canvasProps} />}
        />
      </Routes>
    </>
  )
}

function initializeFlow(
  flowPosition = { x: 777, y: 333 },
) {
  const fitView = vi.fn().mockResolvedValue(true)
  const zoomIn = vi.fn().mockResolvedValue(true)
  const zoomOut = vi.fn().mockResolvedValue(true)
  const screenToFlowPosition = vi.fn(() => flowPosition)
  act(() =>
    latestFlowProps?.onInit?.({
      fitView,
      zoomIn,
      zoomOut,
      screenToFlowPosition,
    }),
  )
  return { fitView, zoomIn, zoomOut, screenToFlowPosition }
}

function clickPane(clientX = 420, clientY = 300) {
  act(() => latestFlowProps?.onPaneClick?.({ clientX, clientY }))
}

function contextMenuPane(clientX = 420, clientY = 300) {
  const preventDefault = vi.fn()
  act(() => latestFlowProps?.onPaneContextMenu?.({ clientX, clientY, preventDefault }))
  return preventDefault
}

function contextMenuNode(nodeId: string, clientX = 420, clientY = 300) {
  const node = latestFlowProps?.nodes.find(({ id }) => id === nodeId)
  if (!node) throw new Error(`Missing canvas node ${nodeId}`)
  const preventDefault = vi.fn()
  const stopPropagation = vi.fn()
  act(() => latestFlowProps?.onNodeContextMenu?.(
    { clientX, clientY, preventDefault, stopPropagation },
    node,
  ))
  return { preventDefault, stopPropagation }
}

function doubleClickPane(clientX = 420, clientY = 300) {
  act(() => latestFlowProps?.onPaneClick?.({ clientX, clientY, detail: 2 }))
}

function chooseFreeNode(
  label:
    | '故事脚本生成'
    | '角色三视图'
    | '全能参考生视频 SD2.5'
    | '音频生视频 SD2.5'
    | '世界观卡',
) {
  const branch =
    label === '故事脚本生成' || label === '世界观卡'
      ? '脚本'
      : '素材库'
  const picker = screen.getByRole('dialog', { name: '选择节点类型' })
  act(() => within(picker).getByRole('button', { name: branch }).click())
  act(() => within(picker).getByRole('menuitem', { name: label }).click())
}

function chooseContextNode(
  label:
    | '文本'
    | '图片'
    | '视频'
    | '智能剪辑 Beta'
    | '导演台 NEW'
    | '逐帧拉片 SD2.5'
    | '音频'
    | '脚本'
    | '素材库',
  clientX = 420,
  clientY = 300,
) {
  contextMenuPane(clientX, clientY)
  act(() => screen.getByRole('menuitem', { name: '添加节点' }).click())
  act(() => screen.getByRole('menuitem', { name: label }).click())
}

function chooseContextUpload(clientX = 420, clientY = 300) {
  contextMenuPane(clientX, clientY)
  act(() => screen.getByRole('menuitem', { name: '上传' }).click())
}

beforeEach(() => {
  latestFlowProps = undefined
  localStorage.clear()
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
  test('does not mount the retired workflow run panel', () => {
    renderCanvas()

    expect(
      screen.queryByRole('complementary', { name: '工作流运行面板' }),
    ).not.toBeInTheDocument()
  })

  test('publishes the current canvas with the selected cover and reusable workflow snapshot', async () => {
    const user = userEvent.setup()
    const currentProject = makeCanvasProject()
    const publish = vi.fn().mockImplementation(async (
      project: Project,
      timeline: ReturnType<typeof createTimelineProject>,
      input: Parameters<typeof createPublishedWork>[2],
    ) => createPublishedWork(project, timeline, input))
    renderCanvas({
      repository: noOpCanvasRepository,
      communityRepository: {
        findByProjectId: vi.fn().mockResolvedValue(undefined),
        publish,
      },
      timelineRepository: { load: vi.fn().mockResolvedValue(undefined) },
    })

    await user.click(screen.getByRole('button', { name: '发布与分享' }))
    await user.click(screen.getByRole('menuitem', { name: '在LibTV上发布' }))
    const dialog = screen.getByRole('dialog', { name: '发布作品' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '作品标题' }), {
      target: { value: '雨夜追寻 · 发布版' },
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '作品简介' }), {
      target: { value: '画布发布闭环验收。' },
    })
    await user.click(within(dialog).getByRole('button', { name: '发布到本地作品' }))

    await waitFor(() => expect(publish).toHaveBeenCalledOnce())
    expect(publish.mock.calls[0][2]).toMatchObject({
      title: '雨夜追寻 · 发布版',
      description: '画布发布闭环验收。',
      coverUrl: '/demo/character-lin-yuan.png',
      coverNodeId: 'character',
      workflowSnapshot: {
        format: 'wireless-canvas-workflow',
        version: 1,
        project: currentProject,
      },
    })
    expect(publish.mock.calls[0][2].canvasSnapshotUrl).toMatch(/^data:image\/svg\+xml/)
    expect(await screen.findByText('“雨夜追寻 · 发布版”已发布到本地作品页。')).toBeVisible()
  })

  test('announces a persisted asset attach success from route state', () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/project/project-canvas',
            search: '?focus=video',
            state: {
              assetAttachSuccessMessage: '已将 雨夜参考 添加到项目并打开画布',
            },
          },
        ]}
      >
        <Routes>
          <Route path="/project/:projectId" element={<CanvasPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      '已将 雨夜参考 添加到项目并打开画布',
    )
  })

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
    await user.click(screen.getByRole('button', { name: '发布与分享' }))
    expect(screen.getByRole('menuitem', { name: '预览' })).toHaveAttribute(
      'href',
      '/project/project-canvas/preview',
    )
  })

  test('opens canvas export and imports a validated workflow as one graph change', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow()

    await user.click(screen.getByRole('button', { name: '发布与分享' }))
    await user.click(screen.getByRole('menuitem', { name: '导出画布' }))
    expect(screen.getByRole('dialog', { name: '导出画布' })).toHaveTextContent(
      '当前视口',
    )
    await user.click(screen.getByRole('button', { name: '取消' }))

    const importedProject = {
      ...makeCanvasProject(),
      id: 'imported-project',
      nodes: [
        {
          ...makeCanvasProject().nodes[0],
          id: 'imported-node',
          title: '导入镜头',
          position: { x: 980, y: 520 },
        },
      ],
      edges: [],
    }
    await user.click(screen.getByRole('button', { name: '发布与分享' }))
    const input = screen.getByLabelText('导入工作流 JSON 文件')
    await user.upload(
      input,
      new File(
        [JSON.stringify({
          format: 'wireless-canvas-workflow',
          version: 1,
          exportedAt: '2026-08-15T03:04:05.000Z',
          project: importedProject,
        })],
        'workflow.json',
        { type: 'application/json' },
      ),
    )
    expect(
      await screen.findByRole('dialog', { name: '导入工作流 JSON' }),
    ).toHaveTextContent('1 个节点')
    await user.click(screen.getByRole('button', { name: '确认合并' }))
    expect(useProjectStore.getState().activeProject?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: '导入镜头', position: { x: 980, y: 520 } }),
      ]),
    )
    expect(useProjectStore.getState().past).toHaveLength(1)
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

  test('renders all creative nodes and keeps only the Liblib-compatible timeline action on a selected storyboard', async () => {
    const user = userEvent.setup()
    renderCanvas()

    expect(screen.getByRole('region', { name: '项目画布' })).toBeVisible()
    for (const name of ['角色参考', '场景设定', '分镜 02', '视频片段', '成片预览']) {
      expect(screen.getByRole('button', { name })).toBeVisible()
    }

    await user.click(screen.getByRole('button', { name: '分镜 02' }))

    for (const action of ['重生成', '扩展镜头', '生成视频', '删除节点']) {
      expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: '加入时间线' })).toBeVisible()
    expect(
      within(screen.getByLabelText('分镜 02操作')).getAllByRole('button')[0],
    ).toHaveTextContent('加入时间线')
  })

  test('renders text details and the model-driven Liblib image result actions without legacy node-card actions', async () => {
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
    expect(latestFlowProps?.nodes.find(({ id }) => id === 'text-created')?.selected).toBe(true)
    expect(
      screen.queryByRole('button', { name: '重生成' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '图片 01' }))
    const imageActions = screen.getByRole('toolbar', { name: '图片主操作' })
    for (const action of ['参考', '标记', '风格']) {
      expect(within(imageActions).getByRole('button', { name: action })).toBeVisible()
    }
    expect(within(imageActions).queryByRole('button', { name: '图生图' })).not.toBeInTheDocument()
    expect(within(imageActions).queryByRole('button', { name: '图片高清' })).not.toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: '图片快捷尝试' })).not.toBeInTheDocument()
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
    expect(within(nodeList).getByRole('button', { name: '生成分镜 文本 01' })).toBeVisible()
    expect(within(nodeList).getByRole('button', { name: '生成视频 图片 01' })).toBeVisible()
  })

  test('adds a selected canvas media node as an incoming image reference', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    const target: Project['nodes'][number] = {
      id: 'image-target',
      kind: 'image',
      title: 'L1',
      position: { x: 1580, y: 720 },
      versions: [
        {
          id: 'version-image-target',
          createdAt: '2026-08-14T08:00:00.000Z',
          prompt: '雾中茶山',
          assetId: 'asset-shot',
        },
      ],
      activeVersionId: 'version-image-target',
      sourceChanged: false,
    }
    const reference: Project['nodes'][number] = {
      id: 'image-reference',
      kind: 'image',
      title: '备选参考',
      position: { x: 1880, y: 720 },
      versions: [
        {
          id: 'version-image-reference',
          createdAt: '2026-08-14T08:01:00.000Z',
          prompt: '青绿衣饰',
          assetId: 'asset-character',
        },
      ],
      activeVersionId: 'version-image-reference',
      sourceChanged: false,
    }
    act(() => activate({ ...project, nodes: [...project.nodes, target, reference] }))
    renderCanvas()

    await user.click(screen.getByRole('button', { name: 'L1' }))
    await user.click(screen.getByRole('button', { name: '参考' }))
    expect(screen.getByRole('region', { name: '从画布选择参考' })).toHaveTextContent(
      '点画布其他节点建立引用连线',
    )
    await user.keyboard('l')
    expect(screen.getByRole('button', { name: /^连线$/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await user.click(screen.getByRole('button', { name: '备选参考' }))
    expect(useProjectStore.getState().activeProject?.edges).toContainEqual(
      expect.objectContaining({
        sourceNodeId: 'image-reference',
        targetNodeId: 'image-target',
      }),
    )
    expect(
      screen.queryByRole('region', { name: '从画布选择参考' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      '已将“备选参考”设为“L1”的参考',
    )
  })

  test('blocks unsupported upscale and legacy tool generation instead of silently redrawing', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.nodes[0]!.kind = 'image'
    project.nodes[0]!.imageTool = { kind: 'upscale', model: '高清修复', scale: '2x', resolution: '4K', detailProtection: true, cost: 18 }
    act(() => activate(project))
    renderCanvas()
    await user.click(screen.getByRole('button', { name: '角色参考' }))
    expect(screen.getByRole('button', { name: '高清' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '高清' })).toHaveAttribute('title', expect.stringContaining('未提供独立'))
    expect(screen.getByRole('button', { name: '生成高清图片，预计成本 18' })).toBeDisabled()
    act(() => triggerCanvasNodeAction('character', 'generate'))
    expect(screen.getByRole('status')).toHaveTextContent('不能用重绘冒充高清放大')
    expect(useProjectStore.getState().activeProject?.nodes).toHaveLength(5)
    expect(useProjectStore.getState().activeProject?.jobs).toHaveLength(1)
  })

  test('uploads and persists a local image-to-image reference without creating an edge', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.nodes.push({
      id: 'blank-image',
      kind: 'image',
      title: '图片 01',
      position: { x: 1680, y: 720 },
      versions: [{
        id: 'blank-image-version',
        createdAt: '2026-08-25T00:00:00.000Z',
        prompt: '',
      }],
      activeVersionId: 'blank-image-version',
      sourceChanged: false,
    })
    act(() => activate(project))
    renderCanvas()

    await user.click(screen.getByRole('button', { name: /^图片 01$/ }))
    await user.click(screen.getByRole('button', { name: /^图生图$/ }))
    await user.upload(
      screen.getByLabelText('为图片 01上传图生图参考'),
      new File(['reference-image'], '雨夜参考.png', { type: 'image/png' }),
    )

    await waitFor(() => {
      const updated = useProjectStore
        .getState()
        .activeProject?.nodes.find(({ id }) => id === 'blank-image')
      expect(updated?.generationConfig).toMatchObject({
        targetKind: 'image',
        providerId: 'seedream-5-pro-api',
        referenceAssets: [{
          kind: 'image',
          mimeType: 'image/png',
          url: expect.stringMatching(/^data:image\/png;base64,/),
        }],
      })
    })
    expect(useProjectStore.getState().activeProject?.edges).toHaveLength(
      project.edges.length,
    )
    expect(screen.getByRole('img', { name: '上传参考 1' })).toBeVisible()
    expect(screen.getByRole('button', { name: '生成图片，预计成本 18' })).toBeEnabled()
    expect(
      screen.getByText('已添加图生图参考图片“雨夜参考.png”。'),
    ).toBeVisible()
  })

  test('runs a selected-node regeneration through the queue and preserves its old version', async () => {
    const user = userEvent.setup()
    renderCanvas()
    await user.click(screen.getByRole('button', { name: '分镜 02' }))

    vi.useFakeTimers()
    act(() => triggerCanvasNodeAction('storyboard', 'regenerate'))
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

    act(() => triggerCanvasNodeAction('storyboard', 'generate-video'))
    await act(() => vi.advanceTimersByTimeAsync(1200))

    const project = useProjectStore.getState().activeProject!
    const video = project.nodes.find((node) => node.title === '视频 02')!
    expect(video.kind).toBe('video')
    expect(video.generationConfig).toMatchObject({
      targetKind: 'video',
      providerId: 'seedance-api',
      parameters: {
        aspectRatio: 'Auto',
        duration: '5',
        quality: '720P',
        sound: true,
        count: '1',
        autoLink: true,
      },
      referenceAssets: [{ url: '/demo/shot-rooftop.png' }],
    })
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
    act(() => triggerCanvasNodeAction('character', 'generate-video'))

    expect(
      await screen.findByRole('button', { name: '视频 01' }),
    ).toBeVisible()
    expect(useProjectStore.getState().activeProject?.assets).toContainEqual(
      injectedResult.asset,
    )
  })

  test('submits only the real image model supported parameters after confirmation', async () => {
    const user = userEvent.setup()
    const start = vi.fn<GenerationAdapter['start']>().mockImplementation(() => new Promise(() => undefined))
    renderCanvas({ repository: noOpCanvasRepository, generationAdapter: { start } })
    await user.click(screen.getByRole('button', { name: '角色参考' }))
    const panel = screen.getByRole('region', { name: '角色参考 生成参数' })
    await user.selectOptions(within(panel).getByRole('combobox', { name: '图片模型' }), 'seedream-5-pro-api')
    await user.click(within(panel).getByRole('button', { name: '生成图片，预计成本 18' }))
    expect(start).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '确认生成 1 张图片' }))
    await waitFor(() => expect(start).toHaveBeenCalledOnce())
    expect(start.mock.calls[0]?.[0]).toMatchObject({ providerId: 'seedream-5-pro-api', parameters: { aspectRatio: '16:9', resolution: '2K', count: '1' } })
    expect(start.mock.calls[0]?.[0].parameters).not.toHaveProperty('quality')
    expect(start.mock.calls[0]?.[0].parameters).toHaveProperty('editStrength', 0.5)
  })

  test('persists a Seedance live video into project versions, assets, and generation history', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.nodes = project.nodes.map((node) =>
      node.id === 'video'
        ? {
            ...node,
            modelProviderId: 'seedance-api',
            versions: [{
              id: 'version-video-live',
              createdAt: project.createdAt,
              prompt: '雨夜街道，摄影机缓慢向前推进',
            }],
            activeVersionId: 'version-video-live',
            generationConfig: {
              targetKind: 'video',
              providerId: 'seedance-api',
              parameters: {
                aspectRatio: '16:9',
                duration: '5',
                generationMode: '文生视频',
              },
              referenceAssets: [],
            },
          }
        : node,
    )
    act(() => activate(project))
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(seedanceVideoCreateSuccessFixture)))
      .mockResolvedValueOnce(new Response(JSON.stringify(seedanceVideoSuccessFixture)))
    const providerRegistry = createDefaultProviderRegistry({
      seedanceVideo: {
        ...seedanceVideoConfigFixture,
        fetchFn,
        pollIntervalMs: 0,
      },
    })
    const ephemeralGenerationResultStore =
      new EphemeralGenerationResultStore()
    const save = vi.fn().mockResolvedValue(undefined)

    renderCanvas({
      repository: { load: async () => undefined, save },
      generationAdapter: new RegistryGenerationAdapter(providerRegistry),
      providerRegistry,
      ephemeralGenerationResultStore,
    })
    await user.click(screen.getByRole('button', { name: '视频片段' }))
    await user.click(
      screen.getByRole('button', { name: '生成视频，预计成本 135' }),
    )

    await waitFor(() => {
      expect(document.querySelector('video')).toHaveAttribute(
        'src',
        'https://media.fixture.invalid/seedance-result.mp4',
      )
    })
    await waitFor(() => expect(save).toHaveBeenCalled())
    const persisted = useProjectStore.getState().activeProject!
    expect(persisted.assets).toContainEqual(
      expect.objectContaining({
        kind: 'video',
        url: 'https://media.fixture.invalid/seedance-result.mp4',
      }),
    )
    expect(persisted.jobs).toContainEqual(
      expect.objectContaining({ status: 'succeeded', providerId: 'seedance-api' }),
    )
    expect(persisted.nodes.find(({ id }) => id === 'video')?.versions).toContainEqual(
      expect.objectContaining({ generationJobId: expect.any(String), assetId: expect.any(String) }),
    )
    expect(ephemeralGenerationResultStore.get('project-canvas', 'video')).toBeUndefined()
  })

  test('persists a Seedream live image into project versions, assets, and generation history', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    const liveImage: Project['nodes'][number] = {
      id: 'seedream-image',
      kind: 'image',
      title: 'Seedream 生图',
      position: { x: 1560, y: 120 },
      versions: [{
        id: 'version-seedream-live',
        createdAt: project.createdAt,
        prompt: '雨夜街道上的电影感人像，霓虹灯倒映在湿润路面',
      }],
      activeVersionId: 'version-seedream-live',
      sourceChanged: false,
      modelProviderId: 'seedream-5-pro-api',
      imageGeneration: {
        ...defaultImageGenerationSettings,
        prompt: '雨夜街道上的电影感人像，霓虹灯倒映在湿润路面',
        aspectRatio: '16:9',
        resolution: '2K',
        count: 1,
      },
      generationConfig: {
        targetKind: 'image',
        providerId: 'seedream-5-pro-api',
        parameters: {
          aspectRatio: '16:9',
          resolution: '2K',
          count: 1,
        },
        referenceAssets: [],
      },
    }
    project.nodes = [...project.nodes, liveImage]
    act(() => activate(project))
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(seedreamMinLoopSuccessFixture)))
    const providerRegistry = createDefaultProviderRegistry({
      seedream: { ...seedreamMinLoopConfigFixture, fetchFn },
    })
    const ephemeralGenerationResultStore = new EphemeralGenerationResultStore()
    const save = vi.fn().mockResolvedValue(undefined)

    renderCanvas({
      repository: { load: async () => undefined, save },
      generationAdapter: new RegistryGenerationAdapter(providerRegistry),
      providerRegistry,
      ephemeralGenerationResultStore,
    })
    await user.click(screen.getByRole('button', { name: 'Seedream 生图' }))
    await user.click(
      screen.getByRole('button', { name: '生成图片，预计成本 18' }),
    )
    await user.click(screen.getByRole('button', { name: '确认生成 1 张图片' }))

    await waitFor(() => {
      expect(
        document.querySelector('img[src="https://media.fixture.invalid/seedream-result.png"]'),
      ).toBeInTheDocument()
    })
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(screen.getByText('Seedream 5.0 Pro结果已保存到项目与生成历史。')).toBeVisible()
    const persisted = useProjectStore.getState().activeProject!
    expect(persisted.assets).toContainEqual(
      expect.objectContaining({
        kind: 'image',
        url: 'https://media.fixture.invalid/seedream-result.png',
      }),
    )
    expect(persisted.jobs).toContainEqual(
      expect.objectContaining({ status: 'succeeded', providerId: 'seedream-5-pro-api' }),
    )
    expect(ephemeralGenerationResultStore.get('project-canvas', 'seedream-image')).toBeUndefined()
  })

  test.each([false, true])('persists confirmed Ark edits as new versions, project assets and history in IndexedDB (retry=%s)', async (retry) => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.assets[0] = { ...project.assets[0]!, url: 'https://media.fixture.invalid/shot-river.png', width: 2816, height: 1584 }
    act(() => activate(project))
    const db = new WirelessCanvasDatabase(`image-edit-${crypto.randomUUID()}`)
    const repository = new ProjectRepository(db)
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(arkImageEditSuccessFixture)))
    if (retry) fetchFn.mockResolvedValueOnce(new Response('{}', { status: 401 }))
    const providerRegistry = createDefaultProviderRegistry({ seedream: { ...arkImageEditConfigFixture, fetchFn } })
    const view = renderCanvas({ repository, providerRegistry, generationAdapter: new RegistryGenerationAdapter(providerRegistry), generationPreferenceStore: libtvPreferenceStore })
    try {
      await user.click(screen.getByRole('button', { name: '角色参考' }))
      await user.click(screen.getByRole('button', { name: '擦除' }))
      const dialog = screen.getByRole('dialog', { name: 'AI 局部擦除' })
      await user.type(within(dialog).getByLabelText('编辑描述'), '路牌')
      for (const [name, value] of [['左边界', '100'], ['上边界', '200'], ['右边界', '600'], ['下边界', '800']]) {
        fireEvent.change(within(dialog).getByLabelText(name!), { target: { value } })
      }
      expect(fetchFn).not.toHaveBeenCalled()
      await user.click(within(dialog).getByRole('button', { name: '确认编辑并生成' }))
      if (retry) {
        await waitFor(() => expect(useProjectStore.getState().activeProject?.jobs.at(-1)?.status).toBe('failed'))
        expect(useProjectStore.getState().activeProject?.nodes[0]?.versions).toHaveLength(1)
        expect(useProjectStore.getState().activeProject?.assets).toHaveLength(project.assets.length)
        await user.click(screen.getByRole('button', { name: '重试生成' }))
      }
      await waitFor(() => expect(useProjectStore.getState().activeProject?.jobs.at(-1)?.status).toBe('succeeded'))
      await waitFor(async () => {
        const saved = await repository.load(project.id)
        expect(saved?.nodes[0]?.versions).toHaveLength(2)
        expect(saved?.nodes[0]?.versions[0]?.id).toBe('version-character')
        expect(saved?.assets).toContainEqual(expect.objectContaining({ url: arkImageEditSuccessFixture.data[0]!.url }))
        expect(saved?.jobs.at(-1)).toMatchObject({ providerId: 'ark-image-edit', status: 'succeeded', creditsSpent: 18,
          generationConfig: { parameters: { imageEditOperation: 'erase', editX1: 100, editY2: 800 } } })
      })
      expect(JSON.parse(String(fetchFn.mock.calls[0]![1]?.body)).prompt).toContain('<bbox>100 200 600 800</bbox>')
    } finally {
      view.unmount()
      await db.delete()
    }
  })

  test.each([false, true])('confirms serial grid analysis and persists every output, including partial failure (%s)', async (partial) => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.assets[0]!.url = 'https://media.fixture.invalid/reference.png'
    act(() => activate(project))
    const db = new WirelessCanvasDatabase(`analysis-grid-${crypto.randomUUID()}`)
    const repository = new ProjectRepository(db)
    let calls = 0
    const fetchFn = vi.fn<typeof fetch>(async () => {
      calls += 1
      return calls === 3 && partial ? new Response('{}', { status: 429 }) : new Response(JSON.stringify({ data: [{ url: `https://media.fixture.invalid/grid-${calls}.png`, size: '2048x1152' }] }))
    })
    const providerRegistry = createDefaultProviderRegistry({ seedream: { ...arkAnalysisConfigFixture, fetchFn } })
    const view = renderCanvas({ repository, providerRegistry, generationAdapter: new RegistryGenerationAdapter(providerRegistry), generationPreferenceStore: libtvPreferenceStore })
    try {
      const open = latestFlowProps?.nodes.find(node => node.id === 'character')?.data.onOpenAnalysisTool as ((id: string, prompt: string) => void)
      expect(open).toBeTypeOf('function')
      act(() => open('plot-four-grid-api', '清晨古桥'))
      const dialog = screen.getByRole('dialog', { name: '剧情推演四宫格' })
      expect(within(dialog).getByText(/72 积分/)).toBeVisible()
      expect(fetchFn).not.toHaveBeenCalled()
      await user.click(within(dialog).getByRole('button', { name: '确认生成' }))
      await waitFor(() => expect(useProjectStore.getState().activeProject?.jobs.at(-1)?.status).toBe(partial ? 'failed' : 'succeeded'))
      await waitFor(async () => {
        const saved = await repository.load(project.id)
        expect(saved?.nodes[0]?.imageResults).toHaveLength(partial ? 2 : 4)
        expect(saved?.nodes[0]?.versions).toHaveLength(2)
        expect(saved?.assets.filter(asset => asset.url.includes('/grid-'))).toHaveLength(partial ? 2 : 4)
        expect(saved?.jobs.at(-1)).toMatchObject({ providerId: 'plot-four-grid-api', creditsSpent: partial ? 36 : 72 })
      })
      if (partial) {
        act(() => triggerCanvasNodeAction('character', 'retry-generation'))
        expect(screen.getByRole('dialog', { name: '剧情推演四宫格' })).toBeVisible()
        expect(fetchFn).toHaveBeenCalledTimes(3)
      } else {
        await user.click(screen.getByRole('button', { name: '历史记录' }))
        await user.click(screen.getByRole('button', { name: '重发画布 角色参考' }))
        await user.click(screen.getByRole('button', { name: '确认重新生成' }))
        const confirmation = screen.getByRole('dialog', { name: '剧情推演四宫格' })
        expect(confirmation).toHaveTextContent('72 积分')
        expect(fetchFn).toHaveBeenCalledTimes(4)
      }
    } finally { view.unmount(); await db.delete() }
  })

  test('persists structured video analysis without replacing the video source or calling generation APIs', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.assets[3] = { id: 'asset-video', kind: 'video', mimeType: 'video/mp4', url: 'https://media.fixture.invalid/clip.mp4' }
    project.nodes[3]!.details = { type: 'frame-analysis', sourceName: '来源视频', sourceSummary: '来源视频', dimensions: { storyboard: true, motion: true, music: false } }
    act(() => activate(project))
    const db = new WirelessCanvasDatabase(`analysis-video-${crypto.randomUUID()}`)
    const repository = new ProjectRepository(db)
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(arkFrameResponseFixture)))
    const providerRegistry = createDefaultProviderRegistry({ arkText: { ...arkAnalysisConfigFixture, fetchFn } })
    const view = renderCanvas({ repository, providerRegistry, generationAdapter: new RegistryGenerationAdapter(providerRegistry) })
    try {
      const open = latestFlowProps?.nodes.find(node => node.id === 'video')?.data.onOpenAnalysisTool as ((id: string) => void)
      expect(open).toBeTypeOf('function')
      act(() => open('frame-analysis-api'))
      await user.click(screen.getByRole('button', { name: '确认分析' }))
      await waitFor(() => expect(useProjectStore.getState().activeProject?.jobs.at(-1)).toMatchObject({ status: 'succeeded', providerId: 'frame-analysis-api' }))
      await waitFor(async () => {
        const saved = await repository.load(project.id)
        expect(saved?.assets).toContainEqual(project.assets[3])
        expect(saved?.nodes[3]?.versions.at(-1)?.textContent).toContain('shots')
        expect(saved?.jobs.at(-1)).toMatchObject({ providerId: 'frame-analysis-api', generationConfig: { referenceAssets: [{ kind: 'video', url: project.assets[3]!.url }] } })
      })
      expect(String(fetchFn.mock.calls[0]?.[0])).toContain('/chat/completions')
    } finally { view.unmount(); await db.delete() }
  })

  test('submits the current image prompt to Seedream after editing the composer', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.intent = ''
    project.nodes = [
      ...project.nodes,
      {
        id: 'seedream-edited-prompt',
        kind: 'image',
        title: 'Seedream 编辑提示词',
        position: { x: 1560, y: 120 },
        versions: [{
          id: 'version-seedream-edited-prompt',
          createdAt: project.createdAt,
          prompt: '',
        }],
        activeVersionId: 'version-seedream-edited-prompt',
        sourceChanged: false,
        modelProviderId: 'seedream-5-pro-api',
        imageGeneration: {
          ...defaultImageGenerationSettings,
          prompt: '',
          aspectRatio: '16:9',
          resolution: '2K',
          count: 1,
        },
        generationConfig: {
          targetKind: 'image',
          providerId: 'seedream-5-pro-api',
          parameters: {
            aspectRatio: '16:9',
            resolution: '2K',
            count: 1,
          },
          referenceAssets: [],
        },
      },
    ]
    act(() => activate(project))
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(seedreamMinLoopSuccessFixture)))
    const providerRegistry = createDefaultProviderRegistry({
      seedream: { ...seedreamMinLoopConfigFixture, fetchFn },
    })

    renderCanvas({
      repository: noOpCanvasRepository,
      generationAdapter: new RegistryGenerationAdapter(providerRegistry),
      providerRegistry,
      ephemeralGenerationResultStore: new EphemeralGenerationResultStore(),
    })
    await user.click(screen.getByRole('button', { name: 'Seedream 编辑提示词' }))
    await user.type(
      screen.getByRole('textbox', { name: '提示词' }),
      '白色陶瓷杯产品摄影',
    )
    await user.click(
      screen.getByRole('button', { name: '生成图片，预计成本 18' }),
    )
    await user.click(screen.getByRole('button', { name: '确认生成 1 张图片' }))

    await waitFor(() => expect(fetchFn).toHaveBeenCalledOnce())
    const requestBody = JSON.parse(
      String(fetchFn.mock.calls[0]?.[1]?.body),
    ) as { prompt?: string }
    expect(requestBody.prompt).toBe('白色陶瓷杯产品摄影')
  })

  test('persists a custom Seedream size and submits the chosen dimensions', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.nodes = [
      ...project.nodes,
      {
        id: 'seedream-custom-size',
        kind: 'image',
        title: 'Seedream 自定义尺寸',
        position: { x: 1560, y: 120 },
        versions: [{
          id: 'version-seedream-custom-size',
          createdAt: project.createdAt,
          prompt: '红色漆面香水瓶产品摄影',
        }],
        activeVersionId: 'version-seedream-custom-size',
        sourceChanged: false,
        modelProviderId: 'seedream-5-pro-api',
        imageGeneration: {
          ...defaultImageGenerationSettings,
          prompt: '红色漆面香水瓶产品摄影',
          aspectRatio: '16:9',
          resolution: '2K',
          count: 1,
        },
        generationConfig: {
          targetKind: 'image',
          providerId: 'seedream-5-pro-api',
          parameters: {
            aspectRatio: '16:9',
            resolution: '2K',
            count: 1,
          },
          referenceAssets: [],
        },
      },
    ]
    act(() => activate(project))
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(seedreamMinLoopSuccessFixture)))
    const providerRegistry = createDefaultProviderRegistry({
      seedream: { ...seedreamMinLoopConfigFixture, fetchFn },
    })

    renderCanvas({
      repository: noOpCanvasRepository,
      generationAdapter: new RegistryGenerationAdapter(providerRegistry),
      providerRegistry,
      ephemeralGenerationResultStore: new EphemeralGenerationResultStore(),
    })
    await user.click(screen.getByRole('button', { name: 'Seedream 自定义尺寸' }))
    await user.click(screen.getByRole('button', { name: '图片生成参数' }))
    await user.click(screen.getByRole('button', { name: '自定义' }))

    const width = screen.getByRole('spinbutton', { name: '自定义宽度' })
    const height = screen.getByRole('spinbutton', { name: '自定义高度' })
    await user.clear(width)
    await user.type(width, '1600')
    await user.clear(height)
    await user.type(height, '2000')

    expect(screen.getByRole('button', { name: '图片生成参数' })).toHaveTextContent(
      '1600×2000 · 2K · 1张',
    )
    expect(
      useProjectStore.getState().activeProject?.nodes.find(
        ({ id }) => id === 'seedream-custom-size',
      ),
    ).toMatchObject({
      imageGeneration: {
        aspectRatio: '自定义',
        customWidth: 1600,
        customHeight: 2000,
      },
      generationConfig: {
        parameters: {
          aspectRatio: '自定义',
          customWidth: 1600,
          customHeight: 2000,
        },
      },
    })

    await user.click(
      screen.getByRole('button', { name: '生成图片，预计成本 18' }),
    )
    await user.click(screen.getByRole('button', { name: '确认生成 1 张图片' }))
    await waitFor(() => expect(fetchFn).toHaveBeenCalledOnce())
    const requestBody = JSON.parse(
      String(fetchFn.mock.calls[0]?.[1]?.body),
    ) as { size?: string }
    expect(requestBody.size).toBe('1600x2000')
  })

  test('persists all four intercepted Seedream results in the node grid and generation history', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.nodes = [
      ...project.nodes,
      {
        id: 'seedream-four-images',
        kind: 'image',
        title: 'Seedream 四图',
        position: { x: 1560, y: 120 },
        versions: [{
          id: 'version-seedream-four-images',
          createdAt: project.createdAt,
          prompt: '同一款香水瓶的四种棚拍构图',
        }],
        activeVersionId: 'version-seedream-four-images',
        sourceChanged: false,
        modelProviderId: 'seedream-5-pro-api',
        imageGeneration: {
          ...defaultImageGenerationSettings,
          prompt: '同一款香水瓶的四种棚拍构图',
          aspectRatio: '9:21',
          resolution: '2K',
          count: 4,
        },
        generationConfig: {
          targetKind: 'image',
          providerId: 'seedream-5-pro-api',
          parameters: {
            aspectRatio: '9:21',
            resolution: '2K',
            count: 4,
          },
          referenceAssets: [],
        },
      },
    ]
    act(() => activate(project))
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => {
      const index = fetchFn.mock.calls.length
      return new Response(JSON.stringify({
        ...seedreamMinLoopMultiOutputFixture,
        data: [{
          url: `https://media.fixture.invalid/seedream-four-${index}.png`,
          size: '1344x3136',
        }],
      }))
    })
    const providerRegistry = createDefaultProviderRegistry({
      seedream: { ...seedreamMinLoopConfigFixture, fetchFn },
    })
    const ephemeralGenerationResultStore = new EphemeralGenerationResultStore()
    const save = vi.fn().mockResolvedValue(undefined)

    renderCanvas({
      repository: { load: async () => undefined, save },
      generationAdapter: new RegistryGenerationAdapter(providerRegistry),
      providerRegistry,
      ephemeralGenerationResultStore,
    })
    await user.click(screen.getByRole('button', { name: 'Seedream 四图' }))
    expect(screen.getByRole('button', { name: '图片生成参数' })).toHaveTextContent(
      '1344×3136 · 2K · 4张',
    )
    await user.click(
      screen.getByRole('button', { name: '生成图片，预计成本 72' }),
    )
    const confirmation = screen.getByRole('alertdialog', { name: '确认真实图片生成' })
    expect(within(confirmation).getByText('总成本 72 积分')).toBeVisible()
    await user.click(within(confirmation).getByRole('button', { name: '确认生成 4 张图片' }))

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(4))
    const resultTrigger = await screen.findByRole('button', { name: '查看 4 张结果' })
    await user.click(resultTrigger)
    const grid = screen.getByRole('region', { name: 'Seedream 四图 的 4 张结果' })
    expect(within(grid).getAllByRole('img')).toHaveLength(4)
    const persisted = useProjectStore.getState().activeProject!
    const node = persisted.nodes.find(({ id }) => id === 'seedream-four-images')
    expect(node?.imageResults).toHaveLength(4)
    expect(node?.versions.at(-1)).toMatchObject({
      assetId: node?.imageResults?.[0].assetId,
      generationJobId: expect.any(String),
    })
    expect(persisted.assets.filter(({ id }) => node?.imageResults?.some(({ assetId }) => assetId === id))).toHaveLength(4)
    expect(persisted.jobs.at(-1)).toMatchObject({
      status: 'succeeded',
      assetId: node?.imageResults?.[0].assetId,
      providerId: 'seedream-5-pro-api',
    })
    expect(ephemeralGenerationResultStore.get(project.id, node!.id)).toBeUndefined()
    await waitFor(() => expect(save).toHaveBeenCalled())
  })

  test('requires explicit LibTV confirmation and Cancel creates no job', async () => {
    const user = userEvent.setup()
    const start = vi.fn<GenerationAdapter['start']>()
    renderCanvas({
      repository: noOpCanvasRepository,
      generationAdapter: { start },
      generationPreferenceStore: libtvPreferenceStore,
    })

    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    act(() => triggerCanvasNodeAction('storyboard', 'regenerate'))

    expect(screen.getByRole('dialog', { name: '确认 LibTV 实际生成' })).toBeVisible()
    expect(start).not.toHaveBeenCalled()
    const beforeJobs = useProjectStore.getState().activeProject?.jobs.length
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: '确认 LibTV 实际生成' })).not.toBeInTheDocument()
    expect(start).not.toHaveBeenCalled()
    expect(useProjectStore.getState().activeProject?.jobs).toHaveLength(beforeJobs ?? 0)
  })

  test('submits one exact structured LibTV request only after confirmation', async () => {
    const user = userEvent.setup()
    const start = vi.fn<GenerationAdapter['start']>().mockImplementation(
      () => new Promise(() => undefined),
    )
    renderCanvas({
      repository: noOpCanvasRepository,
      generationAdapter: { start },
      generationPreferenceStore: libtvPreferenceStore,
    })

    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    act(() => triggerCanvasNodeAction('storyboard', 'regenerate'))
    expect(start).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '确认并提交 LibTV' }))

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1))
    expect(start.mock.calls[0]?.[0]).toEqual({
      projectId: 'project-canvas',
      nodeId: 'storyboard',
      operation: 'regenerate',
      targetKind: 'image',
      prompt: '分镜 02创作描述',
      providerId: 'seedream-5-pro-api',
      parameters: expect.objectContaining({ aspectRatio: '16:9', resolution: '2K', count: '1' }),
      referenceAssets: [
        {
          url: '/demo/shot-rooftop.png',
          kind: 'image',
          mimeType: 'image/png',
        },
      ],
    })
  })

  test('rejects confirmation when the selected LibTV configuration changed', async () => {
    const user = userEvent.setup()
    const start = vi.fn<GenerationAdapter['start']>()
    let provider: ReturnType<GenerationProviderPreferenceStore['read']> =
      libtvPreferenceStore.read()
    const preferenceStore: GenerationProviderPreferenceStore = {
      read: () => provider,
      write: vi.fn(),
    }
    renderCanvas({
      repository: noOpCanvasRepository,
      generationAdapter: { start },
      generationPreferenceStore: preferenceStore,
    })

    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    act(() => triggerCanvasNodeAction('storyboard', 'regenerate'))
    provider = { provider: 'demo' }
    await user.click(screen.getByRole('button', { name: '确认并提交 LibTV' }))

    expect(start).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'LibTV 配置已变更，请重新发起生成',
    )
  })

  test('rejects confirmation when only the pinned LibTV model key changed', async () => {
    const user = userEvent.setup()
    const start = vi.fn<GenerationAdapter['start']>()
    let provider = libtvPreferenceStore.read()
    const preferenceStore: GenerationProviderPreferenceStore = {
      read: () => provider,
      write: vi.fn(),
    }
    renderCanvas({
      repository: noOpCanvasRepository,
      generationAdapter: { start },
      generationPreferenceStore: preferenceStore,
    })

    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    act(() => triggerCanvasNodeAction('storyboard', 'regenerate'))
    if (provider.provider === 'libtv') {
      provider = {
        provider: 'libtv',
        selection: { ...provider.selection, imageModelKey: 'image-key-replaced' },
      }
    }
    await user.click(screen.getByRole('button', { name: '确认并提交 LibTV' }))

    expect(start).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'LibTV 配置已变更，请重新发起生成',
    )
  })

  test('requires a fresh confirmation before incrementing a LibTV retry attempt', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.jobs.push({
      id: 'job-cancelled-libtv',
      projectId: project.id,
      nodeId: 'storyboard',
      operation: 'regenerate',
      attempt: 1,
      sequence: 1,
      status: 'cancelled',
      prompt: '分镜 02创作描述',
      createdAt: project.createdAt,
      updatedAt: '2026-08-07T08:00:00.000Z',
    })
    act(() => activate(project))
    const start = vi.fn<GenerationAdapter['start']>().mockImplementation(
      () => new Promise(() => undefined),
    )
    renderCanvas({
      repository: noOpCanvasRepository,
      generationAdapter: { start },
      generationPreferenceStore: libtvPreferenceStore,
    })

    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    await user.click(screen.getByRole('button', { name: '重试生成' }))
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(project.jobs.at(-1)?.attempt).toBe(1)
    expect(start).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '重试生成' }))
    await user.click(screen.getByRole('button', { name: '确认并提交 LibTV' }))
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1))
    expect(
      useProjectStore.getState().activeProject?.jobs.find(
        (job) => job.id === 'job-cancelled-libtv',
      )?.attempt,
    ).toBe(2)
  })

  test('discards a pending LibTV confirmation when the project route changes', async () => {
    const user = userEvent.setup()
    const projectB = { ...makeCanvasProject(), id: 'project-b', title: '项目 B' }
    const start = vi.fn<GenerationAdapter['start']>()
    render(
      <MemoryRouter initialEntries={['/project/project-canvas']}>
        <SwitchingCanvas
          repository={{ load: async () => projectB, save: async () => undefined }}
          generationAdapter={{ start }}
          generationPreferenceStore={libtvPreferenceStore}
        />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    act(() => triggerCanvasNodeAction('storyboard', 'regenerate'))
    expect(screen.getByRole('dialog', { name: '确认 LibTV 实际生成' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '切换到项目 B' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '确认 LibTV 实际生成' })).not.toBeInTheDocument()
    })
    expect(start).not.toHaveBeenCalled()
  })

  test('explains that local cancellation may not stop a remote LibTV task', async () => {
    const user = userEvent.setup()
    const start = vi.fn<GenerationAdapter['start']>().mockImplementation(
      (_request, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('cancelled', 'AbortError'))
        }, { once: true })
      }),
    )
    renderCanvas({
      repository: noOpCanvasRepository,
      generationAdapter: { start },
      generationPreferenceStore: libtvPreferenceStore,
    })
    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    act(() => triggerCanvasNodeAction('storyboard', 'regenerate'))
    await user.click(screen.getByRole('button', { name: '确认并提交 LibTV' }))
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: '取消生成' }))
    expect(screen.getByRole('status')).toHaveTextContent(
      '已停止在本地应用结果；LibTV 任务可能仍在远程运行',
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
      act(() => triggerCanvasNodeAction('storyboard', 'generate-video'))
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

  test('reloads context-uploaded image content from real Dexie persistence', async () => {
    const user = userEvent.setup()
    const database = new WirelessCanvasDatabase(
      `wireless-canvas-toolbar-image-${crypto.randomUUID()}`,
    )
    const repository = new ProjectRepository(database)
    const firstView = renderCanvas({ repository })
    let rehydratedView: ReturnType<typeof renderCanvas> | undefined

    try {
      initializeFlow({ x: 612, y: 428 })
      chooseContextUpload(360, 280)
      await user.upload(
        screen.getByLabelText('上传画布素材'),
        new File(['durable-image-bytes'], 'durable.png', {
          type: 'image/png',
        }),
      )
      await waitFor(() => {
        expect(
          useProjectStore.getState().activeProject?.nodes.some(
            ({ title }) => title === 'durable.png',
          ),
        ).toBe(true)
      })
      await waitFor(() => {
        expect(useProjectStore.getState().saveStatus).toBe('saved')
      })

      const saved = await repository.load('project-canvas')
      const savedNode = saved?.nodes.find(
        ({ title }) => title === 'durable.png',
      )
      const savedVersion = savedNode?.versions.find(
        ({ id }) => id === savedNode.activeVersionId,
      )
      const savedAsset = saved?.assets.find(
        ({ id }) => id === savedVersion?.assetId,
      )
      expect(savedNode?.position).toEqual({ x: 612, y: 428 })
      expect(savedVersion?.prompt).toBe('durable.png')
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
        await screen.findByRole('button', { name: 'durable.png' }),
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

  test('reuses the contextual action to add a generated storyboard still to the timeline', async () => {
    const user = userEvent.setup()
    renderCanvas()
    await user.click(screen.getByRole('button', { name: '分镜 02' }))

    await user.click(screen.getByRole('button', { name: '加入时间线' }))

    expect(useProjectStore.getState().activeProject?.timeline).toContainEqual(
      expect.objectContaining({ nodeId: 'storyboard', track: 'video', order: 0 }),
    )
  })

  test.each(['角色参考', '场景设定', '成片预览'])(
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
    act(() => triggerCanvasNodeAction('storyboard', 'regenerate'))
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
    act(() => triggerCanvasNodeAction('storyboard', 'regenerate'))
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
    act(() => triggerCanvasNodeAction('storyboard', 'regenerate'))
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
    act(() => triggerCanvasNodeAction('storyboard', 'regenerate'))
    await act(() => vi.advanceTimersByTimeAsync(1200))
    firstView.unmount()

    renderCanvas()
    act(() => screen.getByRole('button', { name: '分镜 02' }).click())
    act(() => triggerCanvasNodeAction('storyboard', 'regenerate'))
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
    act(() => triggerCanvasNodeAction('storyboard', 'regenerate'))
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
    act(() => triggerCanvasNodeAction('storyboard', 'regenerate'))
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
    await user.click(screen.getByRole('button', { name: 'Agent' }))
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
    await user.click(screen.getByRole('button', { name: 'Agent' }))
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
    await user.click(screen.getByRole('button', { name: 'Agent' }))
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

  test('discloses that generation is a local PNG-thumbnail demo', async () => {
    const user = userEvent.setup()
    renderCanvas()
    await user.click(screen.getByRole('button', { name: 'Agent' }))

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
    expect(screen.getByText('请选择来源节点')).toBeVisible()
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

  test('keeps a toolbar source after a self-connection for a valid retry', async () => {
    const user = userEvent.setup()
    act(() => activate({ ...makeCanvasProject(), edges: [] }))
    renderCanvas()
    const connect = screen.getByRole('button', { name: '连线' })

    await user.click(connect)
    await user.click(screen.getByRole('button', { name: '分镜 02' }))
    await user.click(screen.getByRole('button', { name: '分镜 02' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      '节点不能连接到自身',
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
      screen.queryByText('节点不能连接到自身'),
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
    expect(screen.getByText('请选择来源节点')).toBeVisible()
    expect(screen.getByRole('status')).not.toHaveClass(
      'canvas-connection-hint--error',
    )
    await user.click(connect)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(connect).toHaveAttribute('aria-pressed', 'false')
    expect(useProjectStore.getState().past).toHaveLength(1)
  })

  test('keeps a dropped source connection visible until it connects to any node', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow({ x: 860, y: 420 })

    act(() => latestFlowProps?.onConnectStart?.({}, {}))
    act(() => {
      latestFlowProps?.onConnectEnd?.(
        { clientX: 640, clientY: 360 },
        {
          isValid: false,
          fromNode: { id: 'character' },
          fromHandle: { type: 'source' },
        },
      )
    })

    expect(screen.queryByRole('menu', { name: '引用该节点生成' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '继续连接：角色参考' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(
      '连接线已保留，请选择任意目标节点',
    )
    expect(useProjectStore.getState().activeProject?.connectionDrafts).toEqual([
      expect.objectContaining({
        sourceNodeId: 'character',
        position: { x: 860, y: 420 },
      }),
    ])
    expect(useProjectStore.getState().past).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: '成片预览' }))
    expect(useProjectStore.getState().activeProject?.connectionDrafts).toEqual([])
    expect(useProjectStore.getState().activeProject?.edges).toContainEqual(
      expect.objectContaining({
        sourceNodeId: 'character',
        targetNodeId: 'preview',
      }),
    )

    act(() => useProjectStore.getState().undo())
    expect(useProjectStore.getState().activeProject?.connectionDrafts).toHaveLength(1)
    expect(useProjectStore.getState().activeProject?.edges).not.toContainEqual(
      expect.objectContaining({ sourceNodeId: 'character', targetNodeId: 'preview' }),
    )
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
    const advancedSettings = screen.getByRole('button', { name: '展开高级设置' })
    await user.click(screen.getByRole('button', { name: '连线' }))
    expect(screen.getByText('请选择来源节点')).toBeVisible()

    await user.click(advancedSettings)
    act(() => {
      latestFlowProps?.onNodeClick?.(
        { target: advancedSettings },
        latestFlowProps.nodes.find(({ id }) => id === 'character')!,
      )
    })

    expect(screen.getByText('请选择来源节点')).toBeVisible()
    expect(
      latestFlowProps?.nodes.some(
        (node) => node.data.connectionSource === true,
      ),
    ).toBe(false)
    expect(useProjectStore.getState().past).toEqual([])
  })

  test('keeps one concrete connection error while a context draft is open', () => {
    renderCanvas()
    initializeFlow()

    doubleClickPane()
    expect(screen.getByRole('dialog', { name: '选择节点类型' })).toBeVisible()

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
    expect(connect).toHaveAttribute('aria-pressed', 'false')
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
    await user.click(screen.getByRole('button', { name: 'Agent' }))
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
    doubleClickPane()
    screen.getByRole('button', { name: '文本' }).focus()
    await user.keyboard('l')

    expect(
      screen.getByRole('dialog', { name: '选择节点类型' }),
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
      expect(connect).toHaveAttribute('aria-pressed', 'false')
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

  test('inserts contextual media nodes into all selected edges through the shared picker as one undo step', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    activate(project)
    renderCanvas()
    const first = latestFlowProps!.edges.find(
      ({ id }) => id === 'character-scene',
    )!
    const second = latestFlowProps!.edges.find(
      ({ id }) => id === 'scene-storyboard',
    )!
    const trigger = document.createElement('button')
    document.body.append(trigger)

    act(() => latestFlowProps?.onEdgesChange([
      { type: 'select', id: first.id, selected: true },
      { type: 'select', id: second.id, selected: true },
    ]))
    expect(
      latestFlowProps?.edges.filter(({ selected }) => selected).map(({ id }) => id),
    ).toEqual([first.id, second.id])

    act(() => {
      latestFlowProps?.edges
        .find(({ id }) => id === first.id)
        ?.data?.onInsert(first.id, { x: 250, y: 145 }, trigger)
    })
    expect(screen.getByRole('dialog', { name: '选择节点类型' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '视频' }))

    const current = useProjectStore.getState().activeProject!
    const inserted = current.nodes.filter(
      ({ id }) => !project.nodes.some((node) => node.id === id),
    )
    expect(inserted).toHaveLength(2)
    expect(inserted.map(({ position }) => position)).toContainEqual({ x: 250, y: 145 })
    expect(inserted.every(({ kind }) => kind === 'video')).toBe(true)
    expect(inserted.map((node) => node.versions[0]?.prompt)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('角色参考'),
        expect.stringContaining('场景设定'),
      ]),
    )
    expect(current.edges).toHaveLength(project.edges.length + 2)
    expect(current.edges.some(({ id }) => id === first.id)).toBe(false)
    expect(current.edges.some(({ id }) => id === second.id)).toBe(false)
    expect(useProjectStore.getState().past).toHaveLength(1)

    act(() => useProjectStore.getState().undo())
    expect(useProjectStore.getState().activeProject).toEqual(project)
    trigger.remove()
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
      deleteKeyCode: null,
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

  test('shows the Liblib starter on an empty project and creates the first node through the shared quick path', async () => {
    const user = userEvent.setup()
    const project = {
      ...makeCanvasProject(),
      assets: [],
      nodes: [],
      edges: [],
      timeline: [],
      jobs: [],
      exportJobs: [],
      groups: [],
    }
    act(() => activate(project))
    renderCanvas()
    initializeFlow({ x: 640, y: 360 })

    const starter = screen.getByRole('region', { name: '开始创作' })
    expect(starter).toHaveTextContent(/双击画布.*自由生成节点/)
    expect(
      within(starter).getAllByRole('button').map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      '故事脚本生成',
      '角色三视图',
      '全能参考生视频 SD2.5',
      '音频生视频 SD2.5',
    ])

    await user.click(within(starter).getByRole('button', { name: '角色三视图' }))

    expect(screen.queryByRole('region', { name: '开始创作' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '角色三视图 01' })).toBeVisible()
    expect(useProjectStore.getState().activeProject?.nodes).toEqual([
      expect.objectContaining({
        kind: 'character-card',
        title: '角色三视图 01',
        position: { x: 640, y: 360 },
      }),
    ])
  })

  test('creates the Liblib text-to-video preset as a connected grouped pair', async () => {
    const user = userEvent.setup()
    const project = {
      ...makeCanvasProject(),
      assets: [],
      nodes: [{
        id: 'text-preset-source',
        kind: 'text' as const,
        title: '文本节点 08',
        position: { x: 120, y: 180 },
        versions: [{
          id: 'text-preset-version',
          createdAt: '2026-08-25T00:00:00.000Z',
          prompt: '',
        }],
        activeVersionId: 'text-preset-version',
        sourceChanged: false,
        details: {
          type: 'text' as const,
          content: '高原广告镜头，雪山下的金色麦浪',
          fontStyle: '正文' as const,
          modelProviderId: 'ark-text-llm',
          modelVariant: 'qwen-3-vl-flash',
        },
      }],
      edges: [],
      timeline: [],
      jobs: [],
      exportJobs: [],
      groups: [],
    }
    act(() => activate(project))
    renderCanvas()
    initializeFlow({ x: 640, y: 360 })

    await user.click(screen.getByRole('button', { name: '文生视频' }))

    const activeProject = useProjectStore.getState().activeProject!
    const video = activeProject.nodes.find(({ kind }) => kind === 'video')
    expect(activeProject.nodes).toHaveLength(2)
    expect(activeProject.nodes[0].details).toEqual(expect.objectContaining({
      type: 'text',
      editorMode: 'manual',
    }))
    expect(video).toEqual(expect.objectContaining({
      title: '视频 01',
      position: { x: 520, y: 180 },
      generationConfig: expect.objectContaining({
        targetKind: 'video',
        parameters: expect.objectContaining({ generationMode: '文生视频' }),
      }),
    }))
    expect(activeProject.edges).toEqual([
      expect.objectContaining({
        sourceNodeId: 'text-preset-source',
        targetNodeId: video?.id,
      }),
    ])
    expect(activeProject.groups).toEqual([
      expect.objectContaining({
        title: '预设 - 文生视频',
        kind: 'preset',
        nodeIds: ['text-preset-source', video?.id],
      }),
    ])
    expect(screen.getByRole('region', { name: '视频 01 生成参数' })).toBeVisible()
  })

  test('switches between the real hand and move tools with H and V without hiding connections', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const canvas = screen.getByRole('region', { name: '项目画布' })
    canvas.focus()

    await user.keyboard('h')

    expect(latestFlowProps).toMatchObject({
      panOnDrag: true,
      nodesDraggable: false,
      selectionOnDrag: false,
    })
    expect(screen.getByRole('status')).toHaveTextContent('已切换抓手工具')
    expect(latestFlowProps?.edges.every((edge) => edge.data?.visible === true)).toBe(true)

    await user.keyboard('v')
    expect(latestFlowProps).toMatchObject({
      panOnDrag: [1, 2],
      nodesDraggable: true,
      selectionOnDrag: true,
    })
    expect(screen.getByRole('status')).toHaveTextContent('已切换移动工具')
  })

  test('blocks every canvas shortcut from Agent inputs, editables, and dialogs', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow()
    await user.click(screen.getByRole('button', { name: 'Agent' }))
    const directorInput = screen.getByLabelText('告诉我下一步要做什么')
    const before = useProjectStore.getState().activeProject

    await user.click(directorInput)
    await user.keyboard('hd')
    expect(directorInput).toHaveValue('hd')
    await user.keyboard('{Enter}')
    expect(latestFlowProps).toMatchObject({ panOnDrag: [1, 2], nodesDraggable: true })
    expect(useProjectStore.getState().activeProject).toBe(before)
    expect(screen.queryByRole('dialog', { name: '自由生成节点' })).not.toBeInTheDocument()

    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    document.body.append(editable)
    editable.focus()
    await user.keyboard('d')
    expect(useProjectStore.getState().activeProject).toBe(before)
    editable.remove()

    await user.click(screen.getByRole('button', { name: '关闭 Agent' }))
    doubleClickPane()
    expect(screen.getByRole('dialog', { name: '选择节点类型' })).toBeVisible()
    await user.keyboard('h')
    await user.keyboard('d')
    expect(latestFlowProps).toMatchObject({ panOnDrag: [1, 2], nodesDraggable: true })
    expect(useProjectStore.getState().activeProject).toBe(before)
  })

  test('groups, creates storyboard groups, ungroups, and duplicates nodes with keyboard transactions', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const canvas = screen.getByRole('region', { name: '项目画布' })
    act(() =>
      latestFlowProps?.onNodesChange([
        { type: 'select', id: 'character', selected: true },
        { type: 'select', id: 'scene', selected: true },
      ]),
    )
    canvas.focus()

    await user.keyboard('g')
    expect(useProjectStore.getState().activeProject?.groups).toEqual([
      expect.objectContaining({ kind: 'standard', nodeIds: ['character', 'scene'] }),
    ])

    await user.keyboard('{Shift>}g{/Shift}')
    expect(useProjectStore.getState().activeProject?.groups).toEqual([])

    await user.keyboard('{Alt>}g{/Alt}')
    expect(useProjectStore.getState().activeProject?.groups).toEqual([
      expect.objectContaining({ kind: 'storyboard', title: '分镜组 01' }),
    ])

    const beforeNodes = useProjectStore.getState().activeProject!.nodes.length
    const beforeEdges = useProjectStore.getState().activeProject!.edges.length
    await user.keyboard('d')
    expect(useProjectStore.getState().activeProject?.nodes).toHaveLength(beforeNodes + 2)
    expect(useProjectStore.getState().activeProject?.edges.length).toBeGreaterThan(beforeEdges)
    expect(screen.getByRole('status')).toHaveTextContent('已复制 2 个节点及关联连线')
  })

  test('zooms, fits, opens the node picker, and arranges the canvas from shortcuts', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const { fitView, zoomIn, zoomOut } = initializeFlow()
    const canvas = screen.getByRole('region', { name: '项目画布' })
    canvas.focus()

    await user.keyboard('+')
    await user.keyboard('-')
    await user.keyboard('0')
    expect(zoomIn).toHaveBeenCalledWith({ duration: 160 })
    expect(zoomOut).toHaveBeenCalledWith({ duration: 160 })
    expect(fitView).toHaveBeenCalledWith({ duration: 260, padding: 0.16 })

    await user.keyboard('{Alt>}{Shift>}f{/Shift}{/Alt}')
    expect(useProjectStore.getState().past).toHaveLength(1)
    expect(useProjectStore.getState().activeProject?.nodes[0].position).toEqual({
      x: 80,
      y: 80,
    })
    expect(fitView).toHaveBeenLastCalledWith({ duration: 320, padding: 0.18 })

    await user.keyboard('{Tab}')
    expect(screen.getByRole('menu', { name: '添加节点' })).toBeVisible()
  })

  test('runs generation, undo, redo, and safe deletion only from an eligible canvas selection', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const canvas = screen.getByRole('region', { name: '项目画布' })
    await user.click(screen.getByRole('button', { name: '角色参考' }))
    canvas.focus()
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(
        useProjectStore
          .getState()
          .activeProject?.jobs.find(({ nodeId }) => nodeId === 'character'),
      ).toMatchObject({
          status: 'running',
          providerId: 'seedream-5-pro-api',
          estimatedCost: 18,
        }),
    )

    act(() =>
      latestFlowProps?.onNodesChange([
        { type: 'select', id: 'character', selected: false },
        { type: 'select', id: 'preview', selected: true },
      ]),
    )
    canvas.focus()
    await user.keyboard('{Delete}')
    expect(useProjectStore.getState().activeProject?.nodes.map(({ id }) => id)).not.toContain(
      'preview',
    )

    await user.keyboard('{Meta>}z{/Meta}')
    expect(useProjectStore.getState().activeProject?.nodes.map(({ id }) => id)).toContain(
      'preview',
    )
    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')
    expect(useProjectStore.getState().activeProject?.nodes.map(({ id }) => id)).not.toContain(
      'preview',
    )
  })

  test('dispatches the persisted image picker parameters and output-adjusted cost', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.nodes = project.nodes.map((node) =>
      node.id === 'character'
        ? {
            ...node,
            modelProviderId: 'seedream-5-pro-api',
            imageGeneration: {
              ...defaultImageGenerationSettings,
              prompt: '雨夜角色创作描述',
              resolution: '2K',
              aspectRatio: '9:16',
              count: 2,
            },
          }
        : node,
    )
    act(() => activate(project))
    const start = vi.fn<GenerationAdapter['start']>().mockImplementation(
      () => new Promise(() => undefined),
    )
    renderCanvas({
      repository: noOpCanvasRepository,
      generationAdapter: { start },
    })

    await user.click(screen.getByRole('button', { name: '角色参考' }))
    await user.click(
      screen.getByRole('button', { name: '生成图片，预计成本 36' }),
    )
    await user.click(screen.getByRole('button', { name: '确认生成 2 张图片' }))

    await waitFor(() => expect(start).toHaveBeenCalledOnce())
    expect(start.mock.calls[0]?.[0]).toMatchObject({
      targetKind: 'image',
      providerId: 'seedream-5-pro-api',
      parameters: {
        aspectRatio: '9:16',
        resolution: '2K',
        count: 2,
      },
    })
  })

  test('persists a registry model choice on the node and dispatches that provider id', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.assets = project.assets.map((asset) =>
      asset.id === 'asset-video'
        ? {
            ...asset,
            kind: 'video',
            url: '/demo/video-preview.mp4',
            mimeType: 'video/mp4',
            durationSeconds: 3.041,
          }
        : asset,
    )
    act(() => activate(project))
    const start = vi.fn<GenerationAdapter['start']>().mockImplementation(
      () => new Promise(() => undefined),
    )
    renderCanvas({
      repository: noOpCanvasRepository,
      generationAdapter: { start },
    })

    await user.click(screen.getByRole('button', { name: '视频片段' }))
    const panel = screen.getByRole('region', { name: '视频片段 生成参数' })
    await user.selectOptions(
      within(panel).getByRole('combobox', { name: '模型' }),
      'seedance-api',
    )

    expect(
      useProjectStore
        .getState()
        .activeProject?.nodes.find(({ id }) => id === 'video'),
    ).toMatchObject({
      modelProviderId: 'seedance-api',
      generationConfig: {
        targetKind: 'video',
        providerId: 'seedance-api',
        parameters: {
          aspectRatio: 'Auto',
          duration: '5',
          quality: '720P',
          sound: true,
          count: '1',
          autoLink: true,
        },
      },
    })

    const generate = latestFlowProps?.nodes.find(({ id }) => id === 'video')
      ?.data.onLocalVideoGenerate as ((prompt: string) => void) | undefined
    act(() => generate?.('雨夜霓虹街道，摄影机缓慢向前推进'))
    await waitFor(() => expect(start).toHaveBeenCalledOnce())
    expect(start.mock.calls[0]?.[0]).toMatchObject({
      nodeId: 'video',
      targetKind: 'video',
      providerId: 'seedance-api',
      parameters: {
        aspectRatio: 'Auto',
        duration: '5',
        quality: '720P',
        sound: true,
        count: '1',
        autoLink: true,
      },
    })
  })

  test('upgrades a retired video provider to the current default before editing parameters', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.nodes = project.nodes.map((node) =>
      node.id === 'video'
        ? {
            ...node,
            modelProviderId: 'mock-kling-21',
            generationConfig: {
              targetKind: 'video',
              providerId: 'mock-kling-21',
              parameters: { duration: '5', generationMode: '图生视频' },
              referenceAssets: [],
            },
          }
        : node,
    )
    act(() => activate(project))
    renderCanvas()

    await user.click(screen.getByRole('button', { name: '视频片段' }))
    const panel = screen.getByRole('region', { name: '视频片段 生成参数' })
    expect(within(panel).getByRole('combobox', { name: '模型' })).toHaveValue(
      'seedance-api',
    )
    expect(
      within(panel).queryByRole('option', { name: /Kling 2\.1/ }),
    ).not.toBeInTheDocument()

    const updateParameters = latestFlowProps?.nodes.find(({ id }) => id === 'video')
      ?.data.onUpdateVideoGenerationParameters as
      | ((parameters: { duration: string }) => void)
      | undefined
    act(() => updateParameters?.({ duration: '10' }))

    expect(
      useProjectStore
        .getState()
        .activeProject?.nodes.find(({ id }) => id === 'video'),
    ).toMatchObject({
      modelProviderId: 'seedance-api',
      generationConfig: {
        providerId: 'seedance-api',
        parameters: { duration: '10' },
      },
    })
  })

  test('does not run Enter generation when the selected node has neither prompt nor media', async () => {
    const project = makeCanvasProject()
    const blankImage: Project['nodes'][number] = {
      ...project.nodes[0],
      id: 'blank-image',
      kind: 'image',
      title: '空白图片',
      position: { x: 1600, y: 200 },
      versions: [
        {
          id: 'blank-image-version',
          createdAt: project.createdAt,
          prompt: '',
        },
      ],
      activeVersionId: 'blank-image-version',
      imageGeneration: {
        prompt: '',
        pValue: '',
        stylization: 150,
        weirdness: 50,
        diversity: 5,
        editStrength: 0.6,
        autoLink: true,
        quality: '标准画质',
        resolution: '2K',
        aspectRatio: '16:9',
        customWidth: 2048,
        customHeight: 2048,
        count: 1,
      },
    }
    activate({ ...project, nodes: [...project.nodes, blankImage] })
    const user = userEvent.setup()
    renderCanvas()
    await user.click(screen.getByRole('button', { name: '空白图片' }))
    const canvas = screen.getByRole('region', { name: '项目画布' })
    canvas.focus()
    const jobsBefore = useProjectStore.getState().activeProject?.jobs

    await user.keyboard('{Enter}')

    expect(useProjectStore.getState().activeProject?.jobs).toBe(jobsBefore)
    expect(screen.queryByText(/空白图片.*预计成本/)).not.toBeInTheDocument()
    expect(
      screen.getByText('请输入提示词或添加参考媒体后再生成。'),
    ).toBeVisible()
  })

  test('persists the live Seedance model and keeps all-reference mode available', async () => {
    const user = userEvent.setup()
    const start = vi.fn<GenerationAdapter['start']>().mockImplementation(
      () => new Promise(() => undefined),
    )
    const providerRegistry = createDefaultProviderRegistry({
      seedanceVideo: seedanceVideoConfigFixture,
    })
    renderCanvas({
      repository: noOpCanvasRepository,
      generationAdapter: { start },
      providerRegistry,
    })

    await user.click(screen.getByRole('button', { name: '视频片段' }))
    const panel = screen.getByRole('region', { name: '视频片段 生成参数' })
    expect(within(panel).getByLabelText('生成模式')).toHaveValue('全能参考')

    await user.selectOptions(
      within(panel).getByLabelText('模型'),
      'seedance-api',
    )

    expect(within(panel).getByLabelText('生成模式')).toHaveValue('全能参考')
    expect(
      useProjectStore
        .getState()
        .activeProject?.nodes.find(({ id }) => id === 'video'),
    ).toMatchObject({
      modelProviderId: 'seedance-api',
      generationConfig: {
        providerId: 'seedance-api',
        parameters: { generationMode: '全能参考' },
      },
    })

    await user.click(
      within(panel).getByRole('button', { name: '生成视频，预计成本 135' }),
    )
    await waitFor(() => expect(start).toHaveBeenCalledOnce())
    expect(screen.getByText(/Seedance 2.0生成中/)).toBeVisible()
    expect(start.mock.calls[0]?.[0]).toMatchObject({
      providerId: 'seedance-api',
      parameters: { generationMode: '全能参考' },
      referenceAssets: [expect.objectContaining({ kind: 'image' })],
    })
  })

  test('rejects an explicit generate action when the node has no prompt or media', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.nodes = project.nodes.map((node) =>
      node.id === 'video'
        ? {
            ...node,
            versions: node.versions.map((version) => ({
              ...version,
              prompt: '',
              assetId: undefined,
            })),
            generationConfig: {
              targetKind: 'video',
              providerId: 'seedance-api',
              parameters: { generationMode: '文生视频' },
              referenceAssets: [],
            },
          }
        : node,
    )
    act(() => activate(project))
    const start = vi.fn<GenerationAdapter['start']>().mockImplementation(
      () => new Promise(() => undefined),
    )
    renderCanvas({
      repository: noOpCanvasRepository,
      generationAdapter: { start },
    })

    await user.click(screen.getByRole('button', { name: '视频片段' }))
    await user.click(
      screen.getByRole('button', { name: '生成视频，预计成本 135' }),
    )

    expect(start).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(
      '请输入提示词或添加参考素材后再生成',
    )
  })

  test('duplicates selected nodes at the Option-drag drop position without moving originals', () => {
    renderCanvas()
    const character = latestFlowProps!.nodes.find(({ id }) => id === 'character')!
    act(() => {
      latestFlowProps?.onNodesChange([
        { type: 'select', id: 'character', selected: true },
      ])
      latestFlowProps?.onNodeDragStart?.(
        new MouseEvent('mousedown', { altKey: true }),
        character,
      )
      latestFlowProps?.onNodesChange([
        {
          type: 'position',
          id: 'character',
          position: { x: 280, y: 200 },
          dragging: true,
        },
        {
          type: 'position',
          id: 'character',
          position: { x: 280, y: 200 },
          dragging: false,
        },
      ])
      latestFlowProps?.onNodeDragStop?.(
        new MouseEvent('mouseup', { altKey: true }),
        { ...character, position: { x: 280, y: 200 } },
      )
    })

    const project = useProjectStore.getState().activeProject!
    expect(project.nodes.find(({ id }) => id === 'character')?.position).toEqual({
      x: 80,
      y: 80,
    })
    expect(project.nodes).toContainEqual(
      expect.objectContaining({
        title: '角色参考 副本',
        position: { x: 280, y: 200 },
      }),
    )
    expect(useProjectStore.getState().past).toHaveLength(1)
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

  test('switches from connection selection to context creation without stale state', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow()
    const connect = screen.getByRole('button', { name: '连线' })

    await user.click(connect)
    await user.click(screen.getByRole('button', { name: '角色参考' }))
    expect(screen.getByRole('status')).toHaveTextContent('请选择目标节点')
    chooseContextNode('文本')

    expect(useProjectStore.getState().activeProject?.nodes.at(-1)).toMatchObject({
      kind: 'text',
      position: { x: 777, y: 333 },
    })
    expect(connect).toHaveAttribute('aria-pressed', 'false')
    expect(useProjectStore.getState().past).toHaveLength(1)
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
    expect(connect).toHaveAttribute('aria-pressed', 'false')
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
      panOnDrag: [1, 2],
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

  test('keeps native connection handle hit areas screen-sized across canvas zoom', () => {
    renderCanvas()

    expect(latestFlowProps?.style).toHaveProperty(
      '--canvas-handle-hit-size',
      '24px',
    )

    act(() => {
      latestFlowProps?.onMove?.({}, { x: 0, y: 0, zoom: 0.35 })
    })

    expect(latestFlowProps?.style).toHaveProperty(
      '--canvas-handle-hit-size',
      `${24 / 0.35}px`,
    )
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
    expect(screen.getAllByRole('toolbar', { name: '图片主操作' })).toHaveLength(1)

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

  test('groups selected nodes, restores the group selection, and ungroups through the toolbar', async () => {
    const user = userEvent.setup()
    renderCanvas()

    expect(screen.getByRole('button', { name: '分组' })).toBeDisabled()
    act(() => {
      latestFlowProps?.onNodesChange([
        { id: 'character', type: 'select', selected: true },
        { id: 'scene', type: 'select', selected: true },
      ])
    })

    const selectionOverlay = screen.getByRole('group', {
      name: '节点组合：已选 2 个节点',
    })
    expect(selectionOverlay).toBeVisible()
    const selectionToolbar = screen.getByRole('toolbar', {
      name: '已选 2 个节点 组合操作',
    })
    for (const action of [
      '排列',
      '保存到资产',
      '创建副本',
      '复制',
      '打组',
      '添加到 Chat',
    ]) {
      expect(
        within(selectionToolbar).getByRole('button', { name: action }),
      ).toBeVisible()
    }
    expect(useProjectStore.getState().activeProject?.groups ?? []).toEqual([])

    await user.click(within(selectionToolbar).getByRole('button', { name: '打组' }))
    expect(useProjectStore.getState().activeProject?.groups).toEqual([
      expect.objectContaining({ title: '分组 01', nodeIds: ['character', 'scene'] }),
    ])
    const groupOverlay = screen.getByRole('group', { name: '节点分组：分组 01' })
    expect(groupOverlay).toBeVisible()
    expect(groupOverlay).toHaveStyle({ left: '48px', top: '26px' })
    expect(useProjectStore.getState().past).toHaveLength(1)

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
    expect(groupOverlay).toHaveStyle({ left: '128px', top: '66px' })

    act(() => {
      latestFlowProps?.onNodesChange([
        { id: 'character', type: 'select', selected: false },
        { id: 'scene', type: 'select', selected: false },
      ])
    })
    await user.click(screen.getByRole('button', { name: '选择分组：分组 01' }))
    expect(latestFlowProps?.nodes.filter(({ selected }) => selected).map(({ id }) => id)).toEqual([
      'character',
      'scene',
    ])

    await user.click(screen.getByRole('button', { name: '取消分组' }))
    expect(useProjectStore.getState().activeProject?.groups).toEqual([])
    expect(useProjectStore.getState().past).toHaveLength(2)
    act(() => useProjectStore.getState().undo())
    expect(useProjectStore.getState().activeProject?.groups).toHaveLength(1)
    act(() => useProjectStore.getState().redo())
    expect(useProjectStore.getState().activeProject?.groups).toEqual([])
  })

  test('executes a selected group in dependency order and collapses results to one undo', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.groups = [{
      id: 'group-batch',
      title: '分组 01',
      kind: 'standard',
      nodeIds: ['character', 'scene'],
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }]
    activate(project)
    const order: string[] = []
    let resultNumber = 0
    const start = vi.fn<GenerationAdapter['start']>(async (request) => {
      order.push(request.nodeId)
      resultNumber += 1
      const assetId = `batch-asset-${resultNumber}`
      return {
        asset: { id: assetId, kind: 'image', url: `/batch/${resultNumber}.png`, mimeType: 'image/png' },
        version: {
          id: `batch-version-${resultNumber}`,
          createdAt: new Date().toISOString(),
          prompt: request.prompt,
          assetId,
        },
      }
    })
    renderCanvas({ repository: noOpCanvasRepository, generationAdapter: { start } })

    await user.click(screen.getByRole('button', { name: '选择分组：分组 01' }))
    await user.click(screen.getByRole('button', { name: '整组执行' }))
    const status = screen.getByLabelText('工作流整组执行状态')
    await waitFor(() => expect(status).toHaveAttribute('data-status', 'completed'))
    expect(order).toEqual(['character', 'scene'])
    expect(useProjectStore.getState().past).toHaveLength(1)

    act(() => useProjectStore.getState().undo())
    expect(
      useProjectStore.getState().activeProject?.nodes
        .filter(({ id }) => id === 'character' || id === 'scene')
        .every(({ versions }) => versions.length === 1),
    ).toBe(true)
  })

  test('pauses a failed group execution and retries the current queued job', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.groups = [{
      id: 'group-retry',
      title: '分组 02',
      kind: 'standard',
      nodeIds: ['character', 'scene'],
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }]
    activate(project)
    let sceneAttempts = 0
    let resultNumber = 0
    const start = vi.fn<GenerationAdapter['start']>(async (request) => {
      if (request.nodeId === 'scene' && sceneAttempts++ === 0) {
        throw new Error('演示供应商暂时失败')
      }
      resultNumber += 1
      const assetId = `retry-asset-${resultNumber}`
      return {
        asset: { id: assetId, kind: 'image', url: `/retry/${resultNumber}.png`, mimeType: 'image/png' },
        version: {
          id: `retry-version-${resultNumber}`,
          createdAt: new Date().toISOString(),
          prompt: request.prompt,
          assetId,
        },
      }
    })
    renderCanvas({ repository: noOpCanvasRepository, generationAdapter: { start } })

    await user.click(screen.getByRole('button', { name: '选择分组：分组 02' }))
    await user.click(screen.getByRole('button', { name: '整组执行' }))
    const status = screen.getByLabelText('工作流整组执行状态')
    await waitFor(() => expect(status).toHaveAttribute('data-status', 'paused'))
    expect(status).toHaveTextContent('演示供应商暂时失败')
    await user.click(within(status).getByRole('button', { name: '重试当前节点' }))
    await waitFor(() => expect(status).toHaveAttribute('data-status', 'completed'))
    expect(sceneAttempts).toBe(2)
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

    expect(screen.queryByRole('toolbar', { name: '创作工具' })).not.toBeInTheDocument()
    const toolbar = screen.getByRole('toolbar', { name: '画布模式工具' })
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      '添加节点',
      '移动',
      '连线',
      '打开工具箱',
      '资产管理',
      '素材库',
      '角色库',
      '历史记录',
      '快捷键',
      '教程',
      '分组',
      '隐藏连线',
    ])
    expect(within(toolbar).getByRole('group', { name: '无线画布工具坞' })).toBeVisible()
  })

  test('opens the tutorial drawer from the canvas dock', async () => {
    const user = userEvent.setup()
    renderCanvas()

    await user.click(screen.getByRole('button', { name: '教程' }))

    const drawer = screen.getByRole('complementary', { name: '教程' })
    expect(within(drawer).getByRole('heading', { name: '入门' })).toBeVisible()
    expect(within(drawer).getByRole('link', { name: '查看完整教程' })).toHaveAttribute(
      'href',
      '/tutorials',
    )
  })

  test('drops a reusable local subject at the pointer position', async () => {
    const subject = {
      id: 'subject-shared',
      name: '跨项目旅人',
      description: '深色风衣',
      tags: ['主角'],
      coverUrl: 'data:image/png;base64,subject',
      sampleImages: ['data:image/png;base64,subject'],
      sourceProjectId: 'another-project',
      createdAt: '2026-08-27T08:00:00.000Z',
      updatedAt: '2026-08-27T08:00:00.000Z',
    }
    renderCanvas({
      repository: noOpCanvasRepository,
      subjectRepository: {
        create: vi.fn(),
        get: vi.fn(async () => subject),
        list: vi.fn(async () => [subject]),
        update: vi.fn(),
        delete: vi.fn(),
      },
    })
    initializeFlow({ x: 612, y: 428 })

    act(() => latestFlowProps?.onDrop?.({
      clientX: 500,
      clientY: 360,
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => 'subject-shared' },
    }))

    await waitFor(() => expect(
      useProjectStore.getState().activeProject?.nodes.at(-1),
    ).toMatchObject({
      title: '跨项目旅人',
      kind: 'character',
      subjectId: 'subject-shared',
      position: { x: 612, y: 428 },
    }))
  })

  test('opens the blank-canvas context menu and returns focus after Escape', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow()
    const canvas = screen.getByRole('region', { name: '项目画布' })

    expect(contextMenuPane()).toHaveBeenCalledOnce()
    expect(screen.getByRole('menu', { name: '画布快捷菜单' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: '上传' })).toHaveFocus()
    expect(screen.getByRole('menuitem', { name: '保存到我的资产' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: '添加节点' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: '粘贴' })).toBeDisabled()
    expect(screen.queryByRole('menuitem', { name: '添加资源' })).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: '画布快捷菜单' })).not.toBeInTheDocument()
    await waitFor(() => expect(canvas).toHaveFocus())
  })

  test('opens generation history from the add-node dock and inserts one completed result at the canvas point', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow({ x: 688, y: 412 })
    await user.click(screen.getByRole('button', { name: '添加节点' }))
    const addMenu = screen.getByRole('menu', { name: '添加节点' })
    await user.click(within(addMenu).getByRole('menuitem', { name: '从生成历史选择' }))

    const history = screen.getByRole('complementary', { name: '历史' })
    await user.click(
      within(history).getByRole('button', { name: '使用 分镜 02' }),
    )

    expect(useProjectStore.getState().activeProject?.nodes.at(-1)).toMatchObject({
      kind: 'image',
      position: { x: 688, y: 412 },
      versions: [{ prompt: '分镜 02 创作描述', assetId: 'asset-shot' }],
    })
    expect(useProjectStore.getState().past).toHaveLength(1)
    expect(screen.queryByRole('complementary', { name: '历史' })).not.toBeInTheDocument()
  })

  test('keeps upload and generation history functional from the double-click menu', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow({ x: 612, y: 428 })

    doubleClickPane(420, 300)
    let picker = screen.getByRole('dialog', { name: '选择节点类型' })
    await user.click(within(picker).getByRole('button', { name: '上传' }))
    await user.upload(
      screen.getByLabelText('上传画布素材'),
      new File(['image'], 'double-click.png', { type: 'image/png' }),
    )
    await waitFor(() => {
      expect(useProjectStore.getState().activeProject?.nodes.at(-1)).toMatchObject({
        kind: 'image',
        title: 'double-click.png',
        position: { x: 612, y: 428 },
      })
    })

    doubleClickPane(460, 340)
    picker = screen.getByRole('dialog', { name: '选择节点类型' })
    await user.click(
      within(picker).getByRole('button', { name: '从生成历史选择' }),
    )
    const history = screen.getByRole('complementary', { name: '历史' })
    await user.click(within(history).getByRole('button', { name: '使用 分镜 02' }))
    expect(useProjectStore.getState().activeProject?.nodes.at(-1)).toMatchObject({
      kind: 'image',
      position: { x: 612, y: 428 },
      versions: [{ prompt: '分镜 02 创作描述', assetId: 'asset-shot' }],
    })
  })

  test('prefills a new canvas node from the complete history config and resends only after confirmation', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.jobs = project.jobs.map((job) => ({
      ...job,
      generationConfig: {
        targetKind: 'image' as const,
        providerId: 'seedream-5-pro-api',
        parameters: { aspectRatio: '16:9', resolution: '1920×1080' },
        referenceAssets: [{
          url: '/demo/character-lin-yuan.png',
          kind: 'image' as const,
          mimeType: 'image/png',
        }],
      },
      providerId: 'seedream-5-pro-api',
      providerName: '火山方舟',
      modelName: 'MJ 风格图片',
    }))
    activate(project)
    const start = vi.fn(
      (_request: Parameters<GenerationAdapter['start']>[0], signal: AbortSignal) =>
        new Promise<GenerationResult>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('cancelled', 'AbortError')),
            { once: true },
          )
        }),
    )
    renderCanvas({
      repository: noOpCanvasRepository,
      generationAdapter: { start },
    })

    await user.click(screen.getByRole('button', { name: '历史记录' }))
    const history = screen.getByRole('complementary', { name: '历史' })
    await user.click(
      within(history).getByRole('button', { name: '重发画布 分镜 02' }),
    )
    expect(start).not.toHaveBeenCalled()
    const confirmation = screen.getByRole('dialog', { name: '重发画布配置' })
    expect(confirmation).toHaveTextContent('aspectRatio：16:9')
    expect(confirmation).toHaveTextContent('引用 1 项')
    await user.click(
      within(confirmation).getByRole('button', { name: '确认重新生成' }),
    )

    await waitFor(() => expect(start).toHaveBeenCalledOnce())
    expect(start.mock.calls[0][0]).toMatchObject({
      projectId: project.id,
      operation: 'regenerate',
      targetKind: 'image',
      providerId: 'seedream-5-pro-api',
      prompt: '分镜 02 创作描述',
      parameters: { aspectRatio: '16:9', resolution: '1920×1080' },
      referenceAssets: [{ url: '/demo/character-lin-yuan.png' }],
    })
    const resentNode = useProjectStore.getState().activeProject?.nodes.at(-1)
    expect(resentNode).toMatchObject({
      kind: 'image',
      title: '分镜 02 重发',
      modelProviderId: 'seedream-5-pro-api',
      generationConfig: {
        targetKind: 'image',
        parameters: { aspectRatio: '16:9', resolution: '1920×1080' },
        referenceAssets: [{ url: '/demo/character-lin-yuan.png' }],
      },
      versions: [{ prompt: '分镜 02 创作描述' }],
    })
  })

  test('chooses a free-generation type and creates it at the double-click point', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const { screenToFlowPosition } = initializeFlow({ x: 640, y: 360 })

    doubleClickPane(500, 320)
    expect(screen.getByRole('dialog', { name: '选择节点类型' })).toBeVisible()
    expect(screenToFlowPosition).toHaveBeenCalledWith({ x: 500, y: 320 })
    await user.click(screen.getByRole('button', { name: '文本' }))

    expect(useProjectStore.getState().activeProject?.nodes.at(-1)).toMatchObject({
      kind: 'text',
      position: { x: 640, y: 360 },
      versions: [{ prompt: '双击画布创建的自由文本节点' }],
      details: {
        type: 'text',
        content: '双击画布创建的自由文本节点',
        fontStyle: '正文',
      },
    })
    expect(useProjectStore.getState().past).toHaveLength(1)
  })

  test('maps Liblib quick types onto existing undoable node models', () => {
    renderCanvas()
    initializeFlow({ x: 580, y: 410 })

    const cases = [
      { button: '故事脚本生成', kind: 'script', title: '故事脚本' },
      { button: '角色三视图', kind: 'character-card', title: '角色三视图' },
      { button: '全能参考生视频 SD2.5', kind: 'video', title: '全能参考生视频' },
      { button: '音频生视频 SD2.5', kind: 'video', title: '音频生视频' },
      { button: '世界观卡', kind: 'worldview', title: '世界观卡' },
    ] as const

    for (const item of cases) {
      doubleClickPane(500, 320)
      chooseFreeNode(item.button)
      expect(useProjectStore.getState().activeProject?.nodes.at(-1)).toMatchObject({
        kind: item.kind,
        title: expect.stringContaining(item.title),
        position: { x: 580, y: 410 },
      })
    }

    expect(useProjectStore.getState().past).toHaveLength(cases.length)
  })

  test('creates all nine context node types directly at the converted menu point', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow({ x: 520, y: 340 })

    const cases = [
      ['文本', 'text', '文本', 'text'],
      ['图片', 'image', '图片', undefined],
      ['视频', 'video', '视频', undefined],
      ['智能剪辑 Beta', 'video', '智能剪辑', 'smart-edit'],
      ['导演台 NEW', 'script', '导演台', 'director'],
      ['逐帧拉片 SD2.5', 'storyboard', '逐帧拉片', 'frame-analysis'],
      ['音频', 'text', '音频', 'audio'],
      ['脚本', 'script', '脚本', 'script'],
      ['素材库', 'image', '素材库', undefined],
    ] as const

    for (const [label, kind, title, detailType] of cases) {
      contextMenuPane(440, 300)
      await user.click(screen.getByRole('menuitem', { name: '添加节点' }))
      await user.click(screen.getByRole('menuitem', { name: label }))
      expect(useProjectStore.getState().activeProject?.nodes.at(-1)).toMatchObject({
        kind,
        title: expect.stringContaining(title),
        position: { x: 520, y: 340 },
      })
      expect(useProjectStore.getState().activeProject?.nodes.at(-1)?.details?.type).toBe(detailType)
      expect(screen.queryByRole('menu', { name: '画布快捷菜单' })).not.toBeInTheDocument()
    }

    const frameAnalysis = useProjectStore
      .getState()
      .activeProject?.nodes.find(({ title }) => title.startsWith('逐帧拉片'))
    expect(frameAnalysis?.videoTool).toEqual({
      kind: 'frame-analysis',
      model: 'SD2.5',
      dimensions: ['分镜', '动态', '音乐'],
    })
    expect(useProjectStore.getState().past).toHaveLength(cases.length)
  })

  test('shows the recorded node menu actions and restores node focus after Escape', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow()
    const character = screen.getByRole('button', { name: '角色参考' })
    const node = latestFlowProps!.nodes.find(({ id }) => id === 'character')!

    act(() => latestFlowProps?.onNodeContextMenu?.({
      clientX: 300,
      clientY: 240,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: character,
    }, node))

    expect(screen.getByRole('menuitem', { name: '合规校验' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: '创建主体' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: '复制' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: '创建副本' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: '保存到我的资产' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: '粘贴' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: '复制到剪贴板' })).toBeVisible()
    expect(screen.queryByRole('menuitem', { name: '上传' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(character).toHaveFocus())
  })

  test('executes node compliance, copy, paste, duplicate, subject and system-copy commands', async () => {
    const user = userEvent.setup()
    const createSubject = vi.fn(async (input) => ({
      ...input,
      id: 'subject-character',
      createdAt: '2026-08-27T08:00:00.000Z',
      updatedAt: '2026-08-27T08:00:00.000Z',
    }))
    renderCanvas({
      repository: noOpCanvasRepository,
      subjectRepository: {
        create: createSubject,
        get: vi.fn(async () => undefined),
        list: vi.fn(async () => []),
        update: vi.fn(),
        delete: vi.fn(),
      },
    })
    initializeFlow({ x: 820, y: 460 })
    const initialCount = useProjectStore.getState().activeProject!.nodes.length

    contextMenuNode('character')
    await user.click(screen.getByRole('menuitem', { name: '合规校验' }))
    expect(screen.getByText('“角色参考”已通过本地演示合规校验。')).toBeVisible()

    contextMenuNode('character')
    await user.click(screen.getByRole('menuitem', { name: '复制' }))
    contextMenuPane(620, 380)
    const paste = screen.getByRole('menuitem', { name: '粘贴' })
    expect(paste).toBeEnabled()
    await user.click(paste)
    expect(useProjectStore.getState().activeProject!.nodes).toHaveLength(initialCount + 1)

    contextMenuNode('character')
    await user.click(screen.getByRole('menuitem', { name: '创建副本' }))
    expect(useProjectStore.getState().activeProject!.nodes).toHaveLength(initialCount + 2)

    contextMenuNode('character')
    await user.click(screen.getByRole('menuitem', { name: '创建主体' }))
    const subjectDialog = screen.getByRole('dialog', { name: '创建本地主体' })
    await user.clear(within(subjectDialog).getByLabelText('主体名称'))
    await user.type(within(subjectDialog).getByLabelText('主体名称'), '林渊主体')
    await user.click(within(subjectDialog).getByRole('button', { name: '保存到主体库' }))
    await waitFor(() => expect(createSubject).toHaveBeenCalledWith(expect.objectContaining({
      name: '林渊主体',
      sourceAssetId: 'asset-character',
      sourceProjectId: 'project-canvas',
    })))
    expect(screen.getByText('主体“林渊主体”已保存，可跨项目复用。')).toBeVisible()

    contextMenuNode('character')
    await user.click(screen.getByRole('menuitem', { name: '复制到剪贴板' }))
    expect(screen.getByText('已将“角色参考”的 JSON 复制到剪贴板。')).toBeVisible()
  })

  test.each([
    [
      '故事脚本生成',
      '故事脚本',
      '编辑剧本卡',
      [['分场', '场一：雨夜河岸'], ['对白', '林渊：你终于来了。'], ['镜头备注', '远景缓慢推近']],
      'script',
    ],
    [
      '角色三视图',
      '角色三视图',
      '编辑角色卡',
      [['姓名', '林渊'], ['外貌锚点', '短发，右眼下有小痣'], ['服化道', '深灰长风衣'], ['关系', '林舟的姐姐']],
      'character-card',
    ],
    [
      '世界观卡',
      '世界观卡',
      '编辑世界观卡',
      [['背景', '雨季淹城三天'], ['美术风格', '低饱和蓝绿胶片'], ['规则', '铜铃后不直呼失踪者姓名']],
      'worldview',
    ],
  ] as const)(
    'creates and edits a structured %s with exact persisted fields',
    async (toolLabel, titlePrefix, dialogName, fields, kind) => {
      const user = userEvent.setup()
      renderCanvas({
        repository: noOpCanvasRepository,
        libraryRepository: { list: vi.fn().mockResolvedValue([]) },
      })
      initializeFlow({ x: 360, y: 280 })

      doubleClickPane(360, 280)
      chooseFreeNode(toolLabel)
      const created = useProjectStore.getState().activeProject?.nodes.at(-1)
      expect(created).toMatchObject({ kind, position: { x: 360, y: 280 } })
      await user.click(
        screen.getByRole('button', { name: new RegExp(`^${titlePrefix}`) }),
      )
      await user.click(screen.getByRole('button', { name: '编辑卡片' }))
      expect(screen.getByRole('dialog', { name: dialogName })).toBeVisible()
      for (const [label, value] of fields) {
        await user.clear(screen.getByLabelText(label))
        await user.type(screen.getByLabelText(label), value)
      }
      await user.click(screen.getByRole('button', { name: '确认保存' }))

      const edited = useProjectStore.getState().activeProject?.nodes.at(-1)
      expect(edited?.card).toBeDefined()
      expect(edited?.versions).toHaveLength(2)
      expect(useProjectStore.getState().past).toHaveLength(2)
    },
  )

  test('references one library image, edits from the node, and restores focus with undo and redo', async () => {
    const user = userEvent.setup()
    const imageRecord: LibraryAssetRecord = {
      id: 'library-card-image',
      name: '潮汐城参考.png',
      kind: 'image',
      mimeType: 'image/png',
      url: 'data:image/png;base64,AA==',
      createdAt: '2026-08-13T08:00:00.000Z',
      source: 'upload',
    }
    renderCanvas({
      repository: noOpCanvasRepository,
      libraryRepository: { list: vi.fn().mockResolvedValue([imageRecord]) },
    })
    initializeFlow({ x: 480, y: 320 })

    doubleClickPane(480, 320)
    chooseFreeNode('世界观卡')
    await user.click(screen.getByRole('button', { name: /^世界观卡/ }))
    await user.click(screen.getByRole('button', { name: '编辑卡片' }))
    await user.clear(screen.getByLabelText('标题'))
    await user.type(screen.getByLabelText('标题'), '潮汐城世界观')
    await user.type(screen.getByLabelText('背景'), '雨季淹城三天')
    await user.type(screen.getByLabelText('美术风格'), '低饱和蓝绿胶片')
    await user.selectOptions(screen.getByLabelText('引用图片素材'), imageRecord.id)
    await user.click(screen.getByRole('button', { name: '确认保存' }))

    const created = useProjectStore.getState().activeProject?.nodes.at(-1)
    expect(created?.card).toMatchObject({
      kind: 'worldview',
      imageAssetId: imageRecord.id,
    })
    expect(
      useProjectStore.getState().activeProject?.assets.filter(
        ({ id }) => id === imageRecord.id,
      ),
    ).toHaveLength(1)

    const cardButton = await screen.findByRole('button', {
      name: '潮汐城世界观',
    })
    await user.click(cardButton)
    const editTrigger = screen.getByRole('button', { name: '编辑卡片' })
    await user.click(editTrigger)
    expect(screen.getByRole('dialog', { name: '编辑世界观卡' })).toBeVisible()
    await user.clear(screen.getByLabelText('规则'))
    await user.type(screen.getByLabelText('规则'), '铜铃后不得直呼失踪者姓名')
    await user.click(screen.getByRole('button', { name: '确认保存' }))

    const edited = useProjectStore.getState().activeProject?.nodes.at(-1)
    expect(edited?.card).toMatchObject({
      rules: '铜铃后不得直呼失踪者姓名',
      imageAssetId: imageRecord.id,
    })
    expect(edited?.versions).toHaveLength(3)
    expect(
      useProjectStore.getState().activeProject?.assets.filter(
        ({ id }) => id === imageRecord.id,
      ),
    ).toHaveLength(1)
    await waitFor(() => expect(editTrigger).toHaveFocus())

    act(() => useProjectStore.getState().undo())
    expect(useProjectStore.getState().activeProject?.nodes.at(-1)?.versions).toHaveLength(2)
    act(() => useProjectStore.getState().redo())
    expect(useProjectStore.getState().activeProject?.nodes.at(-1)?.versions).toHaveLength(3)
  })

  test('edits a card from the node list and falls back to the canvas node for focus', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    project.nodes.push({
      id: 'script-card',
      kind: 'script',
      title: '雨夜剧本',
      position: { x: 1600, y: 720 },
      versions: [{
        id: 'script-version',
        createdAt: project.createdAt,
        prompt: '分场：场一',
      }],
      activeVersionId: 'script-version',
      sourceChanged: false,
      card: { kind: 'script', scenes: '场一', dialogue: '', shotNotes: '' },
    })
    activate(project)
    renderCanvas({
      repository: noOpCanvasRepository,
      libraryRepository: { list: vi.fn().mockResolvedValue([]) },
    })

    await user.click(screen.getByRole('button', { name: '节点列表' }))
    await user.click(screen.getByRole('button', { name: '编辑卡片 雨夜剧本' }))
    expect(screen.queryByRole('dialog', { name: '节点列表' })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('对白'), '林渊：你来了。')
    await user.click(screen.getByRole('button', { name: '确认保存' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '雨夜剧本' })).toHaveFocus(),
    )
  })

  test('creates nodes from the context menu at the converted pane position', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    renderCanvas({ repository: { load: async () => undefined, save } })
    const { screenToFlowPosition } = initializeFlow()
    chooseContextNode('逐帧拉片 SD2.5')

    expect(screenToFlowPosition).toHaveBeenCalledWith({ x: 420, y: 300 })

    const created = useProjectStore
      .getState()
      .activeProject?.nodes.find(({ title }) => title.startsWith('逐帧拉片'))
    expect(created).toMatchObject({
      kind: 'storyboard',
      position: { x: 777, y: 333 },
      versions: [{ prompt: 'SD2.5 · 分镜 / 动态 / 音乐' }],
    })
    expect(useProjectStore.getState().past).toHaveLength(1)
    expect(screen.queryByRole('menu', { name: '画布快捷菜单' })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^逐帧拉片/ })).toHaveFocus()
    })
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][0].nodes.at(-1)?.id).toBe(created?.id)
  })

  test.each([
    ['text', '文本', '右键画布创建的文本节点'],
    ['video', '视频', '等待补充视频生成提示'],
    ['video', '智能剪辑 Beta', 'Beta 智能剪辑：等待导入素材并设置剪辑目标'],
  ] as const)(
    'creates a %s context node with one initial prompt version',
    async (kind, toolLabel, prompt) => {
      renderCanvas()
      initializeFlow({ x: 100, y: 200 })

      chooseContextNode(toolLabel, 160, 220)

      const created = useProjectStore.getState().activeProject?.nodes.at(-1)
      expect(created?.kind).toBe(kind)
      expect(created?.versions).toHaveLength(1)
      expect(created?.versions[0].prompt).toBe(prompt)
      expect(created?.activeVersionId).toBe(created?.versions[0].id)
    },
  )

  test('creates an image node and asset from the Upload context action', async () => {
    const user = userEvent.setup()
    const save = vi.fn().mockResolvedValue(undefined)
    renderCanvas({ libraryRepository: { list: vi.fn().mockResolvedValue([]), save } })
    initializeFlow({ x: 240, y: 360 })

    chooseContextUpload(240, 360)
    await user.upload(
      screen.getByLabelText('上传画布素材'),
      new File(['image'], 'reference.png', { type: 'image/png' }),
    )

    const active = useProjectStore.getState().activeProject!
    const created = active.nodes.find(({ title }) => title === 'reference.png')!
    const version = created.versions[0]
    const asset = active.assets.find(({ id }) => id === version.assetId)
    expect(created.position).toEqual({ x: 240, y: 360 })
    expect(asset).toMatchObject({
      kind: 'image',
      mimeType: 'image/png',
      url: expect.stringMatching(/^data:image\/png;base64,/),
    })
    expect(useProjectStore.getState().past).toHaveLength(1)
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    expect(save.mock.calls[0][0]).toMatchObject({
      name: 'reference.png',
      kind: 'image',
    })
  })

  test('imports video and audio assets and creates matching playable nodes', async () => {
    const user = userEvent.setup()
    const save = vi.fn().mockResolvedValue(undefined)
    renderCanvas({ libraryRepository: { list: vi.fn().mockResolvedValue([]), save } })
    initializeFlow({ x: 280, y: 380 })

    chooseContextUpload(280, 380)
    await user.upload(
      screen.getByLabelText('上传画布素材'),
      new File(['video'], 'rain.mp4', { type: 'video/mp4' }),
    )
    chooseContextUpload(360, 460)
    await user.upload(
      screen.getByLabelText('上传画布素材'),
      new File(['audio'], 'rain.mp3', { type: 'audio/mpeg' }),
    )

    const active = useProjectStore.getState().activeProject!
    expect(active.nodes.find(({ title }) => title === 'rain.mp4')).toMatchObject({
      kind: 'video',
      position: { x: 280, y: 380 },
    })
    expect(active.nodes.find(({ title }) => title === 'rain.mp3')).toMatchObject({
      kind: 'text',
      position: { x: 280, y: 380 },
      details: { type: 'audio', modelProviderId: 'ark-tts' },
    })
    expect(active.assets.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(['video', 'audio']),
    )
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  })

  test('closes an expanded context submenu without history and returns focus to the canvas', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow()
    const canvas = screen.getByRole('region', { name: '项目画布' })
    contextMenuPane()
    await user.click(screen.getByRole('menuitem', { name: '添加节点' }))
    expect(screen.getByRole('menu', { name: '添加节点子菜单' })).toBeVisible()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu', { name: '画布快捷菜单' })).not.toBeInTheDocument()
    expect(useProjectStore.getState().past).toEqual([])
    expect(useProjectStore.getState().activeProject?.nodes).toHaveLength(5)
    expect(canvas).toHaveFocus()
  })

  test('keeps only one node picker while a second pane double click occurs', () => {
    renderCanvas()
    initializeFlow()

    doubleClickPane()
    const firstDialog = screen.getByRole('dialog', { name: '选择节点类型' })
    act(() => {
      latestFlowProps?.onNodeClick?.({}, latestFlowProps.nodes[0])
    })
    doubleClickPane(900, 640)
    expect(screen.getAllByRole('dialog', { name: '选择节点类型' })).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: '选择节点类型' })).toBe(firstDialog)
  })

  test('recognizes React Flow pointer-up pairs as a pane double click while marquee selection is enabled', () => {
    renderCanvas()
    initializeFlow()

    act(() => {
      latestFlowProps?.onPaneClick?.({ clientX: 420, clientY: 300, detail: 0 })
    })
    expect(
      screen.queryByRole('dialog', { name: '选择节点类型' }),
    ).not.toBeInTheDocument()

    act(() => {
      latestFlowProps?.onPaneClick?.({ clientX: 422, clientY: 302, detail: 0 })
    })
    expect(screen.getByRole('dialog', { name: '选择节点类型' })).toBeVisible()
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
    doubleClickPane()
    expect(screen.getByRole('dialog', { name: '选择节点类型' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '切换到项目 B' }))

    expect(await screen.findByRole('heading', { name: '第二项目' })).toBeVisible()
    expect(screen.queryByRole('dialog', { name: '选择节点类型' })).not.toBeInTheDocument()
    expect(useProjectStore.getState().activeProject?.nodes).toHaveLength(5)
    expect(useProjectStore.getState().past).toEqual([])
  })

  test('places eligible actions before a rightmost selected node to avoid viewport clipping', async () => {
    const user = userEvent.setup()
    const project = makeCanvasProject()
    act(() => activate({
      ...project,
      nodes: project.nodes.map((node) =>
        node.id === 'video' ? { ...node, position: { x: 1600, y: 520 } } : node,
      ),
    }))
    renderCanvas()

    await user.click(screen.getByRole('button', { name: '视频片段' }))

    expect(screen.getByLabelText('视频片段操作')).toHaveAttribute(
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
    expect(screen.getByRole('button', { name: '加入时间线' })).toBeVisible()
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
    initializeFlow()
    await user.click(screen.getByRole('button', { name: '分镜 02' }))

    const deleteTrigger = screen.getByRole('button', { name: '分镜 02' })
    contextMenuNode('storyboard')
    await user.click(screen.getByRole('menuitem', { name: '删除节点' }))
    const dialog = screen.getByRole('dialog', { name: '删除“分镜 02”？' })
    expect(within(dialog).getByText('视频片段')).toBeVisible()
    expect(within(dialog).getByText('成片预览')).toBeVisible()

    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(within(dialog).getByRole('button', { name: '仍要删除' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(useProjectStore.getState().activeProject?.nodes).toHaveLength(5)
    expect(useProjectStore.getState().activeProject?.edges).toHaveLength(4)
    expect(deleteTrigger).toHaveFocus()

    contextMenuNode('storyboard')
    await user.click(screen.getByRole('menuitem', { name: '删除节点' }))
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
    initializeFlow()

    await user.click(screen.getByRole('button', { name: 'Impact 0' }))
    contextMenuNode('impact-0')
    expect(screen.getByRole('menuitem', { name: '删除节点' })).toBeVisible()
    sourceReads = 0
    await user.click(screen.getByRole('menuitem', { name: '删除节点' }))

    expect(
      screen.getByRole('dialog', { name: '删除“Impact 0”？' }),
    ).toHaveTextContent('Impact 79')
    expect(sourceReads).toBeLessThanOrEqual(edges.length * 2)
  })
})

describe('canvas top bar', () => {
  test('hydrates the complete Agent workspace from the current project and provider registry', async () => {
    const user = userEvent.setup()
    renderCanvas()

    await user.click(screen.getByRole('button', { name: '角色参考' }))
    await user.click(screen.getByRole('button', { name: 'Agent' }))
    const agent = screen.getByRole('complementary', { name: 'Agent 工作区' })
    expect(within(agent).getByRole('toolbar', { name: 'Agent 对话工具' })).toBeVisible()
    expect(within(agent).getByRole('combobox', { name: '图片模型' })).toHaveValue('seedream-5-pro-api')
    expect(within(agent).getByRole('combobox', { name: '视频模型' })).toHaveValue('seedance-api')

    await user.click(within(agent).getByRole('button', { name: '添加 @ 引用' }))
    const references = within(agent).getByRole('menu', { name: '可引用的画布上下文' })
    expect(within(references).getByRole('menuitem', { name: '引用工作流 雨夜追寻' })).toBeVisible()
    expect(within(references).getByRole('menuitem', { name: '引用节点 角色参考' })).toBeVisible()
    expect(within(references).getByRole('menuitem', { name: '引用资源 角色参考' })).toBeVisible()
  })

  test('opens the Agent on demand and restores focus after closing it', async () => {
    const user = userEvent.setup()
    renderCanvas()

    const trigger = screen.getByRole('button', { name: 'Agent' })
    expect(trigger).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('complementary', { name: 'Agent 工作区' })).not.toBeInTheDocument()

    await user.click(trigger)
    expect(screen.getByRole('complementary', { name: 'Agent 工作区' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '关闭 Agent' }))
    expect(screen.queryByRole('complementary', { name: 'Agent 工作区' })).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  test('fits the workflow after opening the Agent so selected actions remain reachable', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const { fitView } = initializeFlow()

    await user.click(screen.getByRole('button', { name: 'Agent' }))

    await waitFor(() =>
      expect(fitView).toHaveBeenCalledWith(
        expect.objectContaining({ duration: 220, padding: 0.18 }),
      ),
    )
  })

  test('edits and reorders the shared storyboard before locating its canvas node', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const { fitView } = initializeFlow()

    await user.click(screen.getByRole('button', { name: '故事板' }))
    expect(screen.getByRole('region', { name: '项目故事板' })).toBeVisible()
    expect(screen.queryByRole('toolbar', { name: '创作工具' })).not.toBeInTheDocument()

    const source = screen.getByRole('article', { name: '图片故事板卡 分镜 02' })
    const target = screen.getByRole('article', { name: '图片故事板卡 场景设定' })
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: vi.fn(),
      getData: vi.fn(() => 'storyboard'),
    }
    fireEvent.dragStart(source, { dataTransfer })
    fireEvent.dragOver(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })
    expect(
      useProjectStore.getState().activeProject?.nodes.map(({ id }) => id),
    ).toEqual(['character', 'storyboard', 'scene', 'video', 'preview'])

    const sceneCard = screen.getByRole('article', { name: '图片故事板卡 场景设定' })
    await user.type(within(sceneCard).getByRole('textbox', { name: '场景设定对白' }), '林渊：跟紧我。')
    await user.click(within(sceneCard).getByRole('button', { name: '保存场景设定对白' }))
    expect(
      useProjectStore.getState().activeProject?.nodes.find(({ id }) => id === 'scene')
        ?.storyboardDialogue,
    ).toBe('林渊：跟紧我。')

    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback))
    await user.click(within(sceneCard).getByRole('button', { name: '定位 场景设定' }))
    expect(screen.getByRole('button', { name: '工作流' })).toHaveAttribute('aria-pressed', 'true')
    expect(latestFlowProps?.nodes.find(({ id }) => id === 'scene')?.selected).toBe(true)
    // React Flow must measure the newly visible layer before computing its zoom.
    expect(fitView).not.toHaveBeenCalled()
    act(() => frames.shift()?.(0))
    expect(fitView).not.toHaveBeenCalled()
    act(() => frames.shift()?.(16))
    expect(fitView).toHaveBeenCalledWith(expect.objectContaining({ nodes: [{ id: 'scene' }] }))
  })

  test('opens local workspace resources and persists view preferences outside project history', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow()
    const pastBefore = useProjectStore.getState().past

    await user.click(screen.getByRole('button', { name: '资产管理' }))
    expect(screen.getByRole('complementary', { name: '资产管理' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '快捷键' }))
    expect(screen.queryByRole('complementary', { name: '资产管理' })).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: '快捷键' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '显示小地图' }))
    await user.click(screen.getByRole('button', { name: '开启网格吸附' }))
    expect(screen.getByRole('img', { name: '画布小地图' })).toBeVisible()
    expect(latestFlowProps?.snapToGrid).toBe(true)
    expect(useProjectStore.getState().past).toBe(pastBefore)
    expect(localStorage.getItem('wireless-canvas:workspace-preferences')).toContain('"snapToGrid":true')
  })

  test('inserts configurable effects, managed assets and selected characters from the dock libraries', async () => {
    const user = userEvent.setup()
    renderCanvas()
    initializeFlow({ x: 640, y: 360 })
    const initialCount = useProjectStore.getState().activeProject!.nodes.length

    await user.click(screen.getByRole('button', { name: '打开工具箱' }))
    const toolbox = screen.getByRole('complementary', { name: '工具箱' })
    await user.click(within(toolbox).getByRole('button', { name: '使用极光模板' }))
    const effect = useProjectStore.getState().activeProject!.nodes.at(-1)!
    expect(effect).toMatchObject({
      kind: 'storyboard',
      title: '极光特效',
      position: { x: 640, y: 360 },
      effectTool: {
        templateId: 'aurora',
        intensity: 70,
        color: '#8fffd1',
        direction: '径向',
        blendMode: '滤色',
      },
    })
    const effectSettings = screen.getByRole('region', { name: '极光特效 特效参数' })
    await user.clear(within(effectSettings).getByLabelText('强度'))
    await user.type(within(effectSettings).getByLabelText('强度'), '42')
    expect(
      useProjectStore.getState().activeProject!.nodes.at(-1)?.effectTool?.intensity,
    ).toBe(42)

    await user.click(screen.getByRole('button', { name: '资产管理' }))
    const assets = screen.getByRole('dialog', { name: '资产管理' })
    await user.click(within(assets).getByRole('button', { name: '发送分镜 02到画布' }))
    expect(useProjectStore.getState().activeProject!.nodes.at(-1)).toMatchObject({
      kind: 'image',
      title: '分镜 02',
      position: { x: 640, y: 360 },
    })

    await user.click(screen.getByRole('button', { name: '素材库' }))
    const materials = screen.getByRole('dialog', { name: '素材库' })
    await user.click(within(materials).getByRole('button', { name: '添加风格参考节点' }))
    expect(useProjectStore.getState().activeProject!.nodes.at(-1)).toMatchObject({
      kind: 'image',
      title: '风格参考 01',
      position: { x: 640, y: 360 },
    })
    await user.click(screen.getByRole('button', { name: '素材库' }))
    await user.click(screen.getByRole('button', { name: '添加特效参考节点' }))
    expect(useProjectStore.getState().activeProject!.nodes.at(-1)).toMatchObject({
      kind: 'image',
      title: '特效参考 01',
    })

    await user.click(screen.getByRole('button', { name: '角色库' }))
    const characters = screen.getByRole('dialog', { name: '角色库' })
    await user.selectOptions(within(characters).getByLabelText('性别'), '女')
    await user.selectOptions(within(characters).getByLabelText('时代'), '古代')
    await user.click(within(characters).getByRole('button', { name: '使用程野' }))
    await user.click(within(characters).getByRole('button', { name: '应用 1 个角色到画布' }))
    expect(useProjectStore.getState().activeProject!.nodes.at(-1)).toMatchObject({
      kind: 'character',
      title: '程野',
    })
    expect(useProjectStore.getState().activeProject!.nodes).toHaveLength(initialCount + 5)
    expect(useProjectStore.getState().past.length).toBeGreaterThanOrEqual(5)
  })

  test('keeps a multi-angle draft side-effect free before atomically creating its tool node and edge', async () => {
    const user = userEvent.setup()
    renderCanvas()
    await user.click(screen.getByRole('button', { name: '角色参考' }))
    await user.click(screen.getByRole('button', { name: '多角度' }))

    expect(screen.getByRole('dialog', { name: '多角度编辑器' })).toBeVisible()
    expect(useProjectStore.getState().activeProject?.nodes).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: /^生成$/ }))

    expect(
      useProjectStore.getState().activeProject?.nodes.some(({ title }) => title === '多角度'),
    ).toBe(true)
    expect(
      useProjectStore.getState().activeProject?.edges.some(
        ({ sourceNodeId, targetNodeId }) =>
          sourceNodeId === 'character' &&
          useProjectStore.getState().activeProject?.nodes.find(({ id }) => id === targetNodeId)?.title === '多角度',
      ),
    ).toBe(true)
    expect(useProjectStore.getState().past).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('尚未触发外部生成')
  })

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
