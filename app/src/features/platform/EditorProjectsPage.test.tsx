import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject } from '../timeline/timeline-project'
import { EditorProjectsPage } from './EditorProjectsPage'

function fixtures() {
  const editedProject = makeProjectFixture()
  const waitingProject = {
    ...makeProjectFixture(),
    id: 'project-waiting',
    title: '雾岛序章',
    intent: '一支竖屏概念短片',
  }
  const timeline = {
    ...createTimelineProject(editedProject, {
      now: () => '2026-08-13T09:00:00.000Z',
      randomId: () => 'timeline-id',
    }),
    updatedAt: '2026-08-13T10:00:00.000Z',
  }
  return { editedProject, waitingProject, timeline }
}

function renderPage(reject = false) {
  const data = fixtures()
  const projectRepository = {
    listAll: reject
      ? vi.fn().mockRejectedValue(new Error('PRIVATE path'))
      : vi.fn().mockResolvedValue([data.editedProject, data.waitingProject]),
  }
  const timelineRepository = {
    list: reject
      ? vi.fn().mockRejectedValue(new Error('PRIVATE timeline'))
      : vi.fn().mockResolvedValue([data.timeline]),
  }
  render(
    <MemoryRouter>
      <EditorProjectsPage
        projectRepository={projectRepository}
        timelineRepository={timelineRepository}
      />
    </MemoryRouter>,
  )
  return { ...data, projectRepository, timelineRepository }
}

describe('EditorProjectsPage', () => {
  test('lists edited and waiting projects with professional editing links', async () => {
    const { editedProject, waitingProject, projectRepository, timelineRepository } = renderPage()

    const edited = await screen.findByRole('article', { name: editedProject.title })
    expect(projectRepository.listAll).toHaveBeenCalledTimes(1)
    expect(timelineRepository.list).toHaveBeenCalledTimes(1)
    expect(edited).toHaveTextContent('已剪辑')
    expect(edited).toHaveTextContent('4 条轨道')
    expect(edited).toHaveTextContent('2 个片段')
    expect(screen.getByRole('article', { name: waitingProject.title })).toHaveTextContent('待剪辑')
    expect(screen.getByRole('link', { name: `继续剪辑 ${editedProject.title}` })).toHaveAttribute(
      'href',
      `/project/${editedProject.id}/preview`,
    )
    expect(screen.getByRole('link', { name: `开始剪辑 ${waitingProject.title}` })).toHaveAttribute(
      'href',
      `/project/${waitingProject.id}/preview`,
    )
  })

  test('searches project intent and filters editing status', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('article', { name: '雾岛序章' })

    await user.type(screen.getByRole('searchbox', { name: '搜索剪辑项目' }), '竖屏')
    expect(screen.getByRole('article', { name: '雾岛序章' })).toBeVisible()
    expect(screen.queryByRole('article', { name: '霜河渡' })).not.toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: '搜索剪辑项目' }))
    await user.click(screen.getByRole('radio', { name: '已剪辑' }))
    expect(screen.getByRole('article', { name: '霜河渡' })).toBeVisible()
    expect(screen.queryByRole('article', { name: '雾岛序章' })).not.toBeInTheDocument()
  })

  test('shows a no-match state', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('article', { name: '霜河渡' })
    await user.type(screen.getByRole('searchbox', { name: '搜索剪辑项目' }), '不存在')
    expect(screen.getByText('没有匹配的剪辑项目')).toBeVisible()
  })

  test('shows a fixed repository error', async () => {
    renderPage(true)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('无法读取剪辑项目')
    expect(alert).not.toHaveTextContent('PRIVATE')
  })
})
