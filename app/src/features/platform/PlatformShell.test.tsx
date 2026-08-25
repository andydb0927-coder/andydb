import { render, screen, within } from '@testing-library/react'
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

  test('keeps the Liblib navigation structure in the workspace rail', async () => {
    const user = userEvent.setup()
    renderWorkspaceShell()

    const navigation = screen.getByRole('navigation', { name: '平台导航' })
    expect(within(navigation).getAllByRole('link').map((link) => link.textContent)).toEqual([
      '首页',
      '项目',
      '作品',
      'Skills',
      '创作者挑战赛',
    ])
    expect(screen.getByRole('link', { name: '新建项目' })).toHaveAttribute('href', '/projects/new')
    expect(screen.getByRole('link', { name: '帮助' })).toHaveAttribute('href', '/tutorials')

    await user.click(screen.getByRole('button', { name: '收起平台导航' }))

    expect(screen.getByRole('navigation', { name: '平台导航' })).toHaveAttribute(
      'data-collapsed',
      'true',
    )
    expect(screen.getByRole('button', { name: '展开平台导航' })).toBeVisible()
  })

  test('uses one compact public navigation on every standard page', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<PlatformShell />}>
            <Route index element={<h1>平台首页</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    const homeNavigation = screen.getByRole('navigation', { name: '首页导航' })
    expect(homeNavigation).toBeVisible()
    expect(homeNavigation).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByRole('button', { name: '展开平台导航' })).toBeVisible()
    expect(within(homeNavigation).getAllByRole('link')).toHaveLength(5)
    expect(within(homeNavigation).getByRole('link', { name: '首页' })).toHaveAttribute('href', '/')
    expect(within(homeNavigation).getByRole('link', { name: '项目' })).toHaveAttribute('href', '/projects')
    expect(within(homeNavigation).getByRole('link', { name: '作品' })).toHaveAttribute('href', '/works')
    expect(within(homeNavigation).getByRole('link', { name: 'Skills' })).toHaveAttribute('href', '/agents')
    expect(within(homeNavigation).getByRole('link', { name: '创作者挑战赛' })).toHaveAttribute(
      'href',
      '/challenges',
    )
    expect(screen.getByRole('link', { name: '帮助' })).toHaveAttribute('href', '/tutorials')
    expect(screen.getByRole('link', { name: '新建项目' })).toHaveAttribute('href', '/projects/new')
    expect(screen.queryByRole('link', { name: '故事设定' })).not.toBeInTheDocument()

    render(
      <MemoryRouter initialEntries={['/projects']}>
        <Routes>
          <Route path="/projects" element={<PlatformShell />}>
            <Route index element={<h1>项目空间</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    const platformNavigation = screen.getAllByRole('navigation', { name: '平台导航' })[0]
    expect(within(platformNavigation).getAllByRole('link').map((link) => link.textContent)).toEqual([
      '首页',
      '项目',
      '作品',
      'Skills',
      '创作者挑战赛',
    ])
    for (const removed of ['素材与历史', '故事设定', '剪辑项目', '交付与发布', '发现与作品', '模型能力']) {
      expect(within(platformNavigation).queryByRole('link', { name: removed })).not.toBeInTheDocument()
    }
  })

  test('exposes honest local workspace actions instead of unimplemented account or billing links', () => {
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <Routes>
          <Route path="/projects" element={<PlatformShell />}>
            <Route index element={<h1>项目空间</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    const topbar = screen.getByRole('navigation', { name: '本地工作区快捷入口' })
    expect(within(topbar).getByText('本地模式')).toBeVisible()
    expect(within(topbar).getByRole('link', { name: '项目' })).toHaveAttribute('href', '/projects')
    expect(within(topbar).getByRole('link', { name: '新建画布' })).toHaveAttribute(
      'href',
      '/projects/new',
    )
    for (const unavailable of ['积分超市', '开通会员', '注册/登录']) {
      expect(within(topbar).queryByText(unavailable)).not.toBeInTheDocument()
    }
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
