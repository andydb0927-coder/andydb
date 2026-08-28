import { expect, test, type Page } from './provider-fixture'
import { fitCanvasContent } from './canvas-viewport'
import type { Project } from '../src/features/project/model'

async function savedProject(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wireless-canvas-v1')
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    try { return await new Promise<Project>((resolve, reject) => {
      const request = db.transaction('projects').objectStore('projects').get(location.pathname.split('/').at(-1)!)
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    }) } finally { db.close() }
  })
}
async function upload(page: Page, path: string) {
  await page.getByRole('button', { name: '添加节点', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: '上传', exact: true }).click()
  await (await chooser).setFiles(path)
}

test('explicit first/last frames, manifest guidance and video version restoration persist with fixture transport', async ({ page }) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1440, height: 1024 })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const bodies: Array<{ content: Array<{ type: string; text?: string; role?: string; image_url?: { url: string } }> }> = []
  await page.route('https://fixture.seedream.invalid/api/v3/contents/generations/tasks**', async route => {
    if (route.request().method() === 'POST') {
      bodies.push(route.request().postDataJSON())
      await route.fulfill({ json: { id: `enhancement-${bodies.length}` } })
    } else {
      const index = route.request().url().endsWith('-1') ? 1 : 2
      await route.fulfill({ json: { status: 'succeeded', content: { video_url: `https://media.fixture.invalid/enhancement-${index}.mp4` }, duration: 5, resolution: '720p', framespersecond: 24, usage: { completion_tokens: 54000 } } })
    }
  })
  await page.goto('/projects/new')
  await upload(page, 'public/demo/shot-river.png')
  await upload(page, 'public/demo/character-lin-yuan.png')
  await page.getByRole('button', { name: '添加节点', exact: true }).click()
  await page.getByRole('menuitem', { name: '视频', exact: true }).click()
  const panel = page.getByRole('region', { name: '视频 01 生成参数', exact: true })
  await panel.getByRole('combobox', { name: '模型', exact: true }).selectOption('seedance-api')
  await panel.getByLabel('生成模式', { exact: true }).selectOption('首尾帧')
  await fitCanvasContent(page, panel)
  await expect(panel.getByRole('button', { name: '生成视频，预计成本 135' })).toBeDisabled()
  // Pick the last frame first: wire order must still be first_frame/last_frame.
  await panel.getByLabel('尾帧图片', { exact: true }).selectOption({ label: 'character-lin-yuan.png' })
  await panel.getByLabel('首帧图片', { exact: true }).selectOption({ label: 'shot-river.png' })
  await panel.getByRole('textbox', { name: '提示词', exact: true }).fill('清晨古桥，旅人穿过薄雾')
  await panel.getByRole('button', { name: '展开高级设置' }).click()
  await fitCanvasContent(page, panel)
  await panel.getByLabel('景别', { exact: true }).selectOption('近景')
  await panel.getByLabel('镜头运动', { exact: true }).selectOption('缓慢推进')
  await panel.getByLabel('负面词', { exact: true }).fill('模糊和闪烁')
  await panel.getByRole('button', { name: '生成视频，预计成本 135' }).click()
  const nodeButton = page.getByRole('button', { name: '视频 01', exact: true })
  await expect(nodeButton.locator('video')).toHaveAttribute('src', 'https://media.fixture.invalid/enhancement-1.mp4', { timeout: 15000 })
  expect(bodies[0].content.map(item => item.role).filter(Boolean)).toEqual(['first_frame', 'last_frame'])
  expect(bodies[0].content[0].text).toContain('避免：模糊和闪烁')
  await expect(page.getByLabel('视频结果信息')).toContainText('24 fps')
  await expect(page.getByLabel('视频结果信息')).toContainText('135 积分')
  await panel.getByRole('textbox', { name: '提示词', exact: true }).fill('第二版夕阳古桥')
  await panel.getByLabel('景别', { exact: true }).selectOption('远景')
  await panel.getByRole('button', { name: '生成视频，预计成本 135' }).click()
  await expect(nodeButton.locator('video')).toHaveAttribute('src', 'https://media.fixture.invalid/enhancement-2.mp4', { timeout: 15000 })
  await page.getByText('视频版本（2）', { exact: true }).click()
  const history = page.locator('.video-version-history')
  await fitCanvasContent(page, history)
  await expect(history.locator('video')).toHaveCount(2)
  await history.getByRole('button', { name: '恢复视频版本 1', exact: true }).click()
  await expect(nodeButton.locator('video')).toHaveAttribute('src', 'https://media.fixture.invalid/enhancement-1.mp4')
  await expect(panel.getByRole('textbox', { name: '提示词', exact: true })).toHaveValue('清晨古桥，旅人穿过薄雾')
  await expect(panel.getByLabel('景别', { exact: true })).toHaveValue('近景')
  await expect.poll(async () => (await savedProject(page)).nodes.find(node => node.title === '视频 01')?.generationConfig?.parameters?.shotSize).toBe('近景')
  await panel.getByRole('button', { name: '收起高级设置' }).click()
  await fitCanvasContent(page, page.locator('.creative-node-composer--video'))
  await page.screenshot({ path: '../docs/qa/evidence/video-enhancement/version-restore.png' })
  await page.reload()
  await fitCanvasContent(page, nodeButton)
  await nodeButton.click()
  await expect(nodeButton.locator('video')).toHaveAttribute('src', 'https://media.fixture.invalid/enhancement-1.mp4')
  await expect(panel.getByLabel('首帧图片', { exact: true })).not.toHaveValue('')
  expect(bodies).toHaveLength(2)
  expect(errors).toEqual([])
})

