import { test as base, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

export { expect }
export type { Page } from '@playwright/test'

/** Real provider contracts with a sealed, fake-key transport; never paid API traffic. */
export const test = base.extend({
  page: async ({ page }, use) => {
    let sequence = 0
    await page.route(/https:\/\/[^/]*(?:volcengine|volces|byteplus)\.[^/]+\//, (route) => route.abort('blockedbyclient'))
    await page.route('https://media.fixture.invalid/**', async (route) => {
      const name = basename(new URL(route.request().url()).pathname)
      const video = name.endsWith('.mp4')
      const file = video ? 'video-preview.mp4' : name.startsWith('image-') ? 'shot-river.png' : name
      await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: video ? 'video/mp4' : 'image/png', body: await readFile(video ? resolve('e2e/fixtures/video-result.mp4') : resolve('public/demo', file)) })
    })
    await page.route('https://fixture.seedream.invalid/**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const body = request.method() === 'POST' ? request.postDataJSON() : {}
      if (path.endsWith('/images/generations')) {
        await route.fulfill({ json: { data: [{ url: `https://media.fixture.invalid/image-${++sequence}.png`, size: body.size }] } })
      } else if (path.endsWith('/contents/generations/tasks')) {
        await route.fulfill({ json: { id: `fixture-video-${++sequence}` } })
      } else if (path.includes('/contents/generations/tasks/')) {
        await route.fulfill({ json: { status: 'succeeded', content: { video_url: 'https://media.fixture.invalid/video-preview.mp4' }, duration: 5, ratio: '16:9', resolution: '720p' } })
      } else if (path.endsWith('/chat/completions')) {
        const prompt = String(body.messages.at(-1).content)
        const script = String(body.messages[0].content).includes('chapters')
        const count = Number(prompt.match(/(\d+)\s*场/)?.[1] ?? 2)
        const content = script ? JSON.stringify({ chapters: Array.from({ length: count }, (_, i) => ({ title: `场次 ${String(i + 1).padStart(2, '0')}`, summary: prompt })) }) : `已生成文本：${prompt}`
        await route.fulfill({ json: { choices: [{ message: { content } }], usage: { prompt_tokens: 24, completion_tokens: 20, total_tokens: 44 } } })
      } else {
        throw new Error(`Missing API fixture: ${request.method()} ${path}`)
      }
    })
    await use(page)
  },
})

/** Seed stored recipe media with HTTPS fixture URLs accepted by real adapters. */
export async function createFixtureCinematicProject(page: Page) {
  await page.goto('/projects/new?recipe=cinematic-story')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.evaluate(async () => {
    const projectId = location.pathname.split('/').at(-1)!
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('wireless-canvas-v1')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction('projects', 'readwrite')
        const store = tx.objectStore('projects')
        const read = store.get(projectId)
        read.onsuccess = () => {
          const project = JSON.parse(JSON.stringify(read.result), (_key, value) =>
            typeof value === 'string' && /^\/(?:andydb\/)?demo\//.test(value)
              ? `https://media.fixture.invalid/${value.split('/').at(-1)}` : value)
          store.put(project)
        }
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
    })
  })
  await page.reload()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
}
