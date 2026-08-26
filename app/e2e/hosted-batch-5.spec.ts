import { expect, test } from '@playwright/test'

test('opens membership and help from the platform rail', async ({ page }) => {
  await page.goto('/membership')
  await expect(page.getByRole('heading', { name: '积分与会员' })).toBeVisible()
  await expect(page.getByText('120')).toBeVisible()
  await expect(page.getByRole('button', { name: '支付待接入' })).toHaveCount(2)

  await page.getByRole('link', { name: '帮助', exact: true }).click()
  await expect(page.getByRole('heading', { name: '帮助中心' })).toBeVisible()
  await page.getByRole('searchbox', { name: '搜索帮助内容' }).fill('AutoLink')
  await expect(page.getByText('AutoLink 如何建立素材引用？')).toBeVisible()
  await expect(page.getByText('找到 1 条帮助')).toBeVisible()
})

test('shows generation task notifications and persists the read state', async ({ page }) => {
  await page.goto('/projects/new?recipe=cinematic-story')
  await page.getByRole('button', { name: '适配画布' }).click()
  await page.getByRole('button', { name: '场景设定', exact: true }).click()
  const composer = page.getByRole('region', { name: '场景设定 生成参数' })
  await composer.getByRole('button', { name: '生成图片，预计成本 18' }).click()

  const avatar = page.getByRole('button', { name: /本地设置/ })
  await expect(avatar).toHaveAccessibleName(/本地设置/)
  await avatar.click()
  await page.getByRole('button', { name: /通知 1 条未读/ }).click()
  const center = page.getByRole('dialog', { name: '通知中心' })
  await expect(center.getByText('图片生成完成')).toBeVisible()
  await center.getByRole('button', { name: '全部标为已读' }).click()
  await center.getByRole('button', { name: '完成' }).click()

  await page.reload()
  await page.getByRole('button', { name: /本地设置/ }).click()
  await expect(page.getByRole('button', { name: '通知' })).toBeVisible()
})
