import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import { buildDemoWorks } from '../community/demo-works'
import type { CommunityWorkRepository } from '../community/community-repository'
import type { PublishedWork, WorkFilter } from '../community/community-model'
import { DiscoverPage } from './DiscoverPage'

type WallRepository = Pick<CommunityWorkRepository, 'ensureDemoWorks' | 'listPublished'>

function repositoryWith(works: PublishedWork[]): WallRepository {
  return {
    ensureDemoWorks: vi.fn().mockResolvedValue(true),
    listPublished: vi.fn(async (_filter: WorkFilter) => works),
  }
}

function renderDiscover(repository: WallRepository = repositoryWith(buildDemoWorks())) {
  return render(
    <MemoryRouter initialEntries={['/discover']}>
      <Routes>
        <Route path="/discover" element={<DiscoverPage repository={repository} />} />
        <Route path="/discover/:workId" element={<h1>作品详情</h1>} />
        <Route path="/discover/mine" element={<h1>我的作品</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('discover works wall', () => {
  test('seeds the empty local source and renders complete work cards', async () => {
    const repository = repositoryWith(buildDemoWorks())
    renderDiscover(repository)

    const card = await screen.findByRole('article', { name: '霜河渡' })
    expect(repository.ensureDemoWorks).toHaveBeenCalledTimes(1)
    expect(within(card).getByRole('img', { name: '霜河渡' })).toBeVisible()
    expect(within(card).getByText('无线画布')).toBeVisible()
    expect(within(card).getByText('8 秒')).toBeVisible()
    expect(within(card).getByText('国风')).toBeVisible()
    expect(within(card).getByLabelText('328 次浏览')).toBeVisible()
    expect(screen.getByRole('link', { name: '管理我的作品' })).toHaveAttribute(
      'href',
      '/discover/mine',
    )
  })

  test('filters by keyword across title, author, and tags', async () => {
    const user = userEvent.setup()
    renderDiscover()
    await screen.findByRole('article', { name: '霜河渡' })

    await user.type(screen.getByRole('searchbox', { name: '搜索作品' }), '林野')

    expect(screen.getByRole('article', { name: '屋顶来信' })).toBeVisible()
    expect(screen.queryByRole('article', { name: '霜河渡' })).not.toBeInTheDocument()
  })

  test('builds tag choices and combines a selected tag with the query', async () => {
    const user = userEvent.setup()
    renderDiscover()
    await screen.findByRole('article', { name: '霜河渡' })

    await user.selectOptions(screen.getByRole('combobox', { name: '按标签筛选' }), '雨夜')
    expect(screen.getByRole('article', { name: '霜河渡' })).toBeVisible()
    expect(screen.getByRole('article', { name: '雨巷回声' })).toBeVisible()
    expect(screen.queryByRole('article', { name: '屋顶来信' })).not.toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: '搜索作品' }), '氛围')
    expect(screen.getByRole('article', { name: '雨巷回声' })).toBeVisible()
    expect(screen.queryByRole('article', { name: '霜河渡' })).not.toBeInTheDocument()
  })

  test('switches from latest to weighted hot ordering', async () => {
    const user = userEvent.setup()
    renderDiscover()
    await screen.findByRole('article', { name: '霜河渡' })

    expect(screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual([
      '霜河渡',
      '屋顶来信',
      '雨巷回声',
    ])
    await user.click(screen.getByRole('radio', { name: '最热' }))
    expect(screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual([
      '屋顶来信',
      '霜河渡',
      '雨巷回声',
    ])
  })

  test('links cards to details and shows an empty filtered state', async () => {
    const user = userEvent.setup()
    renderDiscover()
    const card = await screen.findByRole('article', { name: '霜河渡' })
    expect(within(card).getByRole('link', { name: '查看作品 霜河渡' })).toHaveAttribute(
      'href',
      '/discover/demo-work-frost-river',
    )

    await user.type(screen.getByRole('searchbox', { name: '搜索作品' }), '不存在')
    expect(screen.getByText('没有匹配的作品')).toBeVisible()
  })

  test('renders a retryable error when local works cannot load', async () => {
    const repository = repositoryWith([])
    vi.mocked(repository.ensureDemoWorks).mockRejectedValue(new Error('indexeddb'))
    renderDiscover(repository)

    expect(await screen.findByRole('alert')).toHaveTextContent('作品暂时无法载入')
    expect(screen.getByRole('button', { name: '重试' })).toBeVisible()
  })
})
