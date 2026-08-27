import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createFixtureCinematicProject, expect, test, type Page } from './provider-fixture'
import { runSelectedNodeManagementAction } from './canvas-node-actions'
import type { Project } from '../src/features/project/model'

async function createSourceVideo(page: Page) {
  // 720p / 24fps source meets the official input contract; no paid API request.
  const media = await readFile(resolve('e2e/fixtures/video-continue-source.mp4'))
  await page.route('https://media.fixture.invalid/*.mp4', route => route.fulfill({
    contentType: 'video/mp4', headers: { 'access-control-allow-origin': '*' }, body: media,
  }))
  await createFixtureCinematicProject(page)
  await page.getByRole('button', { name: '适配画布' }).click()
  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await runSelectedNodeManagementAction(page, '生成视频')
  const video = page.getByRole('button', { name: '视频 01', exact: true })
  await expect(video.locator('video')).toHaveAttribute('src', 'https://media.fixture.invalid/video-preview.mp4')
  await video.click()
  return video
}

async function storedProject(page: Page): Promise<Project> {
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  return page.evaluate(async () => new Promise((resolve, reject) => {
    const open = indexedDB.open('wireless-canvas-v1')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('projects', 'readonly')
      const read = tx.objectStore('projects').get(location.pathname.split('/').at(-1)!)
      read.onsuccess = () => resolve(read.result)
      read.onerror = () => reject(read.error)
      tx.oncomplete = () => db.close()
    }
  }))
}

test('confirms continuation without reshoot/mask fields, then persists both versions and video history', async ({ page }) => {
  const video = await createSourceVideo(page)
  const requests: Record<string, unknown>[] = []
  let polls = 0
  await page.route('https://fixture.seedream.invalid/api/v3/contents/generations/tasks**', async route => {
    if (route.request().method() === 'POST') {
      requests.push(route.request().postDataJSON())
      await route.fulfill({ json: { id: 'continuation-e2e' } })
    } else {
      await route.fulfill({ json: ++polls === 1 ? { status: 'running' } : {
        status: 'succeeded', duration: 5, resolution: '720p', ratio: '16:9',
        content: { video_url: 'https://media.fixture.invalid/video-continued.mp4' },
        usage: { completion_tokens: 216000 },
      } })
    }
  })
  const tools = page.getByRole('toolbar', { name: '视频媒体处理工具' })
  for (const name of ['片段重拍', '智能去字幕']) await expect(tools.getByRole('button', { name })).toBeDisabled()
  await tools.getByRole('button', { name: '智能续写', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: '智能续写' })
  await dialog.getByRole('textbox', { name: '续写描述' }).fill('镜头缓缓推向古桥')
  await expect(dialog).toContainText('官方单价 28 元/百万输出 token')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(requests).toHaveLength(0)
  await expect(tools.getByRole('button', { name: '智能续写', exact: true })).toBeFocused()
  await tools.getByRole('button', { name: '智能续写', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '智能续写' })
  await dialog.getByRole('textbox', { name: '续写描述' }).fill('镜头缓缓推向古桥')
  await expect(dialog.getByText('源视频 5.00 秒 · 比例自适应源视频')).toBeVisible()
  await dialog.getByRole('button', { name: '确认续写并生成' }).click()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0]).toEqual({
    model: 'doubao-seedance-2-0-260128',
    content: [{ type: 'text', text: expect.stringContaining('延长@视频1') },
      { type: 'video_url', video_url: { url: 'https://media.fixture.invalid/video-preview.mp4' }, role: 'reference_video' }],
    duration: 5, ratio: 'adaptive', resolution: '720p', generate_audio: true, watermark: false,
  })
  await expect(video.locator('video')).toHaveAttribute('src', 'https://media.fixture.invalid/video-continued.mp4')
  await expect(page.getByText('Seedance 2.0 视频续写结果已保存到项目与生成历史。')).toBeVisible()
  const saved = await storedProject(page)
  const continued = saved.jobs.find(job => job.providerId === 'ark-video-continue')!
  expect(continued).toMatchObject({ status: 'succeeded', creditsSpent: 135, outputTokens: 216000, estimatedCostCny: 6.048 })
  const node = saved.nodes.find(node => node.id === continued.nodeId)!
  const versionUrls = node.versions.map(version => saved.assets.find(asset => asset.id === version.assetId)?.url)
  expect(versionUrls).toEqual(expect.arrayContaining(['https://media.fixture.invalid/video-preview.mp4', 'https://media.fixture.invalid/video-continued.mp4']))
  await page.reload()
  await expect(page.getByRole('button', { name: '视频 01', exact: true }).locator('video')).toHaveAttribute('src', 'https://media.fixture.invalid/video-continued.mp4')
  await page.getByRole('button', { name: '历史记录', exact: true }).click()
  await page.getByRole('tab', { name: /^视频 \d+$/ }).click()
  await expect(page.getByRole('article', { name: '历史任务 视频 01' }).filter({ hasText: 'Seedance 2.0 视频续写' })).toBeVisible()
})

test('preserves the source on 401 and retries the saved continuation contract after reload at 721px', async ({ page }) => {
  await page.setViewportSize({ width: 721, height: 778 })
  const video = await createSourceVideo(page)
  const requests: Record<string, unknown>[] = []
  await page.route('https://fixture.seedream.invalid/api/v3/contents/generations/tasks**', async route => {
    if (route.request().method() === 'POST') {
      requests.push(route.request().postDataJSON())
      await route.fulfill(requests.length === 1 ? { status: 401, json: { message: 'SECRET fixture-key' } } : { json: { id: 'continue-retry-e2e' } })
    } else await route.fulfill({ json: { status: 'succeeded', duration: 5, content: { video_url: 'https://media.fixture.invalid/video-retry.mp4' } } })
  })
  await page.getByRole('toolbar', { name: '视频媒体处理工具' }).getByRole('button', { name: '智能续写', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '智能续写' })
  await dialog.getByRole('textbox', { name: '续写描述' }).fill('接着走过古桥')
  const confirm = dialog.getByRole('button', { name: '确认续写并生成' })
  await confirm.scrollIntoViewIfNeeded()
  await expect(confirm).toBeInViewport()
  await confirm.click()
  await expect(page.getByText(/视频续写 鉴权失败/)).toBeVisible()
  await expect(page.getByText('SECRET fixture-key')).toHaveCount(0)
  await expect(video.locator('video')).toHaveAttribute('src', 'https://media.fixture.invalid/video-preview.mp4')
  const failed = await storedProject(page)
  expect(failed.jobs.find(job => job.providerId === 'ark-video-continue')).toMatchObject({ status: 'failed', generationConfig: { parameters: { videoPostOperation: 'continue' } } })
  await page.reload()
  await page.getByRole('button', { name: '适配画布' }).click()
  await page.getByRole('button', { name: '视频 01', exact: true }).click()
  await page.getByRole('button', { name: '重试生成' }).click()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1]).toEqual(requests[0])
  await expect(page.getByRole('button', { name: '视频 01', exact: true }).locator('video')).toHaveAttribute('src', 'https://media.fixture.invalid/video-retry.mp4')
})
