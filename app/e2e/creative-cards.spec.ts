import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

const contentTypes: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

async function installOfflineBuildRoute(page: Page) {
  const dist = process.env.PLAYWRIGHT_OFFLINE_DIST
  if (!dist) return
  const distRoot = resolve(process.cwd(), dist)
  await page.route('http://wireless-canvas.local/**', async (route) => {
    const url = new URL(route.request().url())
    const relativePath = url.pathname.replace(/^\/+/, '')
    const requestedPath = resolve(distRoot, relativePath || 'index.html')
    const insideDist =
      requestedPath === distRoot || requestedPath.startsWith(`${distRoot}/`)
    const assetRequest = insideDist && extname(requestedPath).length > 0
    const filePath = assetRequest ? requestedPath : resolve(distRoot, 'index.html')
    try {
      await route.fulfill({
        status: 200,
        contentType: contentTypes[extname(filePath)] ?? 'application/octet-stream',
        body: await readFile(filePath),
      })
    } catch {
      await route.fulfill({ status: 404, body: 'Not found' })
    }
  })
}

async function createCinematicProject(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: '新建项目', exact: true }).click()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
}

async function findBlankCanvasPoint(page: Page, reverse = false) {
  return page.locator('.react-flow__pane').evaluate((pane, fromBottomRight) => {
    const rect = pane.getBoundingClientRect()
    const xs: number[] = []
    const ys: number[] = []
    for (let x = rect.left + 120; x <= rect.right - 48; x += 44) xs.push(x)
    for (let y = rect.top + 76; y <= rect.bottom - 148; y += 44) ys.push(y)
    if (fromBottomRight) {
      xs.reverse()
      ys.reverse()
    }
    for (const y of ys) {
      for (const x of xs) {
        const target = document.elementFromPoint(x, y)
        if (!target) continue
        if (
          target.closest(
            '.react-flow__node, .canvas-mode-bar, .canvas-context-menu, .director-composer, .react-flow__controls',
          )
        ) continue
        if (target === pane || pane.contains(target)) return { x, y }
      }
    }
    throw new Error('No blank canvas point found')
  }, reverse)
}

async function uploadReferenceToCanvas(page: Page) {
  const point = await findBlankCanvasPoint(page, true)
  await page.mouse.click(point.x, point.y, { button: 'right' })
  await page.getByRole('menuitem', { name: '上传' }).click()

  const dialog = page.getByRole('dialog', { name: '上传图片到画布' })
  await dialog.getByLabel('标题').fill('潮汐城参考.png')
  await dialog.getByLabel('本地图片').setInputFiles({
    name: '潮汐城参考.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  })
  await dialog.getByRole('button', { name: '确认创建' }).click()

  const reference = page.getByRole('button', {
    name: '潮汐城参考.png',
    exact: true,
  })
  await expect(reference).toBeVisible()
  await reference.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '保存到我的资产' }).click()
  await expect(page.getByText('已将“潮汐城参考.png”保存到我的资产。')).toBeVisible()
}

async function openAddNodeAtBlank(
  page: Page,
  label: '剧本卡' | '角色卡' | '世界观卡',
  reverse = false,
) {
  const point = await findBlankCanvasPoint(page, reverse)
  await page.mouse.click(point.x, point.y, { button: 'right' })
  await page.getByRole('menuitem', { name: '添加节点' }).click()
  await page.getByRole('menuitem', { name: label }).click()
}

async function createScriptCard(page: Page) {
  await openAddNodeAtBlank(page, '剧本卡')
  const dialog = page.getByRole('dialog', { name: '创建剧本卡' })
  await dialog.getByLabel('标题').fill('雨夜重逢')
  await dialog.getByLabel('分场').fill('场一：河岸夜外')
  await dialog.getByLabel('对白').fill('林渊：你终于来了。')
  await dialog.getByLabel('镜头备注').fill('从远景缓慢推近。')
  await dialog.getByLabel('引用图片素材').selectOption({ label: '潮汐城参考.png' })
  await dialog.getByRole('button', { name: '确认创建' }).click()
  await expect(page.getByRole('button', { name: '雨夜重逢', exact: true })).toBeVisible()
}

async function createCharacterCard(page: Page) {
  await openAddNodeAtBlank(page, '角色卡', true)
  const dialog = page.getByRole('dialog', { name: '创建角色卡' })
  await dialog.getByLabel('标题').fill('林渊角色卡')
  await dialog.getByLabel('姓名').fill('林渊')
  await dialog.getByLabel('外貌锚点').fill('短发，右眼下有小痣')
  await dialog.getByLabel('服化道').fill('深灰长风衣，银色旧腕表')
  await dialog.getByLabel('关系').fill('林舟的姐姐')
  await dialog.getByLabel('引用图片素材').selectOption({ label: '潮汐城参考.png' })
  await dialog.getByRole('button', { name: '确认创建' }).click()
  await expect(page.getByRole('button', { name: '林渊角色卡', exact: true })).toBeVisible()
}

