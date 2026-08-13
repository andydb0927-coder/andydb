import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'

import { PlatformShell } from './PlatformShell'

function renderWorkspaceShell() {
  return render(
    <MemoryRouter initialEntries={['/project/demo-project']}>
      <Routes>
        <Route path="/project/:projectId" element={<PlatformShell mode="workspace" />}>
          <Route index element={<h1>项目画布</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('platform shell', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('marks the current canvas and collapses its workspace rail', async () => {
    const user = userEvent.setup()
    renderWorkspaceShell()

    expect(screen.getByRole('link', { name: '创作画布' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await user.click(screen.getByRole('button', { name: '收起平台导航' }))

    expect(screen.getByRole('navigation', { name: '平台导航' })).toHaveAttribute(
      'data-collapsed',
      'true',
    )
    expect(screen.getByRole('button', { name: '展开平台导航' })).toBeVisible()
  })

  test('keeps the platform home and project space as separate destinations', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<PlatformShell />}>
            <Route index element={<h1>平台首页</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: '创作画布' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '项目空间' })).toHaveAttribute('href', '/projects')
    expect(screen.getByRole('link', { name: '故事设定' })).toHaveAttribute('href', '/story')
    expect(screen.getByRole('link', { name: '剪辑项目' })).toHaveAttribute('href', '/editor')
    expect(screen.getByRole('link', { name: '交付与发布' })).toHaveAttribute('href', '/delivery')
  })

  test('keeps the task drawer collapsed by default and opens it as a layout column', async () => {
    const user = userEvent.setup()
    const { container } = renderWorkspaceShell()

    expect(screen.queryByRole('complementary', { name: '平台完善路线图' })).not.toBeInTheDocument()
    expect(container.querySelector('.platform-shell')).not.toHaveClass('platform-shell--tasks-open')

    await user.click(screen.getByRole('button', { name: '打开阶段任务' }))

    expect(screen.getByRole('complementary', { name: '平台完善路线图' })).toBeVisible()
    expect(container.querySelector('.platform-shell')).toHaveClass('platform-shell--tasks-open')
  })

  test('closes the task drawer with Escape and restores focus to its trigger', async () => {
    const user = userEvent.setup()
    renderWorkspaceShell()

    const trigger = screen.getByRole('button', { name: '打开阶段任务' })
    await user.click(trigger)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('complementary', { name: '平台完善路线图' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
