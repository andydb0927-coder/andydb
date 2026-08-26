import { expect, test } from '@playwright/test'

test('keeps local settings usable on the compact canvas', async ({ page }) => {
  await page.setViewportSize({ width: 721, height: 778 })
  await page.goto('/projects/new?recipe=cinematic-story')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()

  const avatar = page.getByRole('button', { name: /本地设置/ })
  await expect(avatar).toBeVisible()
  await avatar.click()

  const account = page.getByRole('dialog', { name: '本地设置' })
  await expect(account).toBeVisible()
  await expect(account.getByText('本地创作偏好 · 仅保存在当前浏览器')).toBeVisible()
  await expect(account.getByText('会员与积分为本地统计；支付和云端团队服务尚未接入。')).toBeVisible()
  await expect(account.getByText('标准版团队 VIP')).toHaveCount(0)
  const geometry = await account.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    }
  })
  expect(geometry.left).toBeGreaterThanOrEqual(0)
  expect(geometry.top).toBeGreaterThanOrEqual(0)
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight)

  await account.getByRole('button', { name: '切换为浅色模式' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-canvas-theme', 'light')
  await page.keyboard.press('Escape')
  await expect(account).toHaveCount(0)
  await expect(avatar).toBeFocused()

  await avatar.click()
  await page.getByRole('button', { name: '通知' }).click()
  const notifications = page.getByRole('dialog', { name: '通知中心' })
  await expect(notifications.getByText('暂无生成任务通知')).toBeVisible()
  await expect(notifications.getByRole('button', { name: '全部标为已读' })).toBeDisabled()
  await notifications.getByRole('button', { name: '完成' }).click()
  await avatar.click()
  await expect(page.getByRole('button', { name: '通知' })).toBeVisible()
})

test('keeps local settings inside an extra-narrow split preview', async ({ page }) => {
  await page.setViewportSize({ width: 366, height: 778 })
  await page.goto('/projects/new?recipe=cinematic-story')

  const avatar = page.getByRole('button', { name: /本地设置/ })
  await expect(avatar).toBeVisible()
  await avatar.click()
  const account = page.getByRole('dialog', { name: '本地设置' })
  await expect(account).toBeVisible()

  const geometry = await account.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, right: rect.right, width: innerWidth }
  })
  expect(geometry.left).toBeGreaterThanOrEqual(0)
  expect(geometry.right).toBeLessThanOrEqual(geometry.width)
})
