import { expect, test } from '@playwright/test'

test('keeps creation-to-preview usable through platform navigation', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.goto('/')
  const sidebar = page.getByRole('complementary', { name: '侧边导航' })
  await expect(sidebar.getByRole('navigation', { name: '首页导航' })).toBeVisible()
  for (const destination of ['新建项目', '首页', '项目', 'Skills', '创作者挑战赛', '帮助']) {
    await expect(sidebar.getByRole('link', { name: destination, exact: true })).toBeVisible()
  }
  await expect(sidebar.getByRole('link', { name: '工作流与模板' })).toHaveCount(0)
  await sidebar.getByRole('link', { name: '新建项目', exact: true }).click()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await expect(page).toHaveURL(/\/project\/[^/]+$/)
  const projectTitle = await page.getByRole('heading', { level: 1 }).textContent()
  expect(projectTitle).toMatch(/^未命名项目 · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)

  await page.getByRole('button', { name: '发布与分享' }).click()
  await page
    .getByRole('menu', { name: '发布与分享菜单' })
    .getByRole('menuitem', { name: '预览' })
    .click()
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()
  await page.getByRole('link', { name: '项目', exact: true }).click()
  await expect(page.getByRole('heading', { name: '全部项目' })).toBeVisible()

  expect(browserErrors).toEqual([])
})
