import { expect, test } from '@playwright/test'

test('keeps creation-to-preview usable through platform navigation', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.goto('/')
  await expect(page.getByRole('navigation', { name: '首页导航' })).toBeVisible()
  await page.getByRole('link', { name: '新建项目', exact: true }).click()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await expect(page).toHaveURL(/\/project\/[^/]+$/)
  const projectTitle = await page.getByRole('heading', { level: 1 }).textContent()
  expect(projectTitle).toMatch(/^未命名项目 · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)

  await page.getByRole('link', { name: '素材与历史' }).click()
  await expect(page.getByRole('heading', { name: '素材与历史' })).toBeVisible()
  await expect(
    page.getByRole('region', { name: projectTitle! }).getByText('角色参考', { exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: '在画布中查看 角色参考' }).click()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await page.getByRole('link', { name: '预览' }).click()
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()

  expect(browserErrors).toEqual([])
})
