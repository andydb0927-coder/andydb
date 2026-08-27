import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createFixtureCinematicProject, expect, test, type Page } from './provider-fixture'

const phase = process.env.QA_EVIDENCE_PHASE === 'before' ? 'before' : 'after'
const evidence = resolve('..', 'docs/qa/evidence', phase)
const pages = [
  ['home', '/'], ['projects', '/projects'], ['works', '/works'], ['skills', '/agents'],
  ['challenges', '/challenges'], ['tutorials', '/tutorials'], ['membership', '/membership'],
  ['help', '/help'], ['tutorial-detail', '/tutorials/add-node'],
  ['challenge-detail', '/activity/director-master'], ['work-detail', '/detail/demo-work-frost-river'],
  ['creation-process', '/detail/demo-work-frost-river/process'], ['missing-share', '/view/qa-not-published'],
] as const

async function capture(page: Page, name: string) {
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: resolve(evidence, `${name}.png`), animations: 'disabled' })
}

test('stabilization: zoom controls have readable icons in default and hover states', async ({ page }) => {
  await page.goto('/projects/new')
  for (const name of ['Zoom In', 'Zoom Out', 'Fit View']) {
    const control = page.getByRole('button', { name, exact: true })
    await expect(control).toBeInViewport()
    for (const hovered of [false, true]) {
      if (hovered) await control.hover()
      const contrast = await control.evaluate((element) => {
        const style = getComputedStyle(element)
        const icon = element.querySelector('svg')
        if (!icon) throw new Error('缩放控件缺少图标')
        const luminance = (color: string) => {
          const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number)
          if (channels?.length !== 3) throw new Error(`无法解析控件颜色：${color}`)
          const linear = channels.map((channel) => {
            const value = channel / 255
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
          })
          return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
        }
        const foreground = luminance(getComputedStyle(icon).fill)
        const background = luminance(style.backgroundColor)
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
      })
      await capture(page, `zoom-controls-${name.replaceAll(' ', '-')}-${hovered ? 'hover' : 'default'}`)
      expect(contrast, `${name} ${hovered ? 'hover' : 'default'}`).toBeGreaterThanOrEqual(3)
    }
  }
  for (const [width, height] of [[1440, 900], [1024, 900], [800, 778], [721, 778], [720, 450]]) {
    await page.setViewportSize({ width, height })
    expect((await page.locator('.react-flow__controls').boundingBox())?.width).toBeLessThanOrEqual(40)
    for (const name of ['Zoom In', 'Zoom Out', 'Fit View']) {
      const control = page.getByRole('button', { name, exact: true })
      await expect(control).toBeInViewport()
      // Hover performs real hit testing; visible-but-covered controls must fail.
      await control.hover()
    }
  }
  await page.getByRole('button', { name: '显示小地图', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom Out', exact: true }).hover()
  await capture(page, 'zoom-controls-720-minimap')
  await page.getByRole('button', { name: 'Agent', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Agent 工作区' })).toBeVisible()
  await page.getByRole('button', { name: 'Zoom Out', exact: true }).hover()
})

test('stabilization: project edits survive reload without leaking into another project', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/projects/new')
  await page.getByRole('button', { name: '添加节点', exact: true }).click()
  await page.getByRole('menuitem', { name: '图片', exact: true }).click()
  const firstProject = page.url()
  await page.getByRole('textbox', { name: '提示词', exact: true }).fill('项目甲独有的蓝色古桥')
  await page.getByRole('button', { name: '图片生成参数' }).click()
  const parameters = page.getByRole('dialog', { name: '图片生成参数' })
  await parameters.getByRole('button', { name: '21:9', exact: true }).click()
  await parameters.getByRole('button', { name: '2张', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '图片 01', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '提示词', exact: true })).toHaveText('项目甲独有的蓝色古桥')
  await expect(page.getByRole('button', { name: '图片生成参数' })).toContainText('2张')
  await capture(page, 'project-a-reloaded')
  await page.goto('/projects/new')
  const secondProject = page.url()
  expect(secondProject).not.toBe(firstProject)
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await page.goto(firstProject)
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await page.getByRole('button', { name: '图片 01', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '提示词', exact: true })).toHaveText('项目甲独有的蓝色古桥')
  expect(errors).toEqual([])
})

test('stabilization: timeline editing and project return are recoverable at narrow widths', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await createFixtureCinematicProject(page)
  const canvasUrl = page.url()
  await page.getByRole('button', { name: '适配画布' }).click()
  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await page.getByRole('button', { name: '加入时间线', exact: true }).click()
  await page.getByRole('button', { name: '发布与分享', exact: true }).click()
  await page.getByRole('menuitem', { name: '预览', exact: true }).click()
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()
  for (const width of [1440, 1024, 721, 720]) {
    await page.setViewportSize({ width, height: width === 720 ? 450 : 900 })
    await page.getByRole('button', { name: '选择图片 01', exact: true }).click()
    await page.getByLabel('片段变速', { exact: true }).fill('2')
    await expect(page.getByLabel('变速后时长')).toHaveText('2.50 秒')
    await capture(page, `timeline-${width}`)
  }
  await page.reload()
  await expect(page.getByLabel('片段变速', { exact: true })).toHaveValue('2')
  await page.goto(canvasUrl)
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  expect(errors).toEqual([])
})

