import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from './provider-fixture'
import { makeProjectFixture } from '../src/test/fixtures'
import { createTimelineProject } from '../src/features/timeline/timeline-project'
import { createPublishedWork } from '../src/features/community/community-model'

async function seedWorks(page: Page) {
  await page.goto('/works')
  await expect(page.getByRole('heading', { name: '作品', exact: true })).toBeVisible()
  const works = ['古桥晨雾', '霓虹雨巷', '山间来信'].map((title, index) => {
    const project = makeProjectFixture()
    project.id = `portfolio-project-${index}`
    project.createdAt = `2026-08-${21 + index}T00:00:00Z`
    project.title = title
    project.jobs[0] = { ...project.jobs[0], modelName: index === 1 ? '豆包' : 'Seedream 5.0 Pro', providerId: index === 1 ? 'ark-text-llm' : 'seedream-5-pro-api', creditsSpent: index === 1 ? 2 : 18 }
    return { ...createPublishedWork(project, createTimelineProject(project), { title, description: index === 0 ? '水墨清晨中的古桥' : '城市与山林的创作记录', author: '本地创作者小安', tags: index === 1 ? ['城市'] : ['国风'] }), id: `portfolio-work-${index}` }
  })
  await page.evaluate(async (works) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open('wireless-canvas-v1'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error) })
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('publishedWorks', 'readwrite')
        for (const work of works) tx.objectStore('publishedWorks').put(work)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } finally { db.close() }
  }, works)
  await page.reload()
  await expect(page.getByRole('article', { name: '古桥晨雾' })).toBeVisible()
  return works
}

test('portfolio filters/sorts, persists favorites and local visibility and counts real frozen job records', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await seedWorks(page)
  const list = page.getByRole('region', { name: '已发布作品列表' })
  await expect(list.getByRole('article').first()).toHaveAttribute('aria-label', '山间来信')
  await page.getByLabel('作品排序', { exact: true }).selectOption('oldest')
  await expect(list.getByRole('article').first()).toHaveAttribute('aria-label', '古桥晨雾')
  await page.getByLabel('搜索作品', { exact: true }).fill('水墨')
  await expect(list.getByRole('article')).toHaveCount(1)
  await page.getByLabel('搜索作品', { exact: true }).fill('')
  await page.getByLabel('筛选模型', { exact: true }).selectOption('豆包')
  await expect(list.getByRole('article')).toHaveCount(1)
  await expect(list).toContainText('霓虹雨巷')
  await page.getByLabel('筛选模型', { exact: true }).selectOption('全部')
  const card = list.getByRole('article', { name: '古桥晨雾' })
  await card.getByRole('button', { name: '收藏', exact: true }).click()
  await expect(card.getByRole('button', { name: '取消收藏' })).toHaveAttribute('aria-pressed', 'true')
  await card.getByLabel('公开标记', { exact: true }).selectOption('public')
  await expect(card.getByLabel('公开标记', { exact: true })).toBeEnabled()
  await page.reload()
  await page.getByLabel('只看收藏', { exact: true }).check()
  await page.getByLabel('筛选公开标记', { exact: true }).selectOption('public')
  await expect(list.getByRole('article')).toHaveCount(1)
  await expect(card.getByLabel('公开标记', { exact: true })).toHaveValue('public')
  const stats = page.getByRole('region', { name: '作品数据看板' })
  await expect(stats.locator('dd')).toHaveText(['3', '1', '3', '38'])
  await expect(stats.getByRole('list', { name: '模型使用次数' })).toContainText('2 次')
  await page.screenshot({ path: '../docs/qa/evidence/works-sharing/portfolio-1440.png', fullPage: true })
  expect(errors).toEqual([])
})

test('work detail exports a real PNG and importable JSON package, copy link and related navigation', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1024 })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const works = await seedWorks(page)
  await page.getByRole('link', { name: '查看作品 古桥晨雾' }).click()
  await expect(page.getByRole('region', { name: '创建者信息' })).toContainText('本地创作者小安')
  const related = page.getByRole('region', { name: '相关作品' })
  await expect(related.getByRole('article').first()).toHaveAttribute('aria-label', '山间来信')
  const pngDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG 长图' }).click()
  const png = await pngDownload
  const pngPath = '../docs/qa/evidence/works-sharing/exported-work.png'
  await png.saveAs(pngPath)
  const bytes = await readFile(pngPath)
  expect(bytes.subarray(1, 4).toString()).toBe('PNG')
  expect(bytes.readUInt32BE(16)).toBe(1200)
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(1200)
  const jsonDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出项目包 JSON' }).click()
  const download = await jsonDownload
  const packaged = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(packaged.format).toBe('wireless-canvas-workflow')
  expect(packaged.project).toEqual(works[0].projectSnapshot)
  expect(packaged.assetIds).toEqual(['asset-rain-audio', 'asset-shot-river-v1'])
  expect(packaged.timeline).toEqual(works[0].timelineSnapshot)
  await page.getByRole('button', { name: '复制分享链接', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://andydb0927-coder.github.io/andydb/view/portfolio-work-0')
  await page.screenshot({ path: '../docs/qa/evidence/works-sharing/detail-1440.png', fullPage: true })
  await related.getByRole('link', { name: '查看作品 山间来信' }).click()
  await expect(page.getByRole('heading', { name: '山间来信', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('img', { name: '山间来信画布快照' })).toBeVisible()
})

test('portfolio/detail actions remain reachable at 721 and 390px, help explains local boundaries', async ({ page }) => {
  await seedWorks(page)
  for (const width of [721, 390]) {
    await page.setViewportSize({ width, height: 778 })
    await page.goto('/works')
    const card = page.getByRole('article', { name: '古桥晨雾' })
    await card.scrollIntoViewIfNeeded()
    await expect(card.getByRole('button', { name: /收藏/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await card.getByRole('link').click()
    await expect(page).toHaveURL(/\/view\/portfolio-work-0$/)
    const creator = page.getByRole('region', { name: '创建者信息' })
    await creator.getByRole('button', { name: /收藏/ }).click()
    await expect(creator.getByRole('button', { name: /收藏/ })).toBeEnabled()
    await page.getByLabel('公开标记', { exact: true }).selectOption(width === 721 ? 'public' : 'private')
    await expect(page.getByLabel('公开标记', { exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '导出项目包 JSON' }).scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `../docs/qa/evidence/works-sharing/detail-${width}.png` })
  }
  await page.goto('/help')
  await page.getByRole('searchbox', { name: '搜索帮助内容' }).fill('二维码')
  await expect(page.getByText('如何导出作品 PNG 长图？')).toBeVisible()
  await expect(page.getByText(/二维码为预留位，不可扫描/)).toBeVisible()
})

test('expired cover export reports failure instead of producing an empty download', async ({ page }) => {
  await seedWorks(page)
  await page.route('**/demo/shot-river.png', (route) => route.fulfill({ status: 404, body: 'fixture expired cover' }))
  await page.goto('/view/portfolio-work-0')
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await page.getByRole('button', { name: '导出 PNG 长图' }).click()
  await expect(page.getByRole('alert')).toHaveText(/PNG 长图导出失败/)
  await expect(page.getByRole('button', { name: '导出 PNG 长图' })).toBeEnabled()
  expect(downloads).toEqual([])
})
