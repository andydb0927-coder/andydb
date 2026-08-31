import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test } from 'vitest'

import { TutorialDetailPage } from './TutorialDetailPage'

function renderDetail(id: string) {
  render(
    <MemoryRouter initialEntries={[`/tutorials/${id}`]}>
      <Routes>
        <Route path="/tutorials/:tutorialId" element={<TutorialDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('tutorial detail page', () => {
  test('renders article body, steps and category navigation for a known lesson', () => {
    renderDetail('add-node')

    expect(screen.getByRole('heading', { name: '添加创作节点' })).toBeVisible()
    expect(screen.getByRole('navigation', { name: '教程分类导航' })).toBeVisible()
    const body = screen.getByRole('article', { name: '添加创作节点' })
    expect(within(body).getByRole('heading', { name: '操作步骤' })).toBeVisible()
    expect(within(body).getAllByRole('listitem')).toHaveLength(3)
    expect(within(body).getAllByText(/节点/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /上一篇/ })).toHaveAttribute(
      'href',
      '/tutorials/create-project',
    )
    expect(screen.getByRole('link', { name: /下一篇/ })).toHaveAttribute(
      'href',
      '/tutorials/connect-nodes',
    )
  })

  test('shows a local not-found state for a removed lesson', () => {
    renderDetail('missing')
    expect(screen.getByRole('heading', { name: '教程暂不可用' })).toBeVisible()
    expect(screen.getByRole('link', { name: '返回教程中心' })).toHaveAttribute(
      'href',
      '/tutorials',
    )
  })

  test('describes the current real-model catalog without a retired demo-model group', () => {
    renderDetail('image-model')

    const article = screen.getByRole('article', { name: '选择图片模型' })
    expect(article).toHaveTextContent('真实模型目录与配置状态')
    expect(article).toHaveTextContent('未配置的模型会显示禁用原因')
    expect(article).not.toHaveTextContent('本地演示分组')
  })
})
