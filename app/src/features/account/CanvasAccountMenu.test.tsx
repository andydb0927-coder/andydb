import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test } from 'vitest'

import { LOCAL_ACCOUNT_PREFERENCES_KEY } from './local-account-preferences'
import { CanvasAccountMenu } from './CanvasAccountMenu'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.dataset.canvasTheme = 'dark'
})

test('opens a complete local account and team menu from the canvas avatar', async () => {
  const user = userEvent.setup()
  render(<CanvasAccountMenu creditBalance={86} />)

  const trigger = screen.getByRole('button', { name: /用户头像/ })
  await user.click(trigger)

  const panel = screen.getByRole('dialog', { name: '账户与团队' })
  expect(panel).toHaveTextContent('本机创作者')
  expect(panel).toHaveTextContent('本地创作团队')
  expect(panel).toHaveTextContent('标准版团队 VIP')
  expect(panel).toHaveTextContent('4216/10000')
  expect(panel).toHaveTextContent('团队积分余额 86 点')
  for (const name of [
    '团队设置',
    '邀请成员',
    '个人中心',
    '订阅与发票',
    'AI 水印设置',
    'CLI & Skill',
    '通知 2 条未读',
    '退出演示账户',
  ]) {
    expect(within(panel).getByRole('button', { name })).toBeVisible()
  }
  expect(within(panel).getByRole('link', { name: '前往 Liblib' })).toHaveAttribute(
    'href',
    'https://www.liblib.tv/',
  )

  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: '账户与团队' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

test('persists theme, watermark, quota order, and notification controls', async () => {
  const user = userEvent.setup()
  render(<CanvasAccountMenu creditBalance={120} />)

  await user.click(screen.getByRole('button', { name: /用户头像/ }))
  await user.click(screen.getByRole('button', { name: '切换为浅色模式' }))
  expect(document.documentElement.dataset.canvasTheme).toBe('light')

  await user.click(screen.getByRole('button', { name: 'AI 水印设置' }))
  const watermarkDialog = screen.getByRole('dialog', { name: 'AI 水印设置' })
  await user.click(within(watermarkDialog).getByRole('switch', { name: '导出时添加 AI 水印' }))
  await user.click(within(watermarkDialog).getByRole('button', { name: '完成' }))

  await user.click(screen.getByRole('button', { name: /用户头像/ }))
  await user.click(screen.getByRole('button', { name: '设置消耗顺序' }))
  const quotaDialog = screen.getByRole('dialog', { name: '设置消耗顺序' })
  await user.click(within(quotaDialog).getByRole('radio', { name: '图片额度优先' }))
  await user.click(within(quotaDialog).getByRole('button', { name: '完成' }))

  await user.click(screen.getByRole('button', { name: /用户头像/ }))
  await user.click(screen.getByRole('button', { name: '通知 2 条未读' }))
  const notifications = screen.getByRole('dialog', { name: '通知中心' })
  await user.click(within(notifications).getByRole('button', { name: '全部标为已读' }))
  await user.click(within(notifications).getByRole('button', { name: '完成' }))

  expect(localStorage.getItem(LOCAL_ACCOUNT_PREFERENCES_KEY)).toContain('"themeMode":"light"')
  expect(localStorage.getItem(LOCAL_ACCOUNT_PREFERENCES_KEY)).toContain('"aiWatermark":false')
  expect(localStorage.getItem(LOCAL_ACCOUNT_PREFERENCES_KEY)).toContain('"consumeOrder":"image-first"')
  expect(localStorage.getItem(LOCAL_ACCOUNT_PREFERENCES_KEY)).toContain('"notificationUnreadCount":0')
})

test('edits the local display name and opens every account destination', async () => {
  const user = userEvent.setup()
  render(<CanvasAccountMenu creditBalance={120} />)

  await user.click(screen.getByRole('button', { name: /用户头像/ }))
  await user.click(screen.getByRole('button', { name: '个人中心' }))
  const profile = screen.getByRole('dialog', { name: '个人中心' })
  const nameInput = within(profile).getByRole('textbox', { name: '显示名称' })
  await user.clear(nameInput)
  await user.type(nameInput, '安迪导演')
  await user.click(within(profile).getByRole('button', { name: '保存个人资料' }))
  expect(screen.getByRole('button', { name: '用户头像，安迪导演' })).toBeVisible()

  for (const [entry, dialog] of [
    ['团队设置', '团队设置'],
    ['邀请成员', '邀请成员'],
    ['订阅与发票', '订阅与发票'],
    ['CLI & Skill', 'CLI 与 Skill'],
    ['退出演示账户', '退出演示账户'],
  ]) {
    await user.click(screen.getByRole('button', { name: /用户头像/ }))
    await user.click(screen.getByRole('button', { name: entry }))
    expect(screen.getByRole('dialog', { name: dialog })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '完成' }))
  }
})
