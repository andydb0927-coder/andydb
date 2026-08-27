import type { Download } from '@playwright/test'
import type { TimelineProject } from '../src/features/timeline/timeline-types'
import { createFixtureCinematicProject, expect, test } from './provider-fixture'

async function downloadText(download: Download) {
  const stream = await download.createReadStream()
  if (!stream) throw new Error('下载文件不可读取')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

test('timeline extraction preserves edited playback, JSON/EDL exports and saved state', async ({ page }) => {
  await createFixtureCinematicProject(page)
  await page.getByRole('button', { name: '适配画布' }).click()
  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await page.getByRole('button', { name: '加入时间线' }).click()
  await page.getByRole('button', { name: '发布与分享' }).click()
  await page.getByRole('menuitem', { name: '预览', exact: true }).click()
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()
  await page.getByRole('button', { name: '选择图片 01', exact: true }).click()
  await page.getByLabel('片段变速').fill('2')
  await expect(page.getByLabel('变速后时长')).toHaveText('2.50 秒')
  await page.getByLabel('布局模式').selectOption('picture-in-picture')
  await page.getByLabel('画中画水平位置').fill('0.2')

  const jsonEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载时间线 JSON', exact: true }).click()
  const jsonDownload = await jsonEvent
  const exported = JSON.parse(await downloadText(jsonDownload)) as {
    format: string; version: number; exportedAt: string; project: TimelineProject
  }
  expect(exported).toMatchObject({ format: 'wireless-canvas-timeline', version: 1 })
  expect(Number.isFinite(Date.parse(exported.exportedAt))).toBe(true)
  expect(jsonDownload.suggestedFilename()).toBe(`${exported.project.title.replaceAll(':', '-')}.json`)
  const clip = exported.project.tracks.flatMap(track => track.clips)[0]
  expect(clip).toMatchObject({ playbackRate: 2, layout: { mode: 'picture-in-picture', x: 0.2 } })
  await expect(page.getByRole('status').filter({ hasText: 'JSON 已开始下载' })).toBeVisible()

  const edlEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 EDL', exact: true }).click()
  const edlDownload = await edlEvent
  const edl = await downloadText(edlDownload)
  expect(edlDownload.suggestedFilename()).toBe(`${exported.project.title.replaceAll(':', '-')}.edl`)
  expect(edl).toContain(`TITLE: ${exported.project.title}`)
  expect(edl).toContain('FCM: NON-DROP FRAME')
  expect(edl).toContain('* FROM CLIP NAME: 分镜 01')
  expect(edl).toContain('00:00:02:12')

  await expect.poll(() => page.evaluate(async timelineId => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wireless-canvas-v1')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const saved = await new Promise<TimelineProject>((resolve, reject) => {
        const request = database.transaction('timelineProjects', 'readonly')
          .objectStore('timelineProjects').get(timelineId)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const persisted = saved?.tracks.flatMap(track => track.clips)[0]
      return { rate: persisted?.playbackRate, layout: persisted?.layout }
    } finally { database.close() }
  }, exported.project.id)).toEqual({ rate: 2, layout: clip.layout })
  await page.reload()
  await expect(page.getByLabel('片段变速')).toHaveValue('2')
  await expect(page.getByLabel('布局模式')).toHaveValue('picture-in-picture')
  await expect(page.getByLabel('画中画水平位置')).toHaveValue('0.2')
})

test('central route recovery preserves deep pages and project data after a 404', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await createFixtureCinematicProject(page)
  const projectUrl = page.url()
  const nodeCount = await page.locator('.react-flow__node').count()
  await page.goto('/tutorials/add-node')
  await expect(page.getByRole('heading', { name: '添加创作节点', exact: true })).toBeVisible()
  await page.goto('/activity/director-master')
  await expect(page.getByRole('heading', { name: '光影接力导演挑战', exact: true })).toBeVisible()
  await page.goto('/detail/demo-work-frost-river/process')
  await expect(page.getByText('只读模式；复制会在当前浏览器创建一个新项目')).toBeVisible()
  await page.goto('/view/batch3-missing-work')
  await expect(page.getByRole('heading', { name: '作品暂不可用' })).toBeVisible()
  await page.goto('/batch3-missing/deep/path')
  await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible()
  await page.getByRole('link', { name: '返回首页', exact: true }).click()
  await expect(page.getByRole('heading', { name: '只需一张画布 连接你的多种创意想法' })).toBeVisible()
  await page.goto(projectUrl)
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(nodeCount)
  await expect(page.getByRole('button', { name: '角色参考', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('controlled director input retains proposal gating, dependency confirmation and focus return', async ({ page }) => {
  const generations: string[] = []
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().startsWith('https://fixture.seedream.invalid/')) {
      generations.push(request.url())
    }
  })
  await createFixtureCinematicProject(page)
  await page.getByRole('button', { name: '适配画布' }).click()
  await page.getByRole('button', { name: '角色参考', exact: true }).click()
  const nodeCount = await page.locator('.react-flow__node').count()
  await page.getByRole('button', { name: 'Agent', exact: true }).click()
  const agent = page.getByRole('complementary', { name: 'Agent 工作区' })
  const input = agent.getByRole('textbox', { name: '告诉我下一步要做什么' })
  await input.fill('删除这个节点')
  await agent.getByRole('button', { name: '提交给 AI 导演' }).click()
  await expect(agent.getByText('删除所选节点；相关下游内容会标记为来源已变更。')).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(nodeCount)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await agent.getByRole('button', { name: '执行', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '删除“角色参考”？' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('listitem').filter({ hasText: '分镜 01' })).toBeVisible()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(input).toBeFocused()
  await expect(page.locator('.react-flow__node')).toHaveCount(nodeCount)
  await expect(page.getByLabel('角色参考 → 分镜 01', { exact: true })).toBeVisible()
  await input.fill('删除这个节点')
  await agent.getByRole('button', { name: '提交给 AI 导演' }).click()
  await input.fill('先不要删除')
  await expect(agent.getByRole('button', { name: '执行', exact: true })).toHaveCount(0)
  expect(generations).toEqual([])
})
