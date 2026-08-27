import { expect, test, type Page } from './provider-fixture'

async function openProject(page: Page) {
  await page.goto('/projects/new?recipe=cinematic-story')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await page.getByRole('button', { name: '适配画布' }).click()
}

async function selectPair(page: Page) {
  const targets = ['角色参考', '场景设定'].map((name) =>
    page.locator('.react-flow__node').filter({
      has: page.getByRole('button', { name, exact: true }),
    }),
  )
  const pane = page.locator('.react-flow__pane')
  const drag = await pane.evaluate((element, selectors) => {
    const paneRect = element.getBoundingClientRect()
    const nodeRects = selectors.map((selector) => {
      const node = document.querySelector<HTMLElement>(selector)
      if (!node) throw new Error(`Missing selection target: ${selector}`)
      return node.getBoundingClientRect()
    })
    return {
      start: {
        x: Math.max(paneRect.left + 2, Math.min(...nodeRects.map(({ left }) => left)) - 12),
        y: Math.max(paneRect.top + 2, Math.min(...nodeRects.map(({ top }) => top)) - 12),
      },
      end: {
        x: Math.min(paneRect.right - 2, Math.max(...nodeRects.map(({ right }) => right)) + 12),
        y: Math.min(paneRect.bottom - 2, Math.max(...nodeRects.map(({ bottom }) => bottom)) + 12),
      },
    }
  }, await Promise.all(targets.map((target) => target.evaluate((node) => {
    const id = node.getAttribute('data-id')
    if (!id) throw new Error('Selection target is missing data-id')
    return `.react-flow__node[data-id="${CSS.escape(id)}"]`
  }))))

  await page.mouse.move(drag.start.x, drag.start.y)
  await page.mouse.down({ button: 'left' })
  await page.mouse.move(drag.end.x, drag.end.y, { steps: 10 })
  await page.mouse.up({ button: 'left' })
  await expect(page.getByRole('toolbar', { name: '已选 2 个节点 组合操作' })).toBeVisible()
}

test('executes a selected workflow group and exposes the same command in the canvas menu', async ({ page }) => {
  await openProject(page)
  await selectPair(page)
  await page.getByRole('toolbar', { name: '已选 2 个节点 组合操作' })
    .getByRole('button', { name: '整组执行' })
    .click()

  const status = page.getByLabel('工作流整组执行状态')
  await expect(status).toBeVisible()
  await expect(status).toHaveAttribute('data-status', 'completed', { timeout: 10_000 })
  await expect(status).toContainText('2/2')

  await page.keyboard.press('Escape')
  const pane = page.locator('.react-flow__pane')
  const point = await pane.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { x: rect.left + 28, y: rect.top + rect.height / 2 }
  })
  await page.mouse.click(point.x, point.y, { button: 'right' })
  await expect(page.getByRole('menuitem', { name: '整组执行' })).toBeVisible()
})

test('opens a draggable and zoomable 720 panorama viewer from an image result', async ({ page }) => {
  await openProject(page)
  await page.getByRole('button', { name: '场景设定', exact: true }).click()
  const toolbar = page.getByRole('toolbar', { name: '图片创作工具' })
  await toolbar.getByRole('button', { name: '全景预览' }).click()

  const viewer = page.getByRole('img', { name: '场景设定 720全景视图' })
  await expect(viewer).toBeVisible()
  const box = await viewer.boundingBox()
  if (!box) throw new Error('Panorama viewport has no bounds')
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.42)
  await page.mouse.up()
  await expect(viewer).not.toHaveAttribute('data-yaw', '0')
  await viewer.hover()
  await page.mouse.wheel(0, -160)
  await expect(viewer).toHaveAttribute('data-zoom', '1.1')
  await page.getByRole('button', { name: '重置全景视角' }).click()
  await expect(viewer).toHaveAttribute('data-yaw', '0')
  await expect(viewer).toHaveAttribute('data-zoom', '1')
})

test('converts any two selected nodes to a configurable storyboard group', async ({ page }) => {
  await openProject(page)
  await selectPair(page)
  await page.getByRole('button', { name: '转换为分镜组' }).click()
  const dialog = page.getByRole('dialog', { name: '分镜组设置' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '2x2' }).click()
  await dialog.getByRole('button', { name: '转换并自动排版' }).click()

  await expect(page.getByRole('group', { name: /节点分组：分镜组/ })).toBeVisible()
  await expect(page.getByText('镜头 1', { exact: true })).toBeVisible()
  const subtitle = page.getByRole('textbox', { name: '镜头 1 字幕' })
  await subtitle.fill('雨夜入城')
  await expect(subtitle).toHaveValue('雨夜入城')
  await expect(page.getByRole('button', { name: '导出分镜组 4K' })).toBeVisible()
})