test('stabilization: node-list regeneration must preserve prompt eligibility', async ({ page }) => {
  let videoRequests = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/contents/generations/tasks')) videoRequests += 1
  })
  await page.goto('/projects/new')
  await page.getByRole('button', { name: '添加节点', exact: true }).click()
  await page.getByRole('menuitem', { name: '视频', exact: true }).click()
  const prompt = page.getByRole('textbox', { name: '提示词', exact: true })
  await prompt.fill('')
  await capture(page, 'empty-video-generation')
  await expect(page.getByRole('button', { name: /生成视频，预计成本/ })).toBeDisabled()
  await page.getByRole('button', { name: '节点列表', exact: true }).click()
  await page.getByRole('button', { name: '重生成 视频 01', exact: true }).click()
  // The list is an alternate entry, not permission to bypass an empty-prompt gate.
  await expect(page.getByText('请输入提示词或添加参考素材后再生成。', { exact: true })).toBeVisible()
  expect(videoRequests).toBe(0)
})

test('stabilization: four image results and remaining node panels render without page errors', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/projects/new')
  await page.getByRole('button', { name: '添加节点', exact: true }).click()
  await page.getByRole('menuitem', { name: '图片', exact: true }).click()
  await page.getByRole('textbox', { name: '提示词', exact: true }).fill('fixture稳定化四张图片')
  await page.getByRole('button', { name: '图片生成参数' }).click()
  await page.getByRole('dialog', { name: '图片生成参数' }).getByRole('button', { name: '4张', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '生成图片，预计成本 72' }).click()
  await page.getByRole('button', { name: '确认生成 4 张图片' }).click()
  await expect(page.getByText('Seedream 5.0 Pro结果已保存到项目与生成历史。')).toBeVisible()
  await page.getByRole('button', { name: 'Zoom Out', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom Out', exact: true }).click()
  await page.getByRole('button', { name: '查看 4 张结果', exact: true }).click()
  await expect(page.locator('.image-results-grid img')).toHaveCount(4)
  await capture(page, 'image-four-results')
  const resultGridBounds = await page.locator('.image-results-grid').boundingBox()
  const composerBounds = await page.locator('.creative-node-composer').boundingBox()
  expect(resultGridBounds).not.toBeNull()
  expect(composerBounds).not.toBeNull()
  expect(resultGridBounds!.y + resultGridBounds!.height).toBeLessThanOrEqual(composerBounds!.y)
  await page.getByRole('button', { name: '适配画布', exact: true }).click()
  for (const result of [1, 2, 3, 4]) {
    await page.getByRole('button', { name: `下载结果 ${result}`, exact: true }).hover()
  }
  await capture(page, 'image-four-results')
  await expect(page.getByRole('complementary', { name: '图片 01评论' })).toBeVisible()
  await page.getByRole('textbox', { name: '评论内容', exact: true }).fill('这是隔离测试项目的评论')
  await page.getByRole('button', { name: '添加评论', exact: true }).click()
  await expect(page.getByText('评论已保存到本地', { exact: true })).toBeVisible()
  await capture(page, 'canvas-comments')
  await page.getByRole('button', { name: '折叠评论面板' }).click()
  let count = 1
  for (const [type, label] of [
    ['文本', '文本 01 文本参数'], ['视频', '视频 01 生成参数'], ['音频', '音频 01 音频参数'],
    ['智能剪辑 Beta', '智能剪辑 01 智能剪辑参数'], ['导演台 NEW', '导演台 01 导演台参数'],
    ['逐帧拉片 SD2.5', '逐帧拉片 01 逐帧拉片参数'],
  ]) {
    await page.getByRole('button', { name: '添加节点', exact: true }).click()
    await page.getByRole('menuitem', { name: type, exact: true }).click()
    await expect(page.locator('.react-flow__node')).toHaveCount(++count)
    await expect(page.getByRole('region', { name: label, exact: true })).toBeVisible()
    await capture(page, `node-${type.replaceAll(' ', '-')}`)
  }
  await writeFile(resolve(evidence, 'canvas-console.json'), JSON.stringify({ errors, consoleErrors }, null, 2))
  expect(errors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('stabilization: all site routes survive viewport and equivalent zoom matrix', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const results: Array<{ page: string; width: number; zoom: number; cssWidth: number; overflow: number; title: string }> = []
  // Layout-equivalent zoom, not deviceScaleFactor or a claim about browser chrome zoom.
  for (const width of [1440, 1280, 1024, 800, 721, 390]) {
    for (const zoom of width === 390 ? [1] : [1, 1.25, 1.5, 2]) {
      const cssWidth = Math.round(width / zoom)
      await page.setViewportSize({ width: cssWidth, height: Math.round(900 / zoom) })
      for (const [name, path] of pages) {
        await page.goto(path)
        await expect(page.locator('.route-loading')).toHaveCount(0)
        await expect(page.locator('body')).not.toContainText('Unexpected Application Error!')
        await expect.poll(() => page.locator('h1, h2').count()).toBeGreaterThan(0)
        const metrics = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          title: document.querySelector('h1, h2')?.textContent ?? '',
        }))
        results.push({ page: name, width, zoom, cssWidth, ...metrics })
        if ((width === 1440 && zoom === 1) || (width === 721 && zoom === 1) || (width === 390)) {
          await capture(page, `${name}-${width}-${zoom * 100}`)
        }
      }
    }
  }
  await writeFile(resolve(evidence, 'route-matrix.json'), JSON.stringify({ results, errors }, null, 2))
  expect(errors).toEqual([])
})

