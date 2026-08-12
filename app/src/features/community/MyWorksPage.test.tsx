import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import type { ProjectRepository } from '../project/project-repository'
import { createTimelineProject, type TimelineProject } from '../timeline/timeline-project'
import type { TimelineRepository } from '../timeline/timeline-repository'
import type { CommunityWorkRepository } from './community-repository'
import { createPublishedWork, setWorkStatus, type PublishedWork } from './community-model'
import { MyWorksPage } from './MyWorksPage'

type MyCommunityRepository = Pick<CommunityWorkRepository, 'listMine' | 'publish' | 'setStatus'>
type MyTimelineRepository = Pick<TimelineRepository, 'list'>
type MyProjectRepository = Pick<ProjectRepository, 'load'>

function createRepositories({
  timeline = createTimelineProject(makeProjectFixture()),
  work,
}: {
  timeline?: TimelineProject
  work?: PublishedWork
} = {}) {
  const project = makeProjectFixture()
  let storedWork = work
  const community: MyCommunityRepository = {
    listMine: vi.fn(async () => (storedWork ? [storedWork] : [])),
    publish: vi.fn(async (sourceProject, sourceTimeline, input) => {
      storedWork = createPublishedWork(sourceProject, sourceTimeline, input, storedWork)
      return storedWork
    }),
    setStatus: vi.fn(async (_workId, status) => {
      if (!storedWork) return undefined
      storedWork = setWorkStatus(storedWork, status)
      return storedWork
    }),
  }
  const timelines: MyTimelineRepository = { list: vi.fn(async () => [timeline]) }
  const projects: MyProjectRepository = {
    load: vi.fn(async (projectId) => (projectId === project.id ? project : undefined)),
  }
  return { community, timelines, projects, project, timeline }
}

function renderPage(repositories = createRepositories()) {
  render(
    <MemoryRouter initialEntries={['/discover/mine']}>
      <MyWorksPage
        communityRepository={repositories.community}
        timelineRepository={repositories.timelines}
        projectRepository={repositories.projects}
      />
    </MemoryRouter>,
  )
  return repositories
}

describe('my works page', () => {
  test('lists durable local timeline projects with their publication state', async () => {
    renderPage()

    const card = await screen.findByRole('article', { name: '霜河渡' })
    expect(within(card).getByText('尚未发布')).toBeVisible()
    expect(within(card).getByText('12 秒')).toBeVisible()
    expect(screen.getByRole('link', { name: '返回作品墙' })).toHaveAttribute('href', '/discover')
  })

  test('publishes a real timeline project with edited title, author, and tags', async () => {
    const user = userEvent.setup()
    const repositories = renderPage()
    await screen.findByRole('article', { name: '霜河渡' })

    await user.clear(screen.getByRole('textbox', { name: '作品标题 霜河渡' }))
    await user.type(screen.getByRole('textbox', { name: '作品标题 霜河渡' }), '霜河渡终剪')
    await user.type(screen.getByRole('textbox', { name: '作者 霜河渡' }), '安迪')
    await user.type(screen.getByRole('textbox', { name: '标签 霜河渡' }), '国风, 雨夜')
    await user.click(screen.getByRole('button', { name: '发布 霜河渡' }))

    expect(repositories.community.publish).toHaveBeenCalledWith(
      repositories.project,
      repositories.timeline,
      { title: '霜河渡终剪', author: '安迪', tags: ['国风', '雨夜'] },
    )
    expect(await screen.findByText('已发布')).toBeVisible()
    expect(screen.getByText('作品已发布到本地作品墙。')).toBeVisible()
  })

  test('disables publication when the timeline has no visual source', async () => {
    const project = makeProjectFixture()
    const timeline = createTimelineProject({ ...project, timeline: project.timeline.slice(1) })
    renderPage(createRepositories({ timeline }))

    const card = await screen.findByRole('article', { name: '霜河渡' })
    expect(within(card).getByText('时间线缺少可发布画面')).toBeVisible()
    expect(within(card).getByRole('button', { name: '发布 霜河渡' })).toBeDisabled()
  })

  test('shows metrics, unlists a published work, and republishes it', async () => {
    const user = userEvent.setup()
    const project = makeProjectFixture()
    const timeline = createTimelineProject(project)
    const work = {
      ...createPublishedWork(project, timeline, { author: '安迪', tags: ['雨夜'] }),
      metrics: { views: 18, likes: 5, favorites: 3 },
    }
    const repositories = renderPage(createRepositories({ timeline, work }))

    const card = await screen.findByRole('article', { name: '霜河渡' })
    expect(within(card).getByLabelText('18 次浏览')).toBeVisible()
    expect(within(card).getByLabelText('5 次点赞')).toBeVisible()
    expect(within(card).getByLabelText('3 次收藏')).toBeVisible()

    await user.click(within(card).getByRole('button', { name: '下架 霜河渡' }))
    expect(await within(card).findByText('已下架')).toBeVisible()
    expect(repositories.community.setStatus).toHaveBeenCalledWith(work.id, 'unlisted')

    await user.click(within(card).getByRole('button', { name: '重新发布 霜河渡' }))
    expect(await within(card).findByText('已发布')).toBeVisible()
    expect(repositories.community.publish).toHaveBeenCalledTimes(1)
  })
})
