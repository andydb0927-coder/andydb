import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject } from '../timeline/timeline-project'
import { createPublishedWork } from './community-model'
import { PublishedWorksPage } from './PublishedWorksPage'

test('lists locally published works with mock views and likes', async () => {
  const project = makeProjectFixture()
  const work = {
    ...createPublishedWork(project, createTimelineProject(project), {
      author: '本地创作者',
      tags: ['雨夜'],
      description: '本地简介',
    }),
    metrics: { views: 21, likes: 8, favorites: 3 },
  }
  const repository = { listMine: vi.fn().mockResolvedValue([work]), toggleFavorite: vi.fn(), setVisibility: vi.fn() }

  render(<MemoryRouter><PublishedWorksPage repository={repository} /></MemoryRouter>)

  expect(await screen.findByRole('heading', { name: work.title })).toBeVisible()
  expect(screen.getByLabelText('21 次浏览')).toBeVisible()
  expect(screen.getByLabelText('8 次点赞')).toBeVisible()
  expect(screen.getByRole('link', { name: `查看作品 ${work.title}` })).toHaveAttribute(
    'href',
    `/view/${work.id}`,
  )
})

test('filters cards, persists favorite/visibility actions and shows snapshot-based model statistics', async () => {
  const user = userEvent.setup()
  const project = makeProjectFixture()
  project.jobs[0] = { ...project.jobs[0], modelName: 'Seedream', creditsSpent: 18 }
  const a = createPublishedWork(project, createTimelineProject(project), { author: '小安', tags: ['古桥'], title: '古桥', description: '雾中的清晨' })
  const b = { ...a, id: 'b', title: '雨巷', description: '夜景' }
  const repository = {
    listMine: vi.fn().mockResolvedValue([a, b]),
    toggleFavorite: vi.fn().mockResolvedValue({ ...a, viewer: { liked: false, favorited: true } }),
    setVisibility: vi.fn().mockResolvedValue({ ...a, viewer: { liked: false, favorited: true }, visibility: 'public' }),
  }
  render(<MemoryRouter><PublishedWorksPage repository={repository} /></MemoryRouter>)
  const card = await screen.findByRole('article', { name: '古桥' })
  expect(within(card).getByText('Seedream')).toBeVisible()
  const statistics = screen.getByRole('region', { name: '作品数据看板' })
  expect(statistics).toHaveTextContent('18')
  await user.type(screen.getByRole('searchbox', { name: '搜索作品' }), '清晨')
  expect(screen.queryByRole('article', { name: '雨巷' })).not.toBeInTheDocument()
  await user.click(within(card).getByRole('button', { name: '收藏' }))
  expect(repository.toggleFavorite).toHaveBeenCalledWith(a.id)
  await user.selectOptions(within(card).getByRole('combobox', { name: '公开标记' }), 'public')
  expect(repository.setVisibility).toHaveBeenCalledWith(a.id, 'public')
  await user.click(screen.getByRole('checkbox', { name: '只看收藏' }))
  expect(within(card).getByRole('button', { name: '取消收藏' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('仅当前浏览器有效，不会上传云端，也不提供访问权限控制。')).toBeVisible()
})

test('shows write failures without pretending favorite changes succeeded and prevents concurrent clicks', async () => {
  const user = userEvent.setup()
  const project = makeProjectFixture()
  const work = createPublishedWork(project, createTimelineProject(project), { author: '小安', tags: [] })
  let rejectWrite!: (error: Error) => void
  const repository = { listMine: vi.fn().mockResolvedValue([work]), setVisibility: vi.fn(), toggleFavorite: vi.fn(() => new Promise<never>((_resolve, reject) => { rejectWrite = reject })) }
  render(<MemoryRouter><PublishedWorksPage repository={repository} /></MemoryRouter>)
  const button = await screen.findByRole('button', { name: '收藏' })
  await user.dblClick(button)
  expect(repository.toggleFavorite).toHaveBeenCalledTimes(1)
  expect(button).toBeDisabled()
  rejectWrite(new Error('private database detail'))
  expect(await screen.findByRole('alert')).toHaveTextContent('作品设置保存失败，请重试。')
  await waitFor(() => expect(button).not.toBeDisabled())
  expect(button).toHaveAttribute('aria-pressed', 'false')
})