test('local rotation, mirror and speed encode a new playable video and preserve the original', async ({ page }) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 1440, height: 1024 })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/projects/new')
  await upload(page, 'e2e/fixtures/video-result.mp4')
  await page.getByRole('toolbar', { name: '视频媒体处理工具' }).getByRole('button', { name: '剪辑', exact: true }).click()
  await page.getByRole('button', { name: '镜像 / 旋转 / 变速 / 合成' }).click()
  const dialog = page.getByRole('dialog', { name: '本地视频变换与合成' })
  await dialog.getByLabel('旋转', { exact: true }).selectOption('1')
  await dialog.getByLabel('水平镜像', { exact: true }).check()
  await dialog.getByLabel('播放速度', { exact: true }).selectOption('2')
  await dialog.getByLabel('合成出点', { exact: true }).fill('1')
  const original = (await savedProject(page)).assets.find(asset => asset.kind === 'video')!
  const originalSize = await dialog.getByLabel('原视频预览').evaluate(video => ({ width: (video as HTMLVideoElement).videoWidth, height: (video as HTMLVideoElement).videoHeight }))
  expect(originalSize).toEqual({ width: 320, height: 180 })
  await expect(dialog.getByLabel('本地视频输出规格')).toContainText('0.50s')
  await dialog.getByRole('button', { name: '导出处理视频' }).click()
  await expect(dialog).toHaveCount(0, { timeout: 20000 })
  await expect.poll(async () => (await savedProject(page)).assets.filter(asset => asset.kind === 'video').length).toBe(2)
  const project = await savedProject(page)
  const result = project.assets.find(asset => asset.id !== original.id)!
  expect(result).toMatchObject({ width: originalSize.height, height: originalSize.width, durationSeconds: 0.5, framesPerSecond: 30 })
  expect(result.url).toMatch(/^data:video\/webm;base64,/)
  expect(project.assets.find(asset => asset.id === original.id)).toEqual(original)
  const resultVideo = page.getByRole('button', { name: 'video-result.mp4 本地处理', exact: true }).locator('video')
  await expect.poll(() => resultVideo.evaluate(video => (video as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2)
  expect(await resultVideo.evaluate(video => ({ width: (video as HTMLVideoElement).videoWidth, height: (video as HTMLVideoElement).videoHeight }))).toEqual({ width: originalSize.height, height: originalSize.width })
  const downloaded = page.waitForEvent('download')
  await page.getByRole('toolbar', { name: '视频媒体处理工具' }).getByRole('button', { name: '下载', exact: true }).click()
  expect((await downloaded).suggestedFilename()).toBe('video-result.mp4 本地处理.webm')
  await page.screenshot({ path: '../docs/qa/evidence/video-enhancement/local-transform.png' })
  await page.reload()
  await expect(resultVideo).toHaveAttribute('src', result.url)
  expect(errors).toEqual([])
})

test('721px pip and three-panel composition export real media without paid traffic', async ({ page }) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 721, height: 778 })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  let paidRequests = 0
  await page.route('https://fixture.seedream.invalid/**', route => { paidRequests++; return route.abort() })
  await page.goto('/projects/new')
  await upload(page, 'e2e/fixtures/video-result.mp4')
  for (const layout of ['pip', 'triple']) {
    await page.getByRole('toolbar', { name: '视频媒体处理工具' }).getByRole('button', { name: '剪辑', exact: true }).click()
    await page.getByRole('button', { name: '镜像 / 旋转 / 变速 / 合成' }).click()
    const dialog = page.getByRole('dialog', { name: '本地视频变换与合成' })
    await dialog.getByLabel('合成布局').selectOption(layout)
    await expect(dialog.getByRole('button', { name: '导出处理视频' })).toBeDisabled()
    await dialog.getByLabel('副视频 1').selectOption({ index: 1 })
    if (layout === 'triple') await dialog.getByLabel('副视频 2').selectOption({ index: 1 })
    await dialog.getByLabel('合成出点').fill('0.5')
    await expect(dialog.getByRole('button', { name: '导出处理视频' })).toBeInViewport()
    await page.screenshot({ path: `../docs/qa/evidence/video-enhancement/${layout}-721.png` })
    await dialog.getByRole('button', { name: '导出处理视频' }).click()
    await expect(dialog).toHaveCount(0, { timeout: 20000 })
    await expect.poll(async () => (await savedProject(page)).assets.filter(asset => asset.kind === 'video').length).toBe(layout === 'pip' ? 2 : 3)
  }
  const project = await savedProject(page)
  expect(project.assets.filter(asset => asset.kind === 'video').every(asset => asset.url.startsWith('data:video/'))).toBe(true)
  expect(paidRequests).toBe(0)
  expect(errors).toEqual([])
})
