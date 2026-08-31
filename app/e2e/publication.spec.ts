import { expect, test, type Page } from './provider-fixture'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function blankCanvasPoint(page: Page) {
  return page.locator('.react-flow__pane').evaluate((pane) => {
    const rect = pane.getBoundingClientRect()
    for (let y = rect.top + 100; y < rect.bottom - 160; y += 48) {
      for (let x = rect.left + 120; x < rect.right - 80; x += 48) {
        const target = document.elementFromPoint(x, y)
        if (!target?.closest('.react-flow__node, .canvas-mode-bar, .react-flow__controls')) {
          return { x, y }
        }
      }
    }
    throw new Error('No blank canvas point found')
  })
}

async function uploadCoverResult(page: Page) {
  const point = await blankCanvasPoint(page)
  await page.mouse.click(point.x, point.y, { button: 'right' })
  const fileChooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: '上传' }).click()
  await (await fileChooser).setFiles({
    name: '发布封面.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  })
  await expect(page.getByRole('button', { name: '发布封面.png', exact: true })).toBeVisible()
}

test('publishes locally, lists the work, copies its share link and renders the read-only view', async ({ page, context }) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  await page.goto('/projects/new')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  const projectUrl = page.url()
  await uploadCoverResult(page)

  await page.getByRole('button', { name: '发布与分享' }).click()
  await page.getByRole('menuitem', { name: '发布到本地作品' }).click()
  const dialog = page.getByRole('dialog', { name: '发布作品' })
  await dialog.getByRole('textbox', { name: '作品标题' }).fill('雨夜重逢 · 本地发布')
  await dialog.getByRole('textbox', { name: '作品简介' }).fill('从画布发布并生成只读分享页。')
  await dialog.getByRole('textbox', { name: '作品标签' }).fill('雨夜, 电影, 测试')
  await dialog.getByRole('button', { name: '发布到本地作品' }).click()
  await expect(page.getByText('“雨夜重逢 · 本地发布”已发布到本地作品页。')).toBeVisible()

  await page.getByRole('link', { name: '作品', exact: true }).click()
  await expect(page).toHaveURL(/\/works$/)
  await expect(page.getByRole('heading', { name: '雨夜重逢 · 本地发布' })).toBeVisible()
  const workLink = page.getByRole('link', { name: '查看作品 雨夜重逢 · 本地发布' })
  const viewPath = await workLink.getAttribute('href')
  expect(viewPath).toMatch(/^\/view\/[^/]+$/)

  await page.goto(projectUrl)
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await page.getByRole('button', { name: '发布与分享' }).click()
  await page.getByRole('menuitem', { name: '复制分享链接' }).click()
  await expect(page.getByText('分享链接已复制。本地演示，未发布到云端。')).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toMatch(
    /^https:\/\/andydb0927-coder\.github\.io\/andydb\/view\/[^/]+$/,
  )

  await page.goto(viewPath!)
  await expect(page.getByRole('heading', { name: '雨夜重逢 · 本地发布' })).toBeVisible()
  await expect(page.getByText('从画布发布并生成只读分享页。')).toBeVisible()
  await expect(page.getByRole('img', { name: '雨夜重逢 · 本地发布画布快照' })).toBeVisible()
  await expect(page.getByText('只读作品')).toBeVisible()
  await expect(page.getByText('本地演示，未发布到云端')).toBeVisible()

  expect(browserErrors).toEqual([])
})
