import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

import { CanvasTopBar } from './CanvasTopBar'

test('switches workspace modes and exposes the agent as a pressed control', async () => {
  const user = userEvent.setup()
  const onModeChange = vi.fn()
  const onToggleAgent = vi.fn()
  const onOpenPipeline = vi.fn()
  render(
    <MemoryRouter>
      <CanvasTopBar
        projectId="project-1"
        projectTitle="工作台演示"
        saveStatus="saved"
        canUndo={false}
        canRedo={false}
        mode="workflow"
        agentOpen={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onRenameProject={vi.fn()}
        onOpenNodeList={vi.fn()}
        onModeChange={onModeChange}
        onToggleAgent={onToggleAgent}
        onOpenPipeline={onOpenPipeline}
      />
    </MemoryRouter>,
  )

  expect(screen.getByRole('button', { name: '画布 1' })).toBeVisible()
  expect(screen.getByRole('button', { name: '工作流' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: '故事板' }))
  expect(onModeChange).toHaveBeenCalledWith('storyboard')
  const agent = screen.getByRole('button', { name: 'Agent' })
  expect(agent).toHaveAttribute('aria-pressed', 'false')
  await user.click(agent)
  expect(onToggleAgent).toHaveBeenCalledOnce()
  await user.click(screen.getByRole('button', { name: '管线自动化' }))
  expect(onOpenPipeline).toHaveBeenCalledOnce()
})

test('creates, renames, switches, and conditionally deletes project canvases', async () => {
  const user = userEvent.setup()
  const onCreateCanvas = vi.fn()
  const onRenameCanvas = vi.fn()
  const onSwitchCanvas = vi.fn()
  const onDeleteCanvas = vi.fn()
  const canvases = [
    { id: 'one', title: '画布 1', nodes: [], edges: [], groups: [], viewport: { x: 0, y: 0, zoom: 1 }, createdAt: '', updatedAt: '' },
    { id: 'two', title: '备选分镜', nodes: [], edges: [], groups: [], viewport: { x: -20, y: 10, zoom: 0.8 }, createdAt: '', updatedAt: '' },
  ]
  render(
    <MemoryRouter>
      <CanvasTopBar
        projectTitle="工作台演示"
        saveStatus="saved"
        canUndo={false}
        canRedo={false}
        mode="workflow"
        agentOpen={false}
        canvases={canvases}
        activeCanvasId="one"
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onRenameProject={vi.fn()}
        onCreateCanvas={onCreateCanvas}
        onRenameCanvas={onRenameCanvas}
        onSwitchCanvas={onSwitchCanvas}
        onDeleteCanvas={onDeleteCanvas}
        onOpenNodeList={vi.fn()}
        onModeChange={vi.fn()}
        onToggleAgent={vi.fn()}
      />
    </MemoryRouter>,
  )

  await user.click(screen.getByRole('button', { name: '画布 1' }))
  await user.click(screen.getByRole('menuitem', { name: '新建画布' }))
  expect(onCreateCanvas).toHaveBeenCalledOnce()

  await user.click(screen.getByRole('button', { name: '画布 1' }))
  await user.click(screen.getByRole('menuitem', { name: '备选分镜' }))
  expect(onSwitchCanvas).toHaveBeenCalledWith('two')

  await user.click(screen.getByRole('button', { name: '画布 1' }))
  await user.click(screen.getByRole('button', { name: '重命名画布 1' }))
  await user.clear(screen.getByRole('textbox', { name: '画布名称' }))
  await user.type(screen.getByRole('textbox', { name: '画布名称' }), '主画布{Enter}')
  expect(onRenameCanvas).toHaveBeenCalledWith('one', '主画布')
  await user.click(screen.getByRole('button', { name: '删除备选分镜' }))
  expect(onDeleteCanvas).toHaveBeenCalledWith('two')
})

test('exposes local publish, share, preview and export actions', async () => {
  const user = userEvent.setup()
  const onOpenPublish = vi.fn()
  const onCopyShareLink = vi.fn()
  const onOpenCanvasExport = vi.fn()
  const onExportWorkflow = vi.fn()
  const onImportWorkflow = vi.fn()
  render(
    <MemoryRouter>
      <CanvasTopBar
        projectTitle="工作台演示"
        saveStatus="saved"
        canUndo={false}
        canRedo={false}
        mode="workflow"
        agentOpen={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onRenameProject={vi.fn()}
        onOpenNodeList={vi.fn()}
        onModeChange={vi.fn()}
        onToggleAgent={vi.fn()}
        onOpenPublish={onOpenPublish}
        onCopyShareLink={onCopyShareLink}
        onOpenCanvasExport={onOpenCanvasExport}
        onExportWorkflow={onExportWorkflow}
        onImportWorkflow={onImportWorkflow}
      />
    </MemoryRouter>,
  )
  await user.click(screen.getByRole('button', { name: '发布与分享' }))
  const menu = screen.getByRole('menu', { name: '发布与分享菜单' })
  expect(menu).toHaveTextContent('发布到本地作品')
  expect(menu).toHaveTextContent('复制分享链接')
  expect(menu).toHaveTextContent('预览')
  expect(menu).toHaveTextContent('导出画布')
  expect(menu).toHaveTextContent('导出工作流 JSON')
  expect(menu).toHaveTextContent('导入工作流 JSON')
  expect(menu).toHaveTextContent('预览导出')
  expect(menu).toHaveTextContent('发布与分享均为当前浏览器本地演示')

  await user.click(screen.getByRole('menuitem', { name: '发布到本地作品' }))
  expect(onOpenPublish).toHaveBeenCalledOnce()
  await user.click(screen.getByRole('button', { name: '发布与分享' }))
  await user.click(screen.getByRole('menuitem', { name: '复制分享链接' }))
  expect(onCopyShareLink).toHaveBeenCalledOnce()

  await user.click(screen.getByRole('button', { name: '发布与分享' }))
  await user.click(screen.getByRole('menuitem', { name: '导出画布' }))
  expect(onOpenCanvasExport).toHaveBeenCalledOnce()
  await user.click(screen.getByRole('button', { name: '发布与分享' }))
  await user.click(screen.getByRole('menuitem', { name: '导出工作流 JSON' }))
  expect(onExportWorkflow).toHaveBeenCalledOnce()
  await user.click(screen.getByRole('button', { name: '发布与分享' }))
  await user.click(screen.getByRole('menuitem', { name: '导入工作流 JSON' }))
  expect(onImportWorkflow).toHaveBeenCalledOnce()
})

test('closes the publish menu on Escape or outside interaction and restores focus', async () => {
  const user = userEvent.setup()
  const onToggleAgent = vi.fn()
  render(
    <MemoryRouter>
      <CanvasTopBar
        projectTitle="工作台演示"
        saveStatus="saved"
        canUndo={false}
        canRedo={false}
        mode="workflow"
        agentOpen={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onRenameProject={vi.fn()}
        onOpenNodeList={vi.fn()}
        onModeChange={vi.fn()}
        onToggleAgent={onToggleAgent}
      />
    </MemoryRouter>,
  )

  const trigger = screen.getByRole('button', { name: '发布与分享' })
  await user.click(trigger)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('menu', { name: '发布与分享菜单' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()

  await user.click(trigger)
  const agent = screen.getByRole('button', { name: 'Agent' })
  await user.click(agent)
  expect(screen.queryByRole('menu', { name: '发布与分享菜单' })).not.toBeInTheDocument()
  expect(agent).toHaveFocus()
  expect(onToggleAgent).toHaveBeenCalledOnce()
})

test('edits the project title without presenting fake commerce controls', async () => {
  const user = userEvent.setup()
  const onRenameProject = vi.fn()
  render(
    <MemoryRouter>
      <CanvasTopBar
        projectId="project-1"
        projectTitle="工作台演示"
        saveStatus="saved"
        canUndo
        canRedo={false}
        mode="workflow"
        agentOpen={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onRenameProject={onRenameProject}
        onOpenNodeList={vi.fn()}
        onModeChange={vi.fn()}
        onToggleAgent={vi.fn()}
      />
    </MemoryRouter>,
  )

  await user.click(screen.getByRole('button', { name: '编辑项目名' }))
  const title = screen.getByRole('textbox', { name: '项目名' })
  await user.clear(title)
  await user.type(title, '雨夜电影计划{Enter}')
  expect(onRenameProject).toHaveBeenCalledWith('雨夜电影计划')

  expect(screen.queryByRole('button', { name: '积分超市' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /会员中心/ })).not.toBeInTheDocument()
  expect(screen.queryByText(/积分$/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /本地设置/ })).toBeVisible()
})
