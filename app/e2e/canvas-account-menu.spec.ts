import { expect, test } from '@playwright/test'

test('keeps the account and team controls usable on the compact canvas', async ({ page }) => {
  await page.setViewportSize({ width: 721, height: 778 })
  await page.goto('/projects/new?recipe=cinematic-story')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()

  const avatar = page.getByRole('button', { name: /用户头像/ })
  await expect(avatar).toBeVisible()
  await avatar.click()

  const account = page.getByRole('dialog', { name: '账户与团队' })
  await expect(account).toBeVisible()
  await expect(account.getByText('标准版团队 VIP')).toBeVisible()
  await expect(account.getByText('我的本月额度：4216/10000')).toBeVisible()
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
  await page.getByRole('button', { name: '通知 2 条未读' }).click()
  const notifications = page.getByRole('dialog', { name: '通知中心' })
  await notifications.getByRole('button', { name: '全部标为已读' }).click()
  await notifications.getByRole('button', { name: '完成' }).click()
  await avatar.click()
  await expect(page.getByRole('button', { name: '通知' })).toBeVisible()
})

test('keeps the account popover inside an extra-narrow split preview', async ({ page }) => {
  await page.setViewportSize({ width: 366, height: 778 })
  await page.goto('/projects/new?recipe=cinematic-story')

  const avatar = page.getByRole('button', { name: /用户头像/ })
  await expect(avatar).toBeVisible()
  await avatar.click()
  const account = page.getByRole('dialog', { name: '账户与团队' })
  await expect(account).toBeVisible()

  const geometry = await account.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, right: rect.right, width: innerWidth }
  })
  expect(geometry.left).toBeGreaterThanOrEqual(0)
  expect(geometry.right).toBeLessThanOrEqual(geometry.width)
})
