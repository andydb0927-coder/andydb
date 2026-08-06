import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ComponentType } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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

beforeEach(() => {
  latestFlowProps = undefined
  act(() => activate())
})

afterEach(() => {
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

    for (const action of ['重生成', '扩展镜头', '生成视频', '加入时间线']) {
      expect(screen.getByRole('button', { name: action })).toBeVisible()
    }
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

    const storyboard = within(listDialog).getByRole('button', { name: /分镜 02/ })
    storyboard.focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: '分镜 02' })).toHaveFocus()
    expect(screen.getByRole('button', { name: '重生成' })).toBeVisible()
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

    await user.click(within(dialog).getByRole('button', { name: '取消' }))
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
