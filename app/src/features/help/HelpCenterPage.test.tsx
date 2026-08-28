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

test('explains local work favorites, visibility, exports and statistics without promising cloud access', async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><HelpCenterPage /></MemoryRouter>)
  await user.type(screen.getByRole('searchbox', { name: '搜索帮助内容' }), '作品')
  for (const question of ['如何收藏和筛选作品？', '作品公开标记会上传云端吗？', '如何导出作品 PNG 长图？', '项目包 JSON 包含什么？', '作品数据看板如何统计？']) {
    expect(screen.getByText(question)).toBeVisible()
  }
})
