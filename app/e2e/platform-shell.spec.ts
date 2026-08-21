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

  const starter = page.getByRole('region', { name: '开始创作' })
  await expect(starter).toContainText('双击画布')
  await expect(starter).toContainText('自由生成节点')
  await expect(starter.getByRole('button')).toHaveCount(4)
  await expect(starter.getByRole('button', { name: '故事脚本生成' })).toBeVisible()
  await expect(starter.getByRole('button', { name: '角色三视图' })).toBeVisible()
  await expect(starter.getByRole('button', { name: '全能参考生视频 SD2.5' })).toBeVisible()
  await expect(starter.getByRole('button', { name: '音频生视频 SD2.5' })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('region', { name: '开始创作' })).toBeVisible()
  await page
    .getByRole('region', { name: '开始创作' })
    .getByRole('button', { name: '故事脚本生成' })
    .click()
  await expect(page.getByRole('button', { name: '故事脚本 01', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '开始创作' })).toHaveCount(0)
  await expect(page.getByText('已保存')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '故事脚本 01', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '开始创作' })).toHaveCount(0)

  await page.getByRole('button', { name: '发布与分享' }).click()
  await page
    .getByRole('menu', { name: '发布与分享菜单' })
    .getByRole('menuitem', { name: '预览', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()
  await page.getByRole('link', { name: '项目', exact: true }).click()
  await expect(page.getByRole('heading', { name: '全部项目' })).toBeVisible()

  expect(browserErrors).toEqual([])
})

test('keeps the empty-canvas starter reachable at 721 by 778', async ({ page }) => {
  await page.setViewportSize({ width: 721, height: 778 })
  await page.goto('/')
  await page.getByRole('link', { name: '新建项目', exact: true }).click()

  const starter = page.getByRole('region', { name: '开始创作' })
  const dock = page.getByRole('toolbar', { name: '画布模式工具' })
  await expect(starter.getByRole('button')).toHaveCount(4)
  const geometry = await starter.evaluate((element) => {
    const starterRect = element.getBoundingClientRect()
    const dockRect = document
      .querySelector('.canvas-mode-bar')
      ?.getBoundingClientRect()
    const buttons = [...element.querySelectorAll('button')].map((button) => {
      const rect = button.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      }
    })
    return {
      starter: {
        left: starterRect.left,
        top: starterRect.top,
        right: starterRect.right,
        bottom: starterRect.bottom,
      },
      dock: dockRect
        ? { left: dockRect.left, top: dockRect.top, right: dockRect.right, bottom: dockRect.bottom }
        : undefined,
      buttons,
      viewport: { width: innerWidth, height: innerHeight },
    }
  })
  expect(geometry.starter.left).toBeGreaterThanOrEqual(0)
  expect(geometry.starter.top).toBeGreaterThanOrEqual(0)
  expect(geometry.starter.right).toBeLessThanOrEqual(geometry.viewport.width)
  expect(geometry.starter.bottom).toBeLessThanOrEqual(geometry.viewport.height)
  expect(geometry.starter.bottom).toBeLessThanOrEqual(geometry.dock!.top)
  for (const button of geometry.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(0)
    expect(button.top).toBeGreaterThanOrEqual(0)
    expect(button.right).toBeLessThanOrEqual(geometry.viewport.width)
    expect(button.bottom).toBeLessThanOrEqual(geometry.viewport.height)
  }
  await expect(dock).toBeVisible()

  await page.locator('.react-flow__pane').dblclick({ position: { x: 300, y: 220 } })
  const picker = page.getByRole('dialog', { name: '选择节点类型' })
  await expect(picker).toBeVisible()
  await picker.getByRole('button', { name: '素材库', exact: true }).click()
  const materialMenu = picker.getByRole('menu', { name: '素材库子菜单' })
  await expect(materialMenu).toBeVisible()
  const pickerGeometry = await Promise.all([picker, materialMenu].map((locator) =>
    locator.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        viewport: { width: innerWidth, height: innerHeight },
      }
    }),
  ))
  for (const rect of pickerGeometry) {
    expect(rect.left).toBeGreaterThanOrEqual(0)
    expect(rect.top).toBeGreaterThanOrEqual(0)
    expect(rect.right).toBeLessThanOrEqual(rect.viewport.width)
    expect(rect.bottom).toBeLessThanOrEqual(rect.viewport.height)
  }
  await page.keyboard.press('Escape')
  await expect(picker).toHaveCount(0)

  await starter.getByRole('button', { name: '全能参考生视频 SD2.5' }).click()
  await expect(
    page.getByRole('button', { name: '全能参考生视频 01', exact: true }),
  ).toBeVisible()
  await expect(starter).toHaveCount(0)
})
