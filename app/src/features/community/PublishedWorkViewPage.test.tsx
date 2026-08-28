import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject } from '../timeline/timeline-project'
import { createPublishedWork } from './community-model'
import type { PublishedWork } from './community-model'
import { PublishedWorkViewPage } from './PublishedWorkViewPage'

test('renders a local published work as a read-only cover and canvas snapshot', async () => {
  const project = makeProjectFixture()
  const work = createPublishedWork(project, createTimelineProject(project), {
    title: '雨夜重逢',
    description: '这是一个本地演示作品。',
    author: '安迪',
    tags: ['电影'],
    canvasSnapshotUrl: 'data:image/svg+xml;charset=utf-8,%3Csvg%3E',
  })
  const repository = { get: vi.fn().mockResolvedValue(work), listMine: vi.fn().mockResolvedValue([]), toggleFavorite: vi.fn(), setVisibility: vi.fn() }

  render(
    <MemoryRouter initialEntries={[`/view/${work.id}`]}>
      <Routes>
        <Route path="/view/:workId" element={<PublishedWorkViewPage repository={repository} />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('heading', { name: '雨夜重逢' })).toBeVisible()
  expect(screen.getByText('这是一个本地演示作品。')).toBeVisible()
  expect(screen.getByRole('img', { name: '雨夜重逢封面' })).toHaveAttribute('src', work.coverUrl)
  expect(screen.getByRole('img', { name: '雨夜重逢画布快照' })).toHaveAttribute(
    'src',
    work.canvasSnapshotUrl,
  )
  expect(screen.getByText('只读作品')).toBeVisible()
  expect(screen.getByRole('region', { name: '创建者信息' })).toHaveTextContent('安迪')
  expect(screen.getByRole('button', { name: '导出 PNG 长图' })).toBeVisible()
  expect(screen.getByRole('button', { name: '导出项目包 JSON' })).toBeVisible()
  expect(screen.getByRole('region', { name: '相关作品' })).toHaveTextContent('暂无其他作品')
})

test('does not apply a stale result when navigating between works and distinguishes read failure from missing work', async () => {
  const project = makeProjectFixture()
  const work = { ...createPublishedWork(project, createTimelineProject(project), { author: '小安', title: '旧作品', tags: [] }), id: 'old' }
  let resolveOld!: (work: PublishedWork) => void
  const repository = { get: vi.fn((id: string) => id === 'old' ? new Promise<PublishedWork>((resolve) => { resolveOld = resolve }) : Promise.reject(new Error('private error'))), listMine: vi.fn().mockResolvedValue([]), toggleFavorite: vi.fn(), setVisibility: vi.fn() }
  const user = userEvent.setup()
  render(<MemoryRouter initialEntries={['/view/old']}><Link to="/view/new">下一作品</Link><Routes><Route path="/view/:workId" element={<PublishedWorkViewPage repository={repository} />} /></Routes></MemoryRouter>)
  await user.click(screen.getByRole('link', { name: '下一作品' }))
  expect(await screen.findByRole('heading', { name: '作品读取失败' })).toBeVisible()
  await act(async () => resolveOld(work))
  expect(screen.queryByRole('heading', { name: '旧作品' })).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('本地作品读取失败')
})
