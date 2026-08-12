import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import type { CommunityWorkRepository } from './community-repository'
import {
  recordWorkView,
  toggleWorkFavorite,
  toggleWorkLike,
  type PublishedWork,
  type WorkFilter,
} from './community-model'
import { buildDemoWorks } from './demo-works'
import { WorkDetailPage } from './WorkDetailPage'

type DetailRepository = Pick<
  CommunityWorkRepository,
  'get' | 'recordView' | 'toggleLike' | 'toggleFavorite' | 'listPublished'
>

function repositoryWith(works: PublishedWork[]) {
  const stored = new Map(works.map((work) => [work.id, work]))
  const repository: DetailRepository = {
    get: vi.fn(async (id: string) => stored.get(id)),
    recordView: vi.fn(async (id: string) => {
      const current = stored.get(id)
      if (!current) return undefined
      const next = recordWorkView(current)
      stored.set(id, next)
      return next
    }),
    toggleLike: vi.fn(async (id: string) => {
      const current = stored.get(id)
      if (!current) return undefined
      const next = toggleWorkLike(current)
      stored.set(id, next)
      return next
    }),
    toggleFavorite: vi.fn(async (id: string) => {
      const current = stored.get(id)
      if (!current) return undefined
      const next = toggleWorkFavorite(current)
      stored.set(id, next)
      return next
    }),
    listPublished: vi.fn(async (_filter: WorkFilter) =>
      [...stored.values()].filter(({ status }) => status === 'published'),
    ),
  }
  return repository
}

function renderDetail(repository: DetailRepository, workId = 'demo-work-frost-river') {
  return render(
    <MemoryRouter initialEntries={[`/discover/${workId}`]}>
      <Routes>
        <Route path="/discover/:workId" element={<WorkDetailPage repository={repository} />} />
        <Route path="/discover" element={<h1>作品墙</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('work detail page', () => {
  test('renders the stored timeline snapshot through the shared preview player and records one view', async () => {
    const repository = repositoryWith(buildDemoWorks())
    const view = renderDetail(repository)

    expect(await screen.findByRole('heading', { name: '霜河渡' })).toBeVisible()
    expect(screen.getByRole('region', { name: '成片播放器' })).toBeVisible()
    expect(screen.getByRole('img', { name: '分镜 01' })).toHaveAttribute('src', '/demo/shot-river.png')
    expect(screen.getByLabelText('329 次浏览')).toBeVisible()
    expect(repository.recordView).toHaveBeenCalledTimes(1)

    view.rerender(
      <MemoryRouter initialEntries={['/discover/demo-work-frost-river']}>
        <Routes>
          <Route path="/discover/:workId" element={<WorkDetailPage repository={repository} />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(repository.recordView).toHaveBeenCalledTimes(1)
  })

  test('persists like and favorite toggles with pressed state and live counts', async () => {
    const user = userEvent.setup()
    const repository = repositoryWith(buildDemoWorks())
    renderDetail(repository)
    await screen.findByRole('heading', { name: '霜河渡' })

    await user.click(screen.getByRole('button', { name: '点赞 46' }))
    expect(screen.getByRole('button', { name: '取消点赞 47' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '收藏 31' }))
    expect(screen.getByRole('button', { name: '取消收藏 32' })).toHaveAttribute('aria-pressed', 'true')
    expect(repository.toggleLike).toHaveBeenCalledTimes(1)
    expect(repository.toggleFavorite).toHaveBeenCalledTimes(1)
  })

  test('prioritizes same-tag published recommendations and excludes the current work', async () => {
    const works = buildDemoWorks()
    renderDetail(repositoryWith(works), 'demo-work-frost-river')

    const related = await screen.findByRole('region', { name: '相关推荐' })
    expect(within(related).getByRole('article', { name: '雨巷回声' })).toBeVisible()
    expect(within(related).queryByRole('article', { name: '霜河渡' })).not.toBeInTheDocument()
  })

  test.each([
    ['missing-work', undefined],
    ['demo-work-frost-river', 'unlisted'],
  ])('shows an unavailable state for %s', async (workId, status) => {
    const works = buildDemoWorks()
    if (status) works[0] = { ...works[0], status: 'unlisted' }
    renderDetail(repositoryWith(works), workId)

    expect(await screen.findByRole('heading', { name: '作品暂不可用' })).toBeVisible()
    expect(screen.getByRole('link', { name: '返回作品墙' })).toHaveAttribute('href', '/discover')
  })
})
