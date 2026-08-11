import { expect, test } from '@playwright/test'

test('keeps creation-to-preview usable through platform navigation', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.goto('/')
  await expect(page.getByRole('navigation', { name: '平台导航' })).toBeVisible()
  await page.getByRole('link', { name: '工作流与模板' }).click()
  await page.getByRole('link', { name: '使用电影感叙事' }).click()
  await expect(page.getByRole('radio', { name: /电影感叙事/ })).toBeChecked()
  await page.getByLabel('描述你想创作的短片').fill('雨夜追踪')
  await page.getByRole('button', { name: '创建项目' }).click()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()

  await page.getByRole('link', { name: '素材与历史' }).click()
  await expect(page.getByRole('heading', { name: '素材与历史' })).toBeVisible()
  await expect(
    page.getByRole('region', { name: '电影感叙事' }).getByText('角色参考', { exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: '在画布中查看 角色参考' }).click()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await page.getByRole('link', { name: '预览' }).click()
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()

  expect(browserErrors).toEqual([])
})
