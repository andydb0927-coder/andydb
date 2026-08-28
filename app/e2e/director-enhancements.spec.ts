import { expect, test, type Page } from './provider-fixture'
import type { Director3DSceneState, Project } from '../src/features/project/model'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

async function savedProject(page: Page): Promise<Project> {
  return page.evaluate(async () => {
    const key = location.pathname.split('/').at(-1)!
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open('wireless-canvas-v1'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error) })
    try { return await new Promise((resolve, reject) => { const read = db.transaction('projects').objectStore('projects').get(key); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error) }) }
    finally { db.close() }
  })
}

async function savedScene(page: Page): Promise<Director3DSceneState | undefined> {
  const project = await savedProject(page)
  const details = project.nodes.find(node => node.details?.type === 'director')?.details
  return details?.type === 'director' ? details.scene3d : undefined
}

async function createDirector(page: Page) {
  await page.route('https://**/*', route => route.abort('blockedbyclient'))
  await page.goto('/projects/new')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await page.getByRole('button', { name: '添加节点', exact: true }).click()
  await page.getByRole('menuitem', { name: '导演台 NEW' }).click()
  return page.getByRole('region', { name: '导演台 01 导演台参数' })
}

test('director lights drag, camera presets, asset drop, trajectory and PNG persist without any AI request', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 1024 })
  const errors: string[] = [], apiRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.url().includes('fixture.seedream.invalid')) apiRequests.push(request.url()) })
  const panel = await createDirector(page)
  const viewport = panel.getByRole('img', { name: '导演台 01 3D视口' })
  await expect(viewport).toHaveAttribute('data-renderer', 'ready')
  await panel.getByRole('button', { name: '三点布光', exact: true }).click()
  await panel.getByRole('button', { name: '全景机位' }).click()
  const light = panel.getByRole('button', { name: '拖动主光', exact: true })
  await expect(light).toBeVisible()
  await expect.poll(async () => (await savedScene(page))?.camera.preset).toBe('wide')
  await expect(viewport).toHaveAttribute('data-camera-motion', 'idle')
  const canvasPosition = (await savedProject(page)).nodes[0].position
  const cameraBeforeDrag = (await savedScene(page))?.camera
  await light.scrollIntoViewIfNeeded()
  const box = await light.boundingBox()
  if (!box) throw new Error('灯光手柄未渲染')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 15, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => (await savedScene(page))?.lighting?.preset).toBe('custom')
  expect((await savedScene(page))?.lighting?.lights[0].position).not.toEqual([4, 5, 5])
  expect((await savedScene(page))?.camera).toEqual(cameraBeforeDrag)
  expect((await savedProject(page)).nodes[0].position).toEqual(canvasPosition)
  await panel.getByRole('button', { name: '添加桌子', exact: true }).dragTo(viewport, { targetPosition: { x: 210, y: 220 } })
  await expect(panel.getByRole('treeitem', { name: /桌子 01/ })).toBeVisible()
  await expect.poll(async () => (await savedScene(page))?.objects.some(object => object.kind === 'table')).toBe(true)
  await panel.getByRole('button', { name: '特写机位' }).click()
  await expect(panel.getByRole('spinbutton', { name: '相机焦距（毫米）' })).toHaveValue('85')
  await panel.locator('summary').filter({ hasText: '运镜轨迹预览' }).click()
  await panel.getByRole('button', { name: '记录当前位置为关键帧' }).click()
  await panel.getByRole('button', { name: '全景机位' }).click()
  await panel.getByRole('button', { name: '记录当前位置为关键帧' }).click()
  await panel.getByRole('spinbutton', { name: '运镜时长（秒）' }).fill('2')
  await expect.poll(async () => (await savedScene(page))?.trajectory?.points.length).toBe(2)
  const before = await savedScene(page)
  await expect(viewport).toHaveAttribute('data-camera-motion', 'idle')
  const savedFrame = await viewport.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())
  await panel.getByRole('button', { name: '播放运镜预览' }).click()
  await expect(panel.getByText('正在播放本地运镜预览', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: '停止预览' })).toBeEnabled()
  await expect.poll(() => viewport.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).not.toBe(savedFrame)
  await expect(panel.getByRole('button', { name: '停止预览' })).toBeDisabled({ timeout: 6000 })
  await expect.poll(() => viewport.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).toBe(savedFrame)
  expect(await savedScene(page)).toEqual(before)
  await page.reload()
  await page.getByRole('button', { name: '导演台 01', exact: true }).click()
  await expect(panel.getByRole('treeitem', { name: /桌子 01/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: '全景机位' })).toHaveAttribute('aria-pressed', 'true')
  // Reload fits the compact card first; explicitly fit the expanded editor before timed playback.
  await page.getByRole('button', { name: '适配画布', exact: true }).click()
  await expect(panel).toBeInViewport({ ratio: .95 })
  expect(await savedScene(page)).toEqual(before)
  await panel.locator('summary').filter({ hasText: '运镜轨迹预览' }).click()
  await expect(panel.getByRole('list', { name: '位置关键帧' }).getByRole('listitem')).toHaveCount(2)
  await panel.getByRole('button', { name: '播放运镜预览' }).click()
  await panel.getByRole('button', { name: '停止预览' }).click()
  expect(await savedScene(page)).toEqual(before)
  await panel.locator('summary').filter({ hasText: '运镜轨迹预览' }).click()
  await mkdir(resolve('../docs/qa/evidence/after/director-enhancement'), { recursive: true })
  await page.getByRole('button', { name: '适配画布', exact: true }).click()
  await expect(viewport).toBeInViewport()
  await page.screenshot({ path: resolve('../docs/qa/evidence/after/director-enhancement/scene-1440.png') })
  await panel.getByRole('button', { name: '导出场景快照 PNG 到画布' }).click()
  await expect(page.getByText('导演台场景快照 PNG 已生成图片节点并写入资产库。')).toBeVisible()
  await expect.poll(async () => (await savedProject(page)).nodes.some(node => node.title === '导演台 01 场景快照')).toBe(true)
  const project = await savedProject(page)
  const asset = project.assets.find(asset => asset.url.startsWith('data:image/png'))
  expect(asset).toBeTruthy()
  const dimensions = await page.evaluate(async url => {
    const image = new Image(); image.src = url
    await image.decode()
    return [image.naturalWidth, image.naturalHeight]
  }, asset!.url)
  expect(dimensions).toEqual([1280, 720])
  await page.getByRole('button', { name: '资产管理', exact: true }).click()
  await expect(page.getByRole('complementary', { name: '资产管理', exact: true })).toContainText('导演台 01 场景快照')
  expect(apiRequests).toEqual([])
  expect(errors).toEqual([])
})

test('director controls stay reachable at 721px and keyboard light positioning saves', async ({ page }) => {
  await page.setViewportSize({ width: 721, height: 778 })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const panel = await createDirector(page)
  await panel.getByRole('button', { name: '顶光', exact: true }).click()
  await panel.getByRole('spinbutton', { name: '主光 X' }).fill('2')
  await expect.poll(async () => (await savedScene(page))?.lighting?.lights[0].position[0]).toBe(2)
  await panel.getByRole('button', { name: '低角度机位' }).click()
  await panel.getByRole('button', { name: '添加椅子', exact: true }).click()
  await expect(panel.getByRole('treeitem', { name: /椅子 01/ })).toBeVisible()
  await panel.getByRole('button', { name: '导出四视图 PNG 到画布' }).scrollIntoViewIfNeeded()
  await expect(panel.getByRole('button', { name: '导出四视图 PNG 到画布' })).toBeInViewport()
  await mkdir(resolve('../docs/qa/evidence/after/director-enhancement'), { recursive: true })
  await page.screenshot({ path: resolve('../docs/qa/evidence/after/director-enhancement/scene-721.png') })
  expect(errors).toEqual([])
})
