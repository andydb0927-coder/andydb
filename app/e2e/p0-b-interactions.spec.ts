import { expect, test, type Page } from './provider-fixture'

async function openRecipeProject(page: Page) {
  await page.goto('/projects/new?recipe=cinematic-story')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await page.getByRole('button', { name: '适配画布' }).click()
}

test('executes Slash parameters and creates a local AutoLink reference edge', async ({ page }) => {
  await openRecipeProject(page)
  await page.getByRole('button', { name: '场景设定', exact: true }).click()
  const composer = page.getByRole('region', { name: '场景设定 生成参数' })
  const prompt = composer.getByRole('textbox', { name: '提示词' })

  await prompt.click()
  await prompt.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await prompt.pressSequentially('/竖屏')
  await expect(page.getByRole('dialog', { name: 'Slash 命令面板' })).toBeVisible()
  await prompt.press('Enter')
  await expect(composer.getByRole('button', { name: '图片生成参数' })).toContainText('1584×2816')

  await prompt.click()
  await prompt.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await prompt.pressSequentially('参考角色参考的服装')
  const candidates = page.getByRole('region', { name: 'AutoLink 本地候选' })
  await expect(candidates).toBeVisible()
  await candidates.getByRole('option', { name: /角色参考/ }).click()
  await expect(prompt).toContainText('@角色参考')
  await expect(page.getByLabel('角色参考 → 场景设定', { exact: true })).toBeVisible()
})

test('keeps nodes, connections, and viewport isolated across project canvases', async ({ page }) => {
  await openRecipeProject(page)
  await expect(page.getByRole('button', { name: '场景设定', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '画布 1' }).click()
  await page.getByRole('menuitem', { name: '新建画布' }).click()
  await expect(page.getByRole('button', { name: '画布 2' })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await expect(page.getByRole('region', { name: '开始创作' })).toBeVisible()

  await page.getByRole('button', { name: '画布 2' }).click()
  await page.getByRole('button', { name: '重命名画布 2' }).click()
  await page.getByRole('textbox', { name: '画布名称' }).fill('备选构图')
  await page.getByRole('textbox', { name: '画布名称' }).press('Enter')
  await page.getByRole('menuitem', { name: '画布 1' }).click()
  await expect(page.getByRole('button', { name: '场景设定', exact: true })).toBeVisible()
  await expect(page.getByLabel('角色参考 → 分镜 01', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: '画布 1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '画布 1' }).click()
  await page.getByRole('menuitem', { name: '备选构图' }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await page.getByRole('button', { name: '备选构图', exact: true }).click()
  await page.getByRole('button', { name: '删除备选构图' }).click()
  await expect(page.getByRole('button', { name: '画布 1', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '场景设定', exact: true })).toBeVisible()
})

test('persists clip speed and picture-in-picture composition in the preview timeline', async ({ page }) => {
  await openRecipeProject(page)
  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await page.getByRole('button', { name: '加入时间线' }).click()
  await page.getByRole('button', { name: '发布与分享' }).click()
  await page.getByRole('menuitem', { name: '预览', exact: true }).click()
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()

  await page.getByRole('button', { name: '选择图片 01' }).click()
  await page.getByLabel('片段变速').fill('2')
  await expect(page.getByLabel('变速后时长')).toHaveText('2.50 秒')
  await page.getByLabel('布局模式').selectOption('picture-in-picture')
  await page.getByLabel('画中画水平位置').fill('0.2')
  await expect(page.locator('.preview-player__media-layer')).toHaveAttribute(
    'data-layout-mode',
    'picture-in-picture',
  )

  await expect.poll(async () => page.evaluate(async () => {
    const request = indexedDB.open('wireless-canvas-v1')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('timelineProjects', 'readonly')
    const recordsRequest = transaction.objectStore('timelineProjects').getAll()
    const records = await new Promise<Array<{ tracks: Array<{ clips: Array<{ playbackRate?: number; layout?: { mode: string } }> }> }>>((resolve, reject) => {
      recordsRequest.onsuccess = () => resolve(recordsRequest.result)
      recordsRequest.onerror = () => reject(recordsRequest.error)
    })
    database.close()
    const clip = records.at(-1)?.tracks.flatMap((track) => track.clips)[0]
    return { playbackRate: clip?.playbackRate, layout: clip?.layout?.mode }
  })).toEqual({ playbackRate: 2, layout: 'picture-in-picture' })

  await page.reload()
  await expect(page.getByLabel('片段变速')).toHaveValue('2')
  await expect(page.getByLabel('布局模式')).toHaveValue('picture-in-picture')
})
