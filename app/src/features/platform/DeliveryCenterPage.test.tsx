import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { createPublishedWork } from '../community/community-model'
import { createTimelineProject } from '../timeline/timeline-project'
import { DeliveryCenterPage } from './DeliveryCenterPage'

function fixtureData() {
  const publishedProject = {
    ...makeProjectFixture(),
    exportJobs: [{
      id: 'export-new',
      status: 'succeeded' as const,
      createdAt: '2026-08-13T09:00:00.000Z',
      updatedAt: '2026-08-13T10:00:00.000Z',
      assetId: 'asset-shot-river-v1',
    }],
  }
  const draftProject = {
    ...makeProjectFixture(),
    id: 'project-draft',
    title: '雾港预告',
    intent: '准备交付的竖屏版本',
    exportJobs: [],
  }
  const timeline = createTimelineProject(publishedProject)
  const work = createPublishedWork(
    publishedProject,
    timeline,
    { author: '安东', tags: ['雨夜'] },
    undefined,
    { now: () => '2026-08-13T11:00:00.000Z', randomId: () => 'work-published' },
  )
  return { publishedProject, draftProject, timeline, work }
}

function renderPage(options?: { reject?: boolean; copyText?: (value: string) => Promise<void> }) {
  const data = fixtureData()
  const failing = options?.reject
  const projectRepository = { listAll: failing ? vi.fn().mockRejectedValue(new Error('PRIVATE')) : vi.fn().mockResolvedValue([data.publishedProject, data.draftProject]) }
  const timelineRepository = { list: failing ? vi.fn().mockRejectedValue(new Error('PRIVATE')) : vi.fn().mockResolvedValue([data.timeline]) }
  const communityRepository = { listMine: failing ? vi.fn().mockRejectedValue(new Error('PRIVATE')) : vi.fn().mockResolvedValue([data.work]) }
  const copyText = options?.copyText ?? vi.fn().mockResolvedValue(undefined)
  render(
    <MemoryRouter>
      <DeliveryCenterPage
        projectRepository={projectRepository}
        timelineRepository={timelineRepository}
        communityRepository={communityRepository}
        copyText={copyText}
      />
    </MemoryRouter>,
  )
  return { ...data, projectRepository, timelineRepository, communityRepository, copyText }
}

describe('DeliveryCenterPage', () => {
  test('aggregates editing, latest export, and publication status', async () => {
    const { publishedProject, draftProject } = renderPage()

    const published = await screen.findByRole('article', { name: publishedProject.title })
    expect(published).toHaveTextContent('已剪辑')
    expect(published).toHaveTextContent('已完成')
    expect(published).toHaveTextContent('已发布')
    expect(screen.getByRole('article', { name: draftProject.title })).toHaveTextContent('尚无导出任务')
    expect(screen.getByRole('link', { name: `打开剪辑与导出 ${publishedProject.title}` })).toHaveAttribute(
      'href',
      `/project/${publishedProject.id}/preview`,
    )
    expect(screen.getByRole('link', { name: '管理发布' })).toHaveAttribute('href', '/discover/mine')
  })

  test('copies a local share link only after an explicit click', async () => {
    const user = userEvent.setup()
    const copyText = vi.fn().mockResolvedValue(undefined)
    const { work } = renderPage({ copyText })
    await screen.findByRole('button', { name: '复制本地分享链接' })
    expect(copyText).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '复制本地分享链接' }))
    expect(copyText).toHaveBeenCalledWith(`${window.location.origin}/discover/${work.id}`)
    expect(screen.getByRole('status')).toHaveTextContent('已复制本地分享链接')
    expect(screen.getAllByRole('button', { name: '复制本地分享链接' })).toHaveLength(1)
  })

  test('searches and filters publication state', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('article', { name: '雾港预告' })
    await user.type(screen.getByRole('searchbox', { name: '搜索交付项目' }), '竖屏')
    expect(screen.getByRole('article', { name: '雾港预告' })).toBeVisible()
    expect(screen.queryByRole('article', { name: '霜河渡' })).not.toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: '搜索交付项目' }))
    await user.click(screen.getByRole('radio', { name: '已发布' }))
    expect(screen.getByRole('article', { name: '霜河渡' })).toBeVisible()
    expect(screen.queryByRole('article', { name: '雾港预告' })).not.toBeInTheDocument()
  })

  test('shows a fixed aggregate load error', async () => {
    renderPage({ reject: true })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('无法读取交付与发布记录')
    expect(alert).not.toHaveTextContent('PRIVATE')
  })
})
