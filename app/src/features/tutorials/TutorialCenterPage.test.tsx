import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'

import { TutorialCenterPage } from './TutorialCenterPage'

test('renders four structured tutorial categories with three to five lessons each', () => {
  render(<MemoryRouter><TutorialCenterPage /></MemoryRouter>)

  expect(screen.getByRole('heading', { name: '教程中心' })).toBeVisible()
  for (const categoryName of ['入门', '图片创作', '视频创作', '高级']) {
    const category = screen.getByRole('region', { name: `${categoryName}教程` })
    expect(within(category).getByRole('heading', { name: categoryName })).toBeVisible()
    expect(within(category).getAllByRole('article').length).toBeGreaterThanOrEqual(3)
    expect(within(category).getAllByRole('article').length).toBeLessThanOrEqual(5)
  }
  expect(screen.getByText(/生成视频，预计成本/)).toBeVisible()
  expect(screen.getByText(/发布与分享/)).toBeVisible()
})

test('keeps every lesson actionable with three to six ordered steps', () => {
  render(<MemoryRouter><TutorialCenterPage /></MemoryRouter>)

  for (const lesson of screen.getAllByRole('article')) {
    const steps = within(lesson).getAllByRole('listitem')
    expect(steps.length).toBeGreaterThanOrEqual(3)
    expect(steps.length).toBeLessThanOrEqual(6)
  }
})
