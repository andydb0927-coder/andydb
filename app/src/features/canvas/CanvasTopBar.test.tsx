import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

import { CanvasTopBar } from './CanvasTopBar'

test('switches workspace modes and exposes the agent as a pressed control', async () => {
  const user = userEvent.setup()
  const onModeChange = vi.fn()
  const onToggleAgent = vi.fn()
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
})

test('exposes only real local preview and export actions', async () => {
  const user = userEvent.setup()
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
        onOpenCanvasExport={onOpenCanvasExport}
        onExportWorkflow={onExportWorkflow}
        onImportWorkflow={onImportWorkflow}
      />
    </MemoryRouter>,
  )
  await user.click(screen.getByRole('button', { name: '发布与分享' }))
  const menu = screen.getByRole('menu', { name: '发布与分享菜单' })
  expect(menu).not.toHaveTextContent('发布作品')
  expect(menu).not.toHaveTextContent('分享链接')
  expect(menu).toHaveTextContent('预览')
  expect(menu).toHaveTextContent('导出画布')
  expect(menu).toHaveTextContent('导出工作流 JSON')
  expect(menu).toHaveTextContent('导入工作流 JSON')
  expect(menu).toHaveTextContent('预览导出')
  expect(menu).toHaveTextContent('所有操作仅作用于当前本地项目')

  await user.click(screen.getByRole('menuitem', { name: '导出画布' }))
  expect(onOpenCanvasExport).toHaveBeenCalledOnce()
  await user.click(screen.getByRole('button', { name: '发布与分享' }))
  await user.click(screen.getByRole('menuitem', { name: '导出工作流 JSON' }))
  expect(onExportWorkflow).toHaveBeenCalledOnce()
  await user.click(screen.getByRole('button', { name: '发布与分享' }))
  await user.click(screen.getByRole('menuitem', { name: '导入工作流 JSON' }))
  expect(onImportWorkflow).toHaveBeenCalledOnce()
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
