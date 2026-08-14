import { render, screen, within } from '@testing-library/react'
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

test('offers the exact eleven image actions and confirms only click-to-insert tools', async () => {
  const user = userEvent.setup()
  const onCreateToolNode = vi.fn()
  const { rerender } = render(
    <SelectionContextBar project={project} node={project.nodes[0]} onCreateToolNode={onCreateToolNode} onRotateImage={vi.fn()} />,
  )
  expect(screen.queryByRole('toolbar', { name: '图片创作工具' })).not.toBeInTheDocument()

  rerender(
    <SelectionContextBar project={project} node={project.nodes[1]} onCreateToolNode={onCreateToolNode} onRotateImage={vi.fn()} />,
  )
  for (const label of ['人像质感调节', '全景', '多角度', '打光', '九宫格', '高清', '宫格切分', '标注', '旋转', '下载', '预览']) {
    expect(screen.getByRole('button', { name: label })).toBeVisible()
  }

  await user.click(screen.getByRole('button', { name: '人像质感调节' }))
  expect(screen.getByRole('menuitem', { name: '人像调节' })).toBeVisible()
  expect(screen.getByRole('menuitem', { name: '情绪调节' })).toBeDisabled()
  await user.click(screen.getByRole('menuitem', { name: '人像调节' }))
  const confirmation = screen.getByRole('alertdialog', { name: '添加人像调节工具节点' })
  expect(confirmation).toHaveTextContent('将添加工具节点')
  expect(onCreateToolNode).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '确认添加' }))
  expect(onCreateToolNode).toHaveBeenCalledWith('人像调节')
})

test('keeps multi-angle, lighting, and annotation changes in drafts until submit', async () => {
  const user = userEvent.setup()
  const onCreateToolNode = vi.fn()
  render(
    <SelectionContextBar project={project} node={project.nodes[1]} onCreateToolNode={onCreateToolNode} onRotateImage={vi.fn()} />,
  )

  await user.click(screen.getByRole('button', { name: '多角度' }))
  const multiAngle = screen.getByRole('dialog', { name: '多角度编辑器' })
  for (const preset of ['自定义', '鱼眼视角', '倾斜视角', '正面俯拍', '正面仰拍', '全景俯拍', '背面视角']) {
    expect(within(multiAngle).getByRole('button', { name: preset })).toBeVisible()
  }
  expect(within(multiAngle).getByLabelText('水平环绕')).toHaveValue('0')
  expect(within(multiAngle).getByLabelText('垂直俯仰')).toHaveValue('0')
  expect(within(multiAngle).getByLabelText('景别缩放')).toHaveValue('5')
  expect(within(multiAngle).getByText('预计成本 1')).toBeVisible()
  expect(onCreateToolNode).not.toHaveBeenCalled()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: '多角度编辑器' })).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '打光' }))
  const lighting = screen.getByRole('dialog', { name: '打光编辑器' })
  for (const field of ['智能模式', '亮度级别', '亮度百分比', '颜色', '主光源', '轮廓光']) {
    expect(within(lighting).getByLabelText(field)).toBeVisible()
  }
  await user.keyboard('{Escape}')

  await user.click(screen.getByRole('button', { name: '标注' }))
  const annotation = screen.getByRole('dialog', { name: '标注编辑器' })
  for (const tool of ['画笔', '框注', '文字', '颜色', '线宽', '撤销', '重做']) {
    expect(within(annotation).getByLabelText(tool)).toBeVisible()
  }
  expect(within(annotation).getByRole('button', { name: '保存标注' })).toBeDisabled()
  await user.keyboard('{Escape}')
  expect(onCreateToolNode).not.toHaveBeenCalled()
})

test('opens the verified nine-grid, split, and canvas-image preview read-only surfaces', async () => {
  const user = userEvent.setup()
  render(
    <SelectionContextBar project={project} node={project.nodes[1]} onCreateToolNode={vi.fn()} onRotateImage={vi.fn()} />,
  )

  await user.click(screen.getByRole('button', { name: '九宫格' }))
  const templates = screen.getByRole('menu', { name: '九宫格模板' })
  expect(within(templates).getAllByRole('menuitem')).toHaveLength(11)
  await user.keyboard('{Escape}')

  await user.click(screen.getByRole('button', { name: '宫格切分' }))
  const split = screen.getByRole('menu', { name: '宫格切分规格' })
  for (const option of ['4 宫格（2×2）', '9 宫格（3×3）', '16 宫格（4×4）', '25 宫格（5×5）', '自定义']) {
    expect(within(split).getByRole('menuitem', { name: option })).toBeVisible()
  }
  await user.keyboard('{Escape}')

  await user.click(screen.getByRole('button', { name: '预览' }))
  expect(screen.getByRole('dialog', { name: '画布图片预览' })).toBeVisible()
})
