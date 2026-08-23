import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test } from 'vitest'

import { LOCAL_ACCOUNT_PREFERENCES_KEY } from './local-account-preferences'
import { CanvasAccountMenu } from './CanvasAccountMenu'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.dataset.canvasTheme = 'dark'
})

test('opens honest local settings without fake account, billing, or quota data', async () => {
  const user = userEvent.setup()
  render(<CanvasAccountMenu creditBalance={86} />)

  const trigger = screen.getByRole('button', { name: /本地设置/ })
  await user.click(trigger)

  const panel = screen.getByRole('dialog', { name: '本地设置' })
  expect(panel).toHaveTextContent('本机创作者')
  expect(panel).toHaveTextContent('仅保存在当前浏览器')
  for (const name of [
    '个人中心',
    'AI 水印设置',
    'CLI & Skill',
    '通知 2 条未读',
  ]) {
    expect(within(panel).getByRole('button', { name })).toBeVisible()
  }
  expect(panel).not.toHaveTextContent('VIP')
  expect(panel).not.toHaveTextContent('积分余额')
  expect(within(panel).queryByRole('button', { name: '订阅与发票' })).not.toBeInTheDocument()
  expect(within(panel).queryByRole('link', { name: '前往 Liblib' })).not.toBeInTheDocument()

  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: '本地设置' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

test('persists theme, watermark, and notification controls', async () => {
  const user = userEvent.setup()
  render(<CanvasAccountMenu creditBalance={120} />)

  await user.click(screen.getByRole('button', { name: /本地设置/ }))
  await user.click(screen.getByRole('button', { name: '切换为浅色模式' }))
  expect(document.documentElement.dataset.canvasTheme).toBe('light')

  await user.click(screen.getByRole('button', { name: 'AI 水印设置' }))
  const watermarkDialog = screen.getByRole('dialog', { name: 'AI 水印设置' })
  await user.click(within(watermarkDialog).getByRole('switch', { name: '导出时添加 AI 水印' }))
  await user.click(within(watermarkDialog).getByRole('button', { name: '完成' }))

  await user.click(screen.getByRole('button', { name: /本地设置/ }))
  await user.click(screen.getByRole('button', { name: '通知 2 条未读' }))
  const notifications = screen.getByRole('dialog', { name: '通知中心' })
  await user.click(within(notifications).getByRole('button', { name: '全部标为已读' }))
  await user.click(within(notifications).getByRole('button', { name: '完成' }))

  expect(localStorage.getItem(LOCAL_ACCOUNT_PREFERENCES_KEY)).toContain('"themeMode":"light"')
  expect(localStorage.getItem(LOCAL_ACCOUNT_PREFERENCES_KEY)).toContain('"aiWatermark":false')
  expect(localStorage.getItem(LOCAL_ACCOUNT_PREFERENCES_KEY)).toContain('"notificationUnreadCount":0')
})

test('edits the local display name and opens every local settings destination', async () => {
  const user = userEvent.setup()
  render(<CanvasAccountMenu creditBalance={120} />)

  await user.click(screen.getByRole('button', { name: /本地设置/ }))
  await user.click(screen.getByRole('button', { name: '个人中心' }))
  const profile = screen.getByRole('dialog', { name: '个人中心' })
  const nameInput = within(profile).getByRole('textbox', { name: '显示名称' })
  await user.clear(nameInput)
  await user.type(nameInput, '安迪导演')
  await user.click(within(profile).getByRole('button', { name: '保存个人资料' }))
  expect(screen.getByRole('button', { name: '本地设置，安迪导演' })).toBeVisible()

  for (const [entry, dialog] of [
    ['CLI & Skill', 'CLI 与 Skill'],
  ]) {
    await user.click(screen.getByRole('button', { name: /本地设置/ }))
    await user.click(screen.getByRole('button', { name: entry }))
    expect(screen.getByRole('dialog', { name: dialog })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '完成' }))
  }
})