test('stabilization: navigation failures have a recoverable Chinese screen', async ({ page }) => {
  await page.goto('/qa-route-that-does-not-exist')
  await capture(page, 'unknown-route')
  await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible()
  await page.getByRole('link', { name: '返回首页', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('只需一张画布')
})

test('stabilization: rapid new-project clicks create one project', async ({ page }) => {
  await page.goto('/projects')
  const creation = page.getByRole('link', { name: '新建项目', exact: true }).last()
  await creation.evaluate((element) => {
    // Two same-turn user navigation events expose loader re-entry while save is pending.
    ;(element as HTMLAnchorElement).click()
    ;(element as HTMLAnchorElement).click()
  })
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.goto('/projects')
  await capture(page, 'rapid-create')
  await expect(page.getByText('当前设备上的 1 个项目')).toBeVisible()
})

test('stabilization: product headings remain readable with either system color preference', async ({ page }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toBeVisible()
    const color = await heading.evaluate((element) => getComputedStyle(element).color)
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? []
    await capture(page, `heading-${colorScheme}`)
    // The public home has an explicitly dark surface, independent of OS preference.
    expect(channels).toHaveLength(3)
    expect(Math.min(...channels)).toBeGreaterThan(180)
  }
})

test('stabilization: Skills controls do not force horizontal page overflow', async ({ page }) => {
  for (const width of [1024, 853, 819, 800, 721]) {
    await page.setViewportSize({ width, height: 778 })
    await page.goto('/agents')
    await expect(page.getByRole('combobox', { name: '选择模型', exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2)
  }
})

for (const [width, height] of [[1440, 900], [1280, 900], [1024, 900], [800, 778], [721, 778], [720, 450], [390, 844]]) {
  test(`stabilization: canvas panels and editing at ${width}x${height}`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/projects/new')
    await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
    if (width === 390) {
      await capture(page, 'canvas-390-no-white-screen')
      expect(errors).toEqual([])
      return
    }
    for (const [trigger, label] of [
      ['打开工具箱', '工具箱'], ['资产管理', '资产管理'], ['素材库', '素材库'],
      ['角色库', '角色库'], ['历史记录', '历史'], ['快捷键', '快捷键'], ['教程', '教程'],
    ]) {
      await page.getByRole('button', { name: trigger, exact: true }).click()
      const panel = page.getByRole('complementary', { name: label, exact: true })
      await expect(panel).toBeVisible()
      const close = panel.getByRole('button', { name: `关闭${label}面板` })
      await expect(close).toBeInViewport()
      if (width === 721 || width === 1440) await capture(page, `canvas-${label}-${width}`)
      await close.click()
      await expect(panel).toHaveCount(0)
    }
    await page.getByRole('button', { name: 'Agent', exact: true }).click()
    await expect(page.getByRole('complementary', { name: 'Agent 工作区' })).toBeVisible()
    await page.getByRole('button', { name: '关闭 Agent', exact: true }).click()
    await page.getByRole('button', { name: '添加节点', exact: true }).click()
    await page.getByRole('menuitem', { name: '图片', exact: true }).click()
    const prompt = page.getByRole('textbox', { name: '提示词', exact: true })
    await prompt.fill(`稳定化输入 ${width}：雨夜古桥 / G D L`)
    const node = page.locator('.react-flow__node').first()
    const before = await node.getAttribute('style')
    await prompt.press('Home')
    await prompt.press('Delete')
    await expect(node).toHaveAttribute('style', before ?? '')
    await expect(page.locator('.react-flow__node')).toHaveCount(1)
    await page.getByRole('button', { name: '图片生成参数' }).click()
    await expect(page.getByRole('dialog', { name: '图片生成参数' })).toBeVisible()
    await page.keyboard.press('Escape')
    await capture(page, `canvas-image-${width}x${height}`)
    await page.reload()
    await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
    await expect(page.locator('.react-flow__node')).toHaveCount(1)
    expect(errors).toEqual([])
  })
}
