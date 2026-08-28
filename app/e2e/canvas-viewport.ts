import { expect, type Locator, type Page } from '@playwright/test'

export async function waitCanvasViewportIdle(page: Page) {
  await page.locator('.react-flow__viewport').evaluate(viewport => new Promise<void>(resolve => {
    let previous = viewport.getAttribute('style')
    let stable = 0
    const check = () => {
      const current = viewport.getAttribute('style')
      stable = current === previous ? stable + 1 : 0
      previous = current
      if (stable >= 3) resolve()
      else requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }))
}

/** Use canvas navigation, not DOM scrolling: React Flow resets its scroll offset. */
export async function fitCanvasContent(page: Page, content: Locator) {
  const fits = async () => {
    const outer = await page.locator('.react-flow').boundingBox()
    const inner = await content.boundingBox()
    return Boolean(outer && inner &&
      inner.x >= outer.x + 16 && inner.y >= outer.y + 16 &&
      inner.x + inner.width <= outer.x + outer.width - 16 &&
      inner.y + inner.height <= outer.y + outer.height - 90)
  }
  for (let step = 0; step < 12; step += 1) {
    await waitCanvasViewportIdle(page)
    if (await fits()) break
    const outer = await page.locator('.react-flow').boundingBox()
    const inner = await content.boundingBox()
    if (!outer || !inner) throw new Error('画布或编辑区未渲染')
    if (inner.width > outer.width - 32 || inner.height > outer.height - 106) {
      await page.getByRole('button', { name: 'Zoom Out', exact: true }).click()
      continue
    }
    const dx = Math.max(-outer.width / 3, Math.min(outer.width / 3,
      outer.x + outer.width / 2 - inner.x - inner.width / 2))
    const dy = Math.max(-outer.height / 3, Math.min(outer.height / 3,
      outer.y + (outer.height - 74) / 2 - inner.y - inner.height / 2))
    const point = await page.locator('.react-flow__pane').evaluate((pane, delta) => {
      const box = pane.getBoundingClientRect()
      for (let y = box.top + 60; y < box.bottom - 100; y += 40) {
        for (let x = box.left + 40; x < box.right - 40; x += 40) {
          if (x + delta.dx < box.left + 16 || x + delta.dx > box.right - 16 ||
            y + delta.dy < box.top + 16 || y + delta.dy > box.bottom - 16) continue
          const hit = document.elementFromPoint(x, y)
          if (hit && pane.contains(hit) && !hit.closest('.react-flow__node, .react-flow__edge, button, input, textarea, [role="dialog"]')) return { x, y }
        }
      }
      throw new Error('没有可用于平移的画布空白区域')
    }, { dx, dy })
    await page.getByRole('region', { name: '项目画布', exact: true }).focus()
    await page.keyboard.down('Space')
    await page.mouse.move(point.x, point.y)
    await page.mouse.down()
    await page.mouse.move(point.x + dx, point.y + dy, { steps: 8 })
    await page.mouse.up()
    await page.keyboard.up('Space')
  }
  await expect.poll(fits).toBe(true)
}
