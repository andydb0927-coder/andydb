import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'

import { HelpCenterPage } from './HelpCenterPage'

test('renders five product-accurate FAQ categories and filters locally', async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><HelpCenterPage /></MemoryRouter>)

  expect(screen.getByRole('heading', { name: '帮助中心' })).toBeVisible()
  for (const category of ['账号', '画布', '生成', '资产', '发布']) {
    expect(screen.getByRole('heading', { name: category })).toBeVisible()
  }

  await user.type(screen.getByRole('searchbox', { name: '搜索帮助内容' }), 'AutoLink')
  expect(screen.getByText('AutoLink 如何建立素材引用？')).toBeVisible()
  expect(screen.queryByRole('heading', { name: '账号' })).not.toBeInTheDocument()
  expect(screen.getByText('找到 1 条帮助')).toBeVisible()
})
