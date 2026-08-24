import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject } from '../timeline/timeline-project'
import { createPublishedWork } from './community-model'
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
  const repository = { get: vi.fn().mockResolvedValue(work) }

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
})
