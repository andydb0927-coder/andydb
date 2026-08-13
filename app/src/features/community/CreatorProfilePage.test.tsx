import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import { buildDemoWorks } from './demo-works'
import { CreatorProfilePage } from './CreatorProfilePage'

function renderProfile(author = '无线画布', reject = false) {
  const works = buildDemoWorks()
  const sameAuthor = { ...works[1], id: 'same-author', title: '潮汐信笺', author: '无线画布' }
  const repository = {
    listPublished: reject
      ? vi.fn().mockRejectedValue(new Error('PRIVATE database'))
      : vi.fn().mockResolvedValue([...works, sameAuthor]),
  }
  render(
    <MemoryRouter initialEntries={[`/discover/creator/${encodeURIComponent(author)}`]}>
      <Routes>
        <Route path="/discover/creator/:author" element={<CreatorProfilePage repository={repository} />} />
      </Routes>
    </MemoryRouter>,
  )
  return { works, sameAuthor, repository }
}

describe('CreatorProfilePage', () => {
  test('shows exact-author works, verification, and aggregate metrics', async () => {
    const { works, sameAuthor, repository } = renderProfile()

    expect(await screen.findByRole('heading', { name: '无线画布' })).toBeVisible()
    expect(repository.listPublished).toHaveBeenCalledWith({ query: '', tag: 'all', sort: 'latest' })
    expect(screen.getByText('2 件作品')).toBeVisible()
    const identity = screen.getByRole('heading', { name: '无线画布' }).parentElement
    expect(identity).not.toBeNull()
    expect(within(identity!).getByLabelText('无线画布 已认证')).toBeVisible()
    expect(screen.getByText(`${works[0].metrics.views + sameAuthor.metrics.views} 次浏览`)).toBeVisible()
    const catalogue = screen.getByRole('region', { name: '无线画布的作品' })
    expect(within(catalogue).getByRole('article', { name: works[0].title })).toBeVisible()
    expect(within(catalogue).getByRole('article', { name: sameAuthor.title })).toBeVisible()
    expect(within(catalogue).queryByRole('article', { name: works[1].title })).not.toBeInTheDocument()
  })

  test('derives stable popular tags', async () => {
    renderProfile()
    await screen.findByRole('heading', { name: '无线画布' })
    const tags = screen.getByRole('list', { name: '无线画布常用标签' })
    expect(within(tags).getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  test('shows an unavailable state for an unknown creator', async () => {
    renderProfile('不存在创作者')
    expect(await screen.findByRole('heading', { name: '创作者暂不可用' })).toBeVisible()
    expect(screen.getByRole('link', { name: '返回作品墙' })).toHaveAttribute('href', '/discover')
  })

  test('shows a fixed load failure without repository details', async () => {
    renderProfile('无线画布', true)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('无法读取创作者主页')
    expect(alert).not.toHaveTextContent('PRIVATE')
  })
})
