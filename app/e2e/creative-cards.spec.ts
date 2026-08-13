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
  await page
    .getByLabel('描述你想创作的短片')
    .fill('一位女子在潮汐城追寻失踪的弟弟')
  await page.getByRole('radio', { name: /电影感叙事/ }).check()
  await page.getByRole('button', { name: '创建项目' }).click()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
}

async function openAddNodeAtBlank(
  page: Page,
  label: '剧本卡' | '角色卡' | '世界观卡',
  reverse = false,
) {
  const point = await page.locator('.react-flow__pane').evaluate(
    (pane, fromBottomRight) => {
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
          ) {
            continue
          }
          if (target === pane || pane.contains(target)) return { x, y }
        }
      }
      throw new Error('No blank canvas point found')
    },
    reverse,
  )
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

async function connectCards(page: Page, source: string, target: string) {
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
  await page.getByRole('link', { name: '素材与历史' }).click()
  await page.getByLabel('上传本地素材').setInputFiles({
    name: '潮汐城参考.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  })
  await expect(page.getByRole('status')).toHaveText('已导入 潮汐城参考.png')
  await page
    .getByRole('button', { name: '添加 潮汐城参考.png 到项目并打开画布' })
    .click()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()

  await createScriptCard(page)
  await createCharacterCard(page)
  await createWorldviewCard(page)

  await connectCards(page, '雨夜重逢', '林渊角色卡')
  await connectCards(page, '林渊角色卡', '潮汐城世界观')

  const character = page.getByRole('button', { name: '林渊角色卡', exact: true })
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

  await page.getByRole('link', { name: '素材与历史' }).click()
  await page.getByLabel('搜索素材').fill('潮汐城参考')
  await expect(page.getByRole('article', { name: '潮汐城参考.png' })).toHaveCount(1)
  expect(browserErrors).toEqual([])
})
