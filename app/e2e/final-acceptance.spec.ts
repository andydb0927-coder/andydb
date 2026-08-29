import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { expect, test, type Page } from './provider-fixture'
import { resolveOfflineDist, resolveStaticFixtureFile } from './static-dist-fixture'
import { makeProjectFixture } from '../src/test/fixtures'
import { createPublishedWork } from '../src/features/community/community-model'
import { createTimelineProject } from '../src/features/timeline/timeline-project'
import { tutorialCategories } from '../src/features/tutorials/tutorial-catalog'
import { creatorChallenges } from '../src/features/challenges/challenge-catalog'
import type { SubjectAsset } from '../src/features/subjects/subject-model'

const origin = 'https://final-acceptance.fixture.local'
const base = `${origin}/andydb`
const evidence = resolve('../docs/qa/evidence/final-acceptance')
const primary = ['/', '/projects', '/works', '/agents', '/challenges', '/tutorials', '/membership', '/help']
// Hundreds of full-document navigations make trace retain multi-GB duplicate bundles.
// This audit keeps per-route screenshots and structured failure/console evidence instead.
test.use({ trace: 'off' })
// Extract the catalog IDs without importing browser-only import.meta.env in the Node runner.
const demoWorkIds = [...readFileSync(resolve('src/features/community/demo-works.ts'), 'utf8').matchAll(/id: '(demo-work-[^']+)'/g)].map(match => match[1])
const detailRoutes = [
  ...tutorialCategories.flatMap(category => category.lessons.map(lesson => `/tutorials/${lesson.id}`)),
  ...creatorChallenges.map(challenge => `/activity/${challenge.id}`),
  ...demoWorkIds.flatMap(id => [`/detail/${id}`, `/detail/${id}/process`]),
  '/view/final-work', '/subjects/final-subject', '/project/final-project', '/project/final-project/preview',
]

interface ConsoleEntry { route: string; type: string; message: string }
interface LinkResult { source: string; href: string; label: string; destination?: string; failure?: string; external?: boolean }

async function save(name: string, value: unknown) {
  await mkdir(evidence, { recursive: true })
  await writeFile(resolve(evidence, name), JSON.stringify(value, null, 2))
}

async function ready(page: Page) {
  await expect(page.locator('.route-loading')).toHaveCount(0)
  await expect.poll(() => page.locator('h1, h2, [aria-label="项目画布"]').count()).toBeGreaterThan(0)
  await expect(page.locator('body')).not.toContainText('Unexpected Application Error!')
  await page.evaluate(() => document.fonts.ready)
}

async function setup(page: Page) {
  const messages: ConsoleEntry[] = []
  const requests: string[] = []
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') messages.push({ route: page.url(), type: message.type(), message: message.text() })
  })
  page.on('pageerror', error => messages.push({ route: page.url(), type: 'pageerror', message: error.message }))
  const root = resolveOfflineDist()
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) {
      requests.push(url.href)
      await route.abort('blockedbyclient')
      return
    }
    const target = resolveStaticFixtureFile(root, url.pathname)
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2' }
    await route.fulfill({ contentType: types[extname(target)] ?? 'application/octet-stream', body: await readFile(target) })
  })
  await page.goto(`${base}/works`)
  await ready(page)
  const project = makeProjectFixture()
  project.id = 'final-project'; project.title = '终验隔离项目'
  const work = { ...createPublishedWork(project, createTimelineProject(project), { title: '终验隔离作品', description: '仅供本轮隔离验收', author: 'QA', tags: ['终验'] }), id: 'final-work' }
  const subject: SubjectAsset = { id: 'final-subject', name: '终验主体', description: '仅供验收的本地样本', tags: ['终验'], coverUrl: `${base}/demo/character-lin-yuan.png`, sampleImages: [`${base}/demo/character-lin-yuan.png`], sourceProjectId: project.id, createdAt: project.createdAt, updatedAt: project.updatedAt }
  // Fresh Playwright context only: never open or clear a user browser database.
  await page.evaluate(async records => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('wireless-canvas-v1')
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['projects', 'publishedWorks', 'subjects'], 'readwrite')
        tx.objectStore('projects').put(records.project)
        tx.objectStore('publishedWorks').put(records.work)
        tx.objectStore('subjects').put(records.subject)
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error)
      })
    } finally { db.close() }
  }, { project, work, subject })
  return { messages, requests }
}