async function createWorldviewCard(page: Page) {
  await openAddNodeAtBlank(page, '世界观卡')
  const dialog = page.getByRole('dialog', { name: '创建世界观卡' })
  await dialog.getByLabel('标题').fill('潮汐城世界观')
  await dialog.getByLabel('背景').fill('每年雨季老城会被河水淹没三天')
  await dialog.getByLabel('美术风格').fill('低饱和蓝绿色，湿润胶片颗粒')
  await dialog.getByLabel('规则').fill('铜铃响起后不得直呼失踪者姓名')
  await dialog.getByLabel('引用图片素材').selectOption({ label: '潮汐城参考.png' })
  await dialog.getByRole('button', { name: '确认创建' }).click()
  await expect(
    page.getByRole('button', { name: '潮汐城世界观', exact: true }),
  ).toBeVisible()
}

async function fitCreatedCardsIntoView(page: Page, titles: string[]) {
  const fitView = page.getByRole('button', { name: '适配画布', exact: true })
  await fitView.scrollIntoViewIfNeeded()
  await expect(fitView).toBeInViewport()
  await fitView.click()
  await page.locator('.react-flow__viewport').evaluate(
    (viewport) =>
      new Promise<void>((resolve) => {
        let previousTransform = viewport.getAttribute('style')
        let stableFrames = 0
        const waitForStableTransform = () => {
          const transform = viewport.getAttribute('style')
          stableFrames = transform === previousTransform ? stableFrames + 1 : 0
          previousTransform = transform
          if (stableFrames >= 3) {
            resolve()
            return
          }
          requestAnimationFrame(waitForStableTransform)
        }
        requestAnimationFrame(waitForStableTransform)
      }),
  )

  const canvas = page.locator('.react-flow')
  for (const title of titles) {
    const node = page.getByRole('button', { name: title, exact: true })
    await expect.poll(async () => {
      const canvasBox = await canvas.boundingBox()
      const nodeBox = await node.boundingBox()
      return Boolean(
        canvasBox &&
          nodeBox &&
          nodeBox.x >= canvasBox.x &&
          nodeBox.y >= canvasBox.y &&
          nodeBox.x + nodeBox.width <= canvasBox.x + canvasBox.width &&
          nodeBox.y + nodeBox.height <= canvasBox.y + canvasBox.height,
      )
    }).toBe(true)
  }
}

async function connectCards(page: Page, source: string, target: string) {
  await fitCreatedCardsIntoView(page, [source, target])
  await page.getByRole('button', { name: '连线', exact: true }).click()
  await page.getByRole('button', { name: source, exact: true }).click()
  await page.getByRole('button', { name: target, exact: true }).click()
  await expect(page.getByLabel(`${source} → ${target}`, { exact: true })).toBeVisible()
}

test('creates, links, edits, and reloads structured creative cards', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await installOfflineBuildRoute(page)
  await createCinematicProject(page)
  await uploadReferenceToCanvas(page)

  await createScriptCard(page)
  await createCharacterCard(page)
  await createWorldviewCard(page)

  await connectCards(page, '雨夜重逢', '林渊角色卡')
  await connectCards(page, '林渊角色卡', '潮汐城世界观')

  const character = page.getByRole('button', { name: '林渊角色卡', exact: true })
  await fitCreatedCardsIntoView(page, ['林渊角色卡'])
  await character.click()
  const edit = page.getByRole('button', { name: '编辑卡片' })
  await edit.click()
  const editor = page.getByRole('dialog', { name: '编辑角色卡' })
  await editor.getByLabel('关系').fill('林舟的姐姐，与程野有旧日心结')
  await editor.getByRole('button', { name: '确认保存' }).click()
  await expect(edit).toBeFocused()
  await expect(character).toContainText('与程野有旧日心结')

  await expect(page.getByText('已保存', { exact: true }).first()).toBeVisible()
  await page.reload()
  await fitCreatedCardsIntoView(page, [
    '雨夜重逢',
    '林渊角色卡',
    '潮汐城世界观',
  ])
  await expect(page.getByRole('button', { name: '雨夜重逢', exact: true })).toContainText(
    '场一：河岸夜外',
  )
  await expect(page.getByRole('button', { name: '林渊角色卡', exact: true })).toContainText(
    '与程野有旧日心结',
  )
  await expect(
    page.getByRole('button', { name: '潮汐城世界观', exact: true }),
  ).toContainText('湿润胶片颗粒')
  for (const title of ['雨夜重逢', '林渊角色卡', '潮汐城世界观']) {
    await expect(
      page.getByRole('button', { name: title, exact: true }).locator('img'),
    ).toHaveCount(1)
  }
  await expect(page.getByLabel('雨夜重逢 → 林渊角色卡', { exact: true })).toBeVisible()
  await expect(page.getByLabel('林渊角色卡 → 潮汐城世界观', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '打开资产' }).click()
  const assets = page.getByRole('complementary', { name: '资产' })
  await expect(assets.getByText('潮汐城参考.png', { exact: true })).toBeVisible()
  expect(browserErrors).toEqual([])
})
