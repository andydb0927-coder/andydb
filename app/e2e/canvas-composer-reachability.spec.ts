import { expect, test, type Locator, type Page } from './provider-fixture'
import { fitCanvasContent, waitCanvasViewportIdle } from './canvas-viewport'

const viewportMatrix = [
  { width: 1280, height: 720 },
  { width: 1024, height: 900 },
  { width: 721, height: 778 },
] as const

async function addImageNode(page: Page) {
  await page.goto('/projects/new')
  await page.getByRole('button', { name: '添加节点', exact: true }).click()
  await page.getByRole('menuitem', { name: '图片', exact: true }).click()
  await waitCanvasViewportIdle(page)
  await page.getByRole('button', { name: '图片 01', exact: true }).click()
  const composer = page.getByRole('region', { name: '图片 01 生成参数', exact: true })
  await expect(composer).toBeVisible()
  return composer
}

async function expectFullViewportRect(page: Page, target: Locator) {
  const geometry = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }
  })
  expect(geometry.left).toBeGreaterThanOrEqual(0)
  expect(geometry.top).toBeGreaterThanOrEqual(56)
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight)
}

async function panContentIntoViewport(page: Page, target: Locator) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitCanvasViewportIdle(page)
    const canvas = await page.locator('.react-flow').boundingBox()
    const content = await target.boundingBox()
    if (!canvas || !content) throw new Error('画布或生成面板未渲染')
    const fits = content.x >= canvas.x && content.y >= canvas.y &&
      content.x + content.width <= canvas.x + canvas.width &&
      content.y + content.height <= canvas.y + canvas.height
    if (fits) return
    const dx = canvas.x + canvas.width / 2 - content.x - content.width / 2
    const dy = canvas.y + canvas.height / 2 - content.y - content.height / 2
    const point = await page.locator('.react-flow__pane').evaluate((pane) => {
      const rect = pane.getBoundingClientRect()
      for (let y = rect.top + 20; y < rect.bottom - 20; y += 20) {
        for (let x = rect.left + 20; x < rect.right - 20; x += 20) {
          const hit = document.elementFromPoint(x, y)
          if (hit && pane.contains(hit) && !hit.closest('.react-flow__node, button, input, textarea, select')) {
            return { x, y }
          }
        }
      }
      throw new Error('没有可用的画布平移点')
    })
    await page.getByRole('application', { name: '创作节点图' }).focus()
    await page.keyboard.down('Space')
    await page.mouse.move(point.x, point.y)
    await page.mouse.down()
    await page.mouse.move(point.x + dx, point.y + dy, { steps: 8 })
    await page.mouse.up()
    await page.keyboard.up('Space')
  }
  await expectFullViewportRect(page, target)
}

async function chooseFourImagesWithRealHitTesting(page: Page, composer: Locator) {
  const canvasToolbar = page.getByRole('toolbar', { name: '画布模式工具' })
  const parameterTrigger = composer.getByRole('button', { name: '图片生成参数' })
  await parameterTrigger.click()
  const dialog = composer.getByRole('dialog', { name: '图片生成参数' })
  await expect(dialog).toBeVisible()
  await expect(canvasToolbar).toBeHidden()
  await expectFullViewportRect(page, dialog)
  const fourImages = dialog.getByRole('button', { name: '4张', exact: true })
  await fourImages.click()
  await expect(fourImages).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(parameterTrigger).toBeFocused()
  await expect(canvasToolbar).toBeVisible()
}

for (const viewport of viewportMatrix) {
  test(`keeps the image composer and parameter dialog reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const composer = await addImageNode(page)
    await fitCanvasContent(page, composer)
    await expectFullViewportRect(page, composer)
    await composer.getByRole('textbox', { name: '提示词', exact: true }).click()
    await chooseFourImagesWithRealHitTesting(page, composer)
  })
}

test('keeps the composer screen-sized at maximum canvas zoom in a 200% equivalent layout', async ({ page }) => {
  await page.setViewportSize({ width: 721, height: 778 })
  const composer = await addImageNode(page)
  await panContentIntoViewport(page, composer)
  const baseline = await composer.boundingBox()
  expect(baseline).not.toBeNull()

  const zoomIn = page.getByRole('button', { name: 'Zoom In', exact: true })
  for (let step = 0; step < 12 && (await zoomIn.isEnabled()); step += 1) {
    await zoomIn.click()
  }
  await waitCanvasViewportIdle(page)
  await panContentIntoViewport(page, composer)

  const zoomed = await composer.boundingBox()
  expect(zoomed).not.toBeNull()
  expect(zoomed!.width).toBeCloseTo(baseline!.width, 0)
  expect(zoomed!.height).toBeCloseTo(baseline!.height, 0)
  await composer.getByRole('textbox', { name: '提示词', exact: true }).click()
  await chooseFourImagesWithRealHitTesting(page, composer)
})
