import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { Project } from '../project/model'
import {
  CanvasAgentPanel,
  CanvasStoryboardView,
  CanvasViewControls,
  SelectionContextBar,
  WorkspaceSidePanel,
} from './CanvasWorkspace'

const project: Project = {
  id: 'workspace-project',
  title: '工作台演示',
  intent: '测试画布工作台',
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
  assets: [
    {
      id: 'image-asset',
      kind: 'image',
      url: '/demo/image.png',
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
    },
    {
      id: 'video-asset',
      kind: 'video',
      url: '/demo/video.mp4',
      mimeType: 'video/mp4',
      durationSeconds: 5,
    },
  ],
  nodes: [
    {
      id: 'text-node',
      kind: 'text',
      title: '旁白',
      position: { x: 0, y: 0 },
      versions: [{ id: 'text-v1', createdAt: '2026-08-13T00:00:00.000Z', prompt: '雨夜' }],
      activeVersionId: 'text-v1',
      sourceChanged: false,
    },
    {
      id: 'image-node',
      kind: 'image',
      title: '角色图',
      position: { x: 300, y: 0 },
      versions: [{ id: 'image-v1', createdAt: '2026-08-13T00:01:00.000Z', prompt: '角色', assetId: 'image-asset' }],
      activeVersionId: 'image-v1',
      sourceChanged: false,
    },
    {
      id: 'video-node',
      kind: 'video',
      title: '视频 01',
      position: { x: 600, y: 0 },
      versions: [{ id: 'video-v1', createdAt: '2026-08-13T00:02:00.000Z', prompt: '镜头', assetId: 'video-asset' }],
      activeVersionId: 'video-v1',
      sourceChanged: false,
    },
  ],
  edges: [],
  timeline: [],
  jobs: [
    {
      id: 'job-1',
      projectId: 'workspace-project',
      nodeId: 'video-node',
      status: 'succeeded',
      prompt: '镜头',
      createdAt: '2026-08-13T00:02:00.000Z',
      updatedAt: '2026-08-13T00:03:00.000Z',
    },
  ],
  exportJobs: [],
}

test('groups current project media in the storyboard and returns to its source node', async () => {
  const user = userEvent.setup()
  const onOpenNode = vi.fn()
  render(<CanvasStoryboardView project={project} onOpenNode={onOpenNode} />)

  expect(screen.getByRole('heading', { name: '文本' })).toBeVisible()
  expect(screen.getByRole('heading', { name: '图片' })).toBeVisible()
  expect(screen.getByRole('heading', { name: '视频' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '在工作流中打开 角色图' }))
  expect(onOpenNode).toHaveBeenCalledWith('image-node')
})

test('shows local assets, generation history and keyboard help in one side panel', () => {
  const { rerender } = render(
    <WorkspaceSidePanel panel="assets" project={project} onClose={vi.fn()} onSelectNode={vi.fn()} />,
  )
  expect(screen.getByRole('complementary', { name: '资产' })).toHaveTextContent('角色图')

  rerender(
    <WorkspaceSidePanel panel="history" project={project} onClose={vi.fn()} onSelectNode={vi.fn()} />,
  )
  expect(screen.getByRole('complementary', { name: '历史' })).toHaveTextContent('已完成')

  rerender(
    <WorkspaceSidePanel panel="shortcuts" project={project} onClose={vi.fn()} onSelectNode={vi.fn()} />,
  )
  expect(screen.getByText('连接节点')).toBeVisible()
  expect(screen.getByText('L')).toBeVisible()
})

test('exposes independent workspace view controls', async () => {
  const user = userEvent.setup()
  const onToggleMinimap = vi.fn()
  const onToggleSnap = vi.fn()
  const onFitView = vi.fn()
  render(
    <CanvasViewControls
      minimapVisible={false}
      snapToGrid={false}
      zoomPercent={100}
      onToggleMinimap={onToggleMinimap}
      onToggleSnap={onToggleSnap}
      onFitView={onFitView}
    />,
  )

  await user.click(screen.getByRole('button', { name: '显示小地图' }))
  await user.click(screen.getByRole('button', { name: '开启网格吸附' }))
  await user.click(screen.getByRole('button', { name: '适配画布' }))
  expect(onToggleMinimap).toHaveBeenCalledOnce()
  expect(onToggleSnap).toHaveBeenCalledOnce()
  expect(onFitView).toHaveBeenCalledOnce()
  expect(screen.getByText('100%')).toBeVisible()
})

test('keeps the agent in a named side panel and provides an explicit close action', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(<CanvasAgentPanel onClose={onClose}><p>AI 导演内容</p></CanvasAgentPanel>)
  expect(screen.getByRole('complementary', { name: 'Agent 工作区' })).toHaveTextContent('AI 导演内容')
  await user.click(screen.getByRole('button', { name: '关闭 Agent' }))
  expect(onClose).toHaveBeenCalledOnce()
})

test('only offers image creation tools for an image selection and requires confirmation', async () => {
  const user = userEvent.setup()
  const onCreateToolNode = vi.fn()
  const { rerender } = render(
    <SelectionContextBar node={project.nodes[0]} onCreateToolNode={onCreateToolNode} />,
  )
  expect(screen.queryByRole('toolbar', { name: '图片创作工具' })).not.toBeInTheDocument()

  rerender(
    <SelectionContextBar node={project.nodes[1]} onCreateToolNode={onCreateToolNode} />,
  )
  for (const label of ['人像质感', '720°全景', '多角度', '智能打光', '九宫格', '高清', '宫格拆分']) {
    expect(screen.getByRole('button', { name: label })).toBeVisible()
  }
  await user.click(screen.getByRole('button', { name: '多角度' }))
  expect(screen.getByRole('dialog', { name: '多角度配置' })).toBeVisible()
  expect(onCreateToolNode).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '创建配置节点' }))
  expect(onCreateToolNode).toHaveBeenCalledWith('多角度')
})
