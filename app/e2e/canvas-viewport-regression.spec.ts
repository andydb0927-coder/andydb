import { createFixtureCinematicProject, expect, test, type Page } from './provider-fixture'
import { waitCanvasViewportIdle } from './canvas-viewport'

async function addNode(page: Page, kind = '图片') {
  await page.goto('/projects/new')
  await page.getByRole('button', { name: '添加节点', exact: true }).click()
  await page.getByRole('menuitem', { name: kind, exact: true }).click()
  await waitCanvasViewportIdle(page)
}

async function expectComposerReachable(page: Page, target = page.locator('.creative-node-composer')) {
  await expect.poll(async () => {
    const rect = await target.boundingBox()
    const canvas = await page.getByRole('region', { name: '项目画布', exact: true }).boundingBox()
    const dock = await page.getByRole('toolbar', { name: '画布模式工具' }).boundingBox()
    return Boolean(rect && canvas && dock && rect.x >= canvas.x && rect.y >= canvas.y &&
      rect.x + rect.width <= canvas.x + canvas.width && rect.y + rect.height <= dock.y - 8)
  }).toBe(true)
}

for (const width of [1280, 1024, 721]) {
  test(`new image composer is immediately usable without manual fitting at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 720 })
    await addNode(page)
    const composer = page.getByRole('region', { name: '图片 01 生成参数', exact: true })
    await expect(composer).toBeVisible()
    await expectComposerReachable(page)
    await expect.poll(async () => {
      const media = await page.getByRole('button', { name: '图片 01', exact: true }).boundingBox()
      const canvas = await page.getByRole('region', { name: '项目画布', exact: true }).boundingBox()
      const panel = await composer.boundingBox()
      return Boolean(media && canvas && panel && media.y >= canvas.y && media.y + media.height <= panel.y)
    }).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('new-image-composer.png') })
    for (const name of ['Zoom In', 'Zoom Out', 'Fit View']) {
      await page.getByRole('button', { name, exact: true }).hover()
    }
    const beforeTyping = await viewport(page)
    const prompt = composer.getByRole('textbox', { name: '提示词', exact: true })
    await prompt.click()
    await prompt.fill('清晨薄雾中的古桥，保留中文输入。')
    await expect(prompt).toHaveText('清晨薄雾中的古桥，保留中文输入。')
    expect(await viewport(page)).toEqual(beforeTyping)
    await composer.getByRole('button', { name: '图片生成参数', exact: true }).click()
    await composer.getByRole('button', { name: '2张', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(composer.getByRole('button', { name: '图片生成参数', exact: true })).toBeFocused()
    const generate = composer.getByRole('button', { name: '生成图片，预计成本 36', exact: true })
    await expectComposerReachable(page, generate)
    await generate.hover()
  })
}

for (const kind of ['视频', '文本']) {
  test(`new ${kind} composer is visible without manual fitting`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await addNode(page, kind)
    const composer = page.locator('.creative-node-composer')
    await expectComposerReachable(page)
    const prompt = composer.getByRole('textbox', { name: kind === '视频' ? '提示词' : '文本生成提示词', exact: true })
    await prompt.click()
    await expect(prompt).toBeFocused()
  })
}

async function viewport(page: Page) {
  await waitCanvasViewportIdle(page)
  return page.locator('.react-flow__viewport').evaluate(element => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform)
    return { x: matrix.e, y: matrix.f, zoom: matrix.a }
  })
}

test('selecting nodes in an existing graph does not move the canvas away from connection targets', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 })
  await createFixtureCinematicProject(page)
  const before = await viewport(page)
  await page.getByRole('button', { name: '角色参考', exact: true }).click()
  expect(await viewport(page)).toEqual(before)
  await page.getByRole('button', { name: '场景设定', exact: true }).click()
  expect(await viewport(page)).toEqual(before)
})

async function waitForSavedViewport(page: Page, expected: { x: number; y: number; zoom: number }) {
  await expect.poll(async () => page.evaluate(async value => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wireless-canvas-v1')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const record = await new Promise<{ activeCanvasId: string; canvases: Array<{ id: string; viewport: typeof value }> }>((resolve, reject) => {
        const request = db.transaction('projects', 'readonly').objectStore('projects').get(location.pathname.split('/').at(-1)!)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const saved = record?.canvases?.find(canvas => canvas.id === record.activeCanvasId)?.viewport
      return Boolean(saved && Math.abs(saved.x - value.x) < 0.01 && Math.abs(saved.y - value.y) < 0.01 && Math.abs(saved.zoom - value.zoom) < 0.00001)
    } finally { db.close() }
  }, expected)).toBe(true)
}

test('restores saved pan and zoom after reload, canvas switching, and leaving the project', async ({ page }, testInfo) => {
  await addNode(page)
  const url = page.url()
  await page.getByRole('button', { name: 'Zoom Out', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom Out', exact: true }).click()
  const saved = await viewport(page)
  await waitForSavedViewport(page, saved)
  await page.reload()
  await expect(page.getByRole('button', { name: '图片 01', exact: true })).toBeVisible()
  const reloaded = await viewport(page)
  await page.screenshot({ path: testInfo.outputPath('reloaded-viewport.png') })
  expect(reloaded.x).toBeCloseTo(saved.x, 1)
  expect(reloaded.y).toBeCloseTo(saved.y, 1)
  expect(reloaded.zoom).toBeCloseTo(saved.zoom, 4)

  await page.getByRole('button', { name: '画布 1', exact: true }).click()
  await page.getByRole('menuitem', { name: '新建画布', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await page.getByRole('button', { name: 'Zoom Out', exact: true }).click()
  const second = await viewport(page)
  await waitForSavedViewport(page, second)
  await page.getByRole('button', { name: '画布 2', exact: true }).click()
  await page.getByRole('menuitem', { name: '画布 1', exact: true }).click()
  expect(await viewport(page)).toEqual(saved)
  await page.goto('/projects')
  await page.goto(url)
  await expect(page.getByRole('button', { name: '图片 01', exact: true })).toBeVisible()
  expect(await viewport(page)).toEqual(saved)
  await page.getByRole('button', { name: '画布 1', exact: true }).click()
  await page.getByRole('menuitem', { name: '画布 2', exact: true }).click()
  expect(await viewport(page)).toEqual(second)
})