test('final acceptance: every catalog route and rendered link has a clean reachable destination', async ({ page }) => {
  test.setTimeout(900_000)
  await page.setViewportSize({ width: 1440, height: 1024 })
  const { messages, requests } = await setup(page)
  const routes: string[] = []
  const links: LinkResult[] = []
  try {
    for (const path of [...primary, ...detailRoutes]) {
      await page.goto(`${base}${path}`)
      await ready(page)
      await expect(page.getByRole('heading', { name: /页面不存在|作品不存在|主体不存在|项目不存在/ })).toHaveCount(0)
      routes.push(path)
      if (primary.includes(path) || path === '/view/final-work' || path === '/subjects/final-subject') {
        await page.screenshot({ path: resolve(evidence, `route-${path.replaceAll('/', '-') || 'home'}.png`), fullPage: true })
      }
      const anchors = await page.locator('a[href]').evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => ({ href: element.getAttribute('href')!, label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '' })))
      // Each page/target pair is clicked; duplicate logo/footer links to the same target are counted once.
      const unique = [...new Map(anchors.map(anchor => [anchor.href, anchor])).values()]
      for (const anchor of unique) {
        const result: LinkResult = { source: path, ...anchor }; links.push(result)
        try {
          const target = new URL(anchor.href, page.url())
          // External informational links are audited in the in-app browser, not fetched
          // by the fixture-only network sandbox. Never count these as verified locally.
          if (target.origin !== origin) { result.external = true; continue }
          if (page.url() !== `${base}${path}`) { await page.goto(`${base}${path}`); await ready(page) }
          const locator = page.locator('a[href]').filter({ visible: true }).and(page.locator(`a[href=${JSON.stringify(anchor.href)}]`)).first()
          await locator.click({ timeout: 10_000 })
          await ready(page)
          await expect(page.getByRole('heading', { name: /页面不存在|作品不存在|主体不存在|项目不存在/ })).toHaveCount(0)
          if (target.hash) {
            const hash = decodeURIComponent(target.hash.slice(1))
            await expect(page.locator(`[id=${JSON.stringify(hash)}]`)).toHaveCount(1)
          } else if (target.pathname.endsWith('/projects/new')) {
            await expect(page).toHaveURL(/\/project\/[^/?#]+$/)
          } else {
            await expect(page).toHaveURL(target.href)
          }
          result.destination = page.url()
        } catch (error) {
          result.failure = error instanceof Error ? error.message : String(error)
          await page.screenshot({ path: resolve(evidence, `broken-link-${links.length}.png`) })
        }
      }
    }
  } finally { await save('routes-links-console.json', { routes, links, messages, externalRequests: requests }) }
  expect(links.filter(link => link.failure)).toEqual([])
  expect(messages).toEqual([])
  expect(requests).toEqual([])
})

test('final acceptance: five viewport primary routes and canvas actions remain reachable without warnings', async ({ page }) => {
  test.setTimeout(240_000)
  const { messages, requests } = await setup(page)
  const results: Array<{ width: number; route: string; overflow: number }> = []
  try {
    for (const width of [1440, 1280, 1024, 721, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      for (const path of [...primary, '/view/final-work', '/subjects/final-subject', '/project/final-project/preview']) {
        await page.goto(`${base}${path}`); await ready(page)
        results.push({ width, route: path, overflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) })
        if (path.endsWith('/preview')) await page.screenshot({ path: resolve(evidence, `preview-${width}.png`) })
        if (path === '/help') {
          await page.getByRole('searchbox', { name: '搜索帮助内容' }).fill('二维码')
          await expect(page.getByText('如何导出作品 PNG 长图？')).toBeVisible()
        }
      }
      await page.goto(`${base}/projects/new`)
      await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
      if (width !== 390) {
        for (const name of ['Zoom In', 'Zoom Out', 'Fit View']) await page.getByRole('button', { name, exact: true }).hover()
        await page.getByRole('button', { name: '添加节点', exact: true }).click()
        await page.getByRole('menuitem', { name: '图片', exact: true }).click()
        await page.getByRole('button', { name: '适配画布', exact: true }).click()
        await page.getByRole('textbox', { name: '提示词', exact: true }).fill('终验：不提交生成')
        await expect(page.getByRole('textbox', { name: '提示词', exact: true })).toHaveText('终验：不提交生成')
        await page.getByRole('button', { name: '图片生成参数', exact: true }).click()
        await page.getByRole('dialog', { name: '图片生成参数' }).getByRole('button', { name: '9:16', exact: true }).click()
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: '发布与分享', exact: true }).click()
        await page.getByRole('menuitem', { name: '导出画布', exact: true }).hover()
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Agent', exact: true }).click()
        await expect(page.getByRole('complementary', { name: 'Agent 工作区' })).toBeVisible()
        await page.getByRole('button', { name: 'Zoom Out', exact: true }).hover()
      }
      await page.screenshot({ path: resolve(evidence, `canvas-${width}.png`) })
    }
  } finally { await save('viewport-console.json', { results, messages, externalRequests: requests }) }
  // The agreed 390px criterion is no blank screen; desktop/tablet must avoid page overflow.
  expect(results.filter(result => result.width !== 390 && result.overflow > 1)).toEqual([])
  expect(messages).toEqual([])
  expect(requests).toEqual([])
})
