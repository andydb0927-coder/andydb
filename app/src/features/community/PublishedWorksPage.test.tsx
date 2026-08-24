import { render, screen } from '@testing-library/react'
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
  const repository = { listMine: vi.fn().mockResolvedValue([work]) }

  render(<MemoryRouter><PublishedWorksPage repository={repository} /></MemoryRouter>)

  expect(await screen.findByRole('heading', { name: work.title })).toBeVisible()
  expect(screen.getByLabelText('21 次浏览')).toBeVisible()
  expect(screen.getByLabelText('8 次点赞')).toBeVisible()
  expect(screen.getByRole('link', { name: `查看作品 ${work.title}` })).toHaveAttribute(
    'href',
    `/view/${work.id}`,
  )
})
