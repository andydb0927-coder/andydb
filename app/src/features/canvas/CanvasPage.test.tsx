import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ComponentType } from 'react'
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Project } from '../project/model'
import { useProjectStore } from '../project/project-store'
import { CanvasPage } from './CanvasPage'
import { sortNodesForList } from './NodeListView'

interface FlowNodeFixture {
  id: string
  type?: string
  selected?: boolean
  data: Record<string, unknown>
}

interface FlowPropsFixture {
  nodes: FlowNodeFixture[]
  nodeTypes: Record<string, ComponentType<Record<string, unknown>>>
  onNodesChange(changes: unknown[]): void
  onConnect(connection: { source: string; target: string }): void
  zoomOnScroll: boolean
  panOnScroll: boolean
  panActivationKeyCode: string
  selectionOnDrag: boolean
  zoomOnDoubleClick: boolean
}

let latestFlowProps: FlowPropsFixture | undefined

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  BaseEdge: () => null,
  Controls: () => null,
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
  ReactFlow: (props: FlowPropsFixture & { 'aria-label'?: string }) => {
    latestFlowProps = props
    return (
      <div role="region" aria-label={props['aria-label']}>
        {props.nodes.map((node) => {
          const Node = props.nodeTypes[node.type ?? 'asset']
          return (
            <Node
              key={node.id}
              id={node.id}
              data={node.data}
              selected={node.selected ?? false}
            />
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

function renderCanvas(
  props: ComponentProps<typeof CanvasPage> = {},
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

beforeEach(() => {
  latestFlowProps = undefined
  act(() => activate())
})

afterEach(() => {
  vi.useRealTimers()
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

    renderCanvas({ repository: { load: async () => project } })

    expect(
      await screen.findByRole('heading', { name: '雨夜追寻' }),
    ).toBeVisible()
    expect(useProjectStore.getState().activeProject?.id).toBe('project-canvas')
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

    renderCanvas({ repository: { load } })

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

    renderCanvas({ repository: { load: async () => undefined } })

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
        <SwitchingCanvas repository={{ load: async () => projectB }} />
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

  test('waits for explicit Execute confirmation before a destructive director command', async () => {
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

    expect(
      useProjectStore.getState().activeProject?.nodes.some((node) => node.id === 'scene'),
    ).toBe(false)
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
      latestFlowProps?.onConnect({ source: 'character', target: 'preview' })
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

  test('offers exactly seven floating creation tools', () => {
    renderCanvas()

    const toolbar = screen.getByRole('toolbar', { name: '创作工具' })
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['选择', '文本', '图片', '分镜', '视频', '连线', '分组'])
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
})

describe('canvas top bar', () => {
  test.each([
    ['saved', '已保存'],
    ['saving', '保存中'],
    ['failed', '保存失败，本地更改已保留'],
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
