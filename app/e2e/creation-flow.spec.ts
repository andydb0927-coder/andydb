import { test, expect } from '@playwright/test'

import { runSelectedNodeManagementAction } from './canvas-node-actions'

async function createCinematicProject(page: import('@playwright/test').Page) {
  await page.goto('/projects/new?recipe=cinematic-story')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
}

async function openPreview(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '发布与分享' }).click()
  await page
    .getByRole('menu', { name: '发布与分享菜单' })
    .getByRole('menuitem', { name: '预览', exact: true })
    .click()
}

async function findBlankCanvasPoint(
  page: import('@playwright/test').Page,
  fromBottomRight = false,
) {
  const viewport = page.locator('.react-flow__viewport')
  let previousTransform = ''
  await expect
    .poll(async () => {
      const transform = (await viewport.getAttribute('style')) ?? ''
      const stable = transform === previousTransform
      previousTransform = transform
      return stable
    })
    .toBe(true)

  return page.locator('.react-flow__pane').evaluate(
    (pane, reverse) => {
      const rect = pane.getBoundingClientRect()
      const xs: number[] = []
      const ys: number[] = []
      for (let x = rect.left + 120; x <= rect.right - 48; x += 44) xs.push(x)
      for (let y = rect.top + 76; y <= rect.bottom - 148; y += 44) ys.push(y)
      if (reverse) {
        xs.reverse()
        ys.reverse()
      }

      for (const y of ys) {
        for (const x of xs) {
          const target = document.elementFromPoint(x, y)
          if (!target) continue
          if (
            target.closest(
              '.react-flow__node, .react-flow__edge, .dependency-edge__insert, .react-flow__attribution, .canvas-mode-bar, .canvas-context-menu, .director-composer, .react-flow__controls, button, a, input, textarea, select, [role="button"]',
            )
          ) {
            continue
          }
          if (target === pane || pane.contains(target)) return { x, y }
        }
      }

      throw new Error('No blank canvas point found')
    },
    fromBottomRight,
  )
}

async function openAddNodeAtBlank(
  page: import('@playwright/test').Page,
  label:
    | '文本'
    | '图片'
    | '视频'
    | '智能剪辑 Beta'
    | '导演台 NEW'
    | '逐帧拉片 SD2.5'
    | '音频'
    | '脚本'
    | '素材库',
  fromBottomRight = false,
) {
  const point = await findBlankCanvasPoint(page, fromBottomRight)
  await page.mouse.click(point.x, point.y, { button: 'right' })
  await page.getByRole('menuitem', { name: '添加节点' }).click()
  await page.getByRole('menuitem', { name: label }).click()
}

async function openUploadAtBlank(page: import('@playwright/test').Page) {
  const point = await findBlankCanvasPoint(page, true)
  await page.mouse.click(point.x, point.y, { button: 'right' })
  const fileChooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: '上传' }).click()
  return fileChooser
}

test('creator completes the minimum short-film loop', async ({ page }) => {
  await createCinematicProject(page)

  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await runSelectedNodeManagementAction(page, '扩展镜头')
  await expect(
    page.getByRole('button', { name: '分镜 02', exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await runSelectedNodeManagementAction(page, '生成视频')
  await expect(
    page.getByRole('button', { name: '视频 01', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('toolbar', { name: '画布模式工具' })
    .getByRole('button', { name: '添加节点' })
    .click()
  const addMenu = page.getByRole('menu', { name: '添加节点' })
  const historyAction = addMenu.getByRole('menuitem', {
    name: '从生成历史选择',
  })
  await expect(historyAction).toBeEnabled()
  await historyAction.click()
  const historyPanel = page.getByRole('complementary', { name: '历史' })
  await historyPanel.getByRole('tab', { name: '视频 1' }).click()
  await historyPanel
    .getByRole('button', { name: '使用 视频 01' })
    .click()
  await expect(
    page.getByRole('button', { name: '视频 01 历史结果', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '视频 01', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '加入时间线' }).click()

  await page.getByRole('button', { name: '分镜 02', exact: true }).focus()
  await page.keyboard.press('Enter')
  await runSelectedNodeManagementAction(page, '生成视频')
  await expect(
    page.getByRole('button', { name: '视频 02', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '加入时间线' }).click()

  await openPreview(page)
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()
  await page.getByRole('button', { name: '将视频 02 前移' }).click()
  await expect(
    page.getByRole('list', { name: '主视频轨' }).getByRole('listitem').first(),
  ).toContainText('视频 02')
  await page.getByRole('button', { name: '下载时间线 JSON' }).click()
  await expect(page.getByText('JSON 已开始下载')).toBeVisible()
})

test('filters, previews, reuses, resends, and batches generation history', async ({
  page,
}) => {
  await createCinematicProject(page)

  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await runSelectedNodeManagementAction(page, '生成视频')
  await expect(
    page.getByRole('button', { name: '视频 01', exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: '历史记录' }).click()
  const history = page.getByRole('complementary', { name: '历史' })
  await expect(history.getByRole('tab', { name: '视频 1' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await history.getByRole('tab', { name: '图片 0' }).click()
  await expect(history.getByText('暂无图片生成历史')).toBeVisible()
  await history.getByRole('tab', { name: '视频 1' }).click()
  await expect(history.getByRole('heading', { name: '今天' })).toBeVisible()

  await history.getByRole('button', { name: '小缩略图' }).click()
  await expect(history.getByLabel('生成历史内容')).toHaveAttribute(
    'data-thumbnail-size',
    'small',
  )
  await history.getByRole('button', { name: '大缩略图' }).click()

  const view = history.getByRole('button', { name: '查看 视频 01' })
  await view.click()
  const preview = page.getByRole('dialog', { name: '预览 视频 01' })
  await expect(preview.locator('video')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(view).toBeFocused()

  await history.getByRole('button', { name: '使用 视频 01' }).click()
  await expect(
    page.getByRole('button', { name: '视频 01 历史结果', exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: '历史记录' }).click()
  const resend = history.getByRole('button', { name: '重发画布 视频 01' })
  await resend.click()
  const confirmation = page.getByRole('dialog', { name: '重发画布配置' })
  await expect(confirmation).toContainText('确认完整配置')
  await expect(confirmation).toContainText('模型')
  await expect(confirmation).toContainText('引用 1 项')
  await expect(
    page.getByRole('button', { name: '视频 01 重发', exact: true }),
  ).toHaveCount(0)
  await confirmation.getByRole('button', { name: '确认重新生成' }).click()
  await expect(
    page.getByRole('button', { name: '视频 01 重发', exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: '历史记录' }).click()
  await expect(history.getByRole('tab', { name: '视频 2' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(history.getByText('已完成')).toHaveCount(2)
  await history.getByRole('button', { name: '全选当前页' }).click()
  await expect(history.getByRole('button', { name: '批量删除' })).toBeEnabled()
  await history.getByRole('button', { name: '反选当前页' }).click()
  await expect(history.getByRole('button', { name: '批量删除' })).toBeDisabled()
  await history.getByRole('button', { name: '全选当前页' }).click()
  await history.getByRole('button', { name: '批量删除' }).click()
  await expect(history.getByText('暂无视频生成历史')).toBeVisible()
})

test('keeps one image node expanded and persists a confirmed main result', async ({
  page,
}) => {
  await createCinematicProject(page)
  await page.getByRole('button', { name: '适配画布' }).click()

  const scene = page.getByRole('button', { name: '场景设定', exact: true })
  const character = page.getByRole('button', { name: '角色参考', exact: true })
  await scene.click()
  await expect(page.getByRole('region', { name: '场景设定 生成参数' })).toBeVisible()
  const imageTools = page.getByRole('toolbar', { name: '图片创作工具' })
  await expect(imageTools).toBeVisible()
  await expect(imageTools.getByRole('button')).toHaveCount(11)
  const nodeCount = await page.locator('.react-flow__node').count()
  await imageTools.getByRole('button', { name: '高清' }).click()
  const toolConfirmation = page.getByRole('alertdialog', {
    name: '添加高清工具节点',
  })
  await expect(toolConfirmation).toContainText('将添加工具节点')
  await toolConfirmation.getByRole('button', { name: '取消' }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(nodeCount)

  await character.click()
  await expect(page.getByRole('region', { name: '角色参考 生成参数' })).toBeVisible()
  await expect(page.getByRole('region', { name: '场景设定 生成参数' })).toHaveCount(0)

  await scene.click()
  await page.getByRole('button', { name: '查看 4 张结果' }).click()
  const results = page.getByRole('region', { name: '场景设定 的 4 张结果' })
  await expect(results.getByRole('img')).toHaveCount(4)
  await results.getByRole('button', { name: '将结果 2 设为主图' }).click()
  const confirmation = page.getByRole('alertdialog', { name: '设为主图' })
  await expect(confirmation).toContainText('下游引用将使用新的主图')
  await confirmation.getByRole('button', { name: '确认设为主图' }).click()
  await expect(scene.locator('img')).toHaveAttribute('src', '/demo/shot-river.png')
  await expect(page.getByText('已保存', { exact: true }).first()).toBeVisible()

  await page.reload()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '场景设定', exact: true }).locator('img'),
  ).toHaveAttribute('src', '/demo/shot-river.png')
})

test('renames a media node and accepts prompt input from the composer', async ({
  page,
}) => {
  await createCinematicProject(page)
  await page.getByRole('button', { name: '适配画布' }).click()

  const character = page.getByRole('button', { name: '角色参考', exact: true })
  await character.click()
  const characterFlowNode = page
    .locator('.react-flow__node')
    .filter({ has: character })
  const geometry = await characterFlowNode.evaluate((node) => {
    const card = node.querySelector<HTMLElement>('.creative-node--liblib-media')!
    const composer = node.querySelector<HTMLElement>('.creative-node-composer')!
    const target = node.querySelector<HTMLElement>('.react-flow__handle-left')!
    const source = node.querySelector<HTMLElement>('.react-flow__handle-right')!
    const cardStyle = getComputedStyle(card)
    const composerStyle = getComputedStyle(composer)
    const targetAfter = getComputedStyle(target, '::after')
    const sourceAfter = getComputedStyle(source, '::after')
    return {
      cardWidth: Number.parseFloat(cardStyle.width),
      cardHeight: Number.parseFloat(cardStyle.height),
      composerWidth: Number.parseFloat(composerStyle.width),
      targetContent: targetAfter.content,
      sourceContent: sourceAfter.content,
    }
  })
  expect(geometry.cardWidth).toBe(624)
  expect(geometry.cardWidth / geometry.cardHeight).toBeCloseTo(16 / 9, 2)
  expect(geometry.composerWidth).toBe(660)
  expect(geometry.targetContent).toBe('"+"')
  expect(geometry.sourceContent).toBe('"+"')
  await expect.poll(() => characterFlowNode.evaluate((node) => {
    const target = node.querySelector<HTMLElement>('.react-flow__handle-left')!
    const source = node.querySelector<HTMLElement>('.react-flow__handle-right')!
    return [
      getComputedStyle(target, '::after').opacity,
      getComputedStyle(source, '::after').opacity,
    ]
  })).toEqual(['1', '1'])

  const title = characterFlowNode
    .getByRole('textbox', { name: '节点名称' })
  await title.fill('雨夜角色')
  await title.press('Enter')
  await expect(page.getByRole('button', { name: '雨夜角色', exact: true })).toBeVisible()

  const prompt = page
    .getByRole('region', { name: '雨夜角色 生成参数' })
    .getByRole('textbox', { name: '提示词' })
  await prompt.click()
  await prompt.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await prompt.press('Backspace')
  await prompt.pressSequentially('将背景改为雪夜', { delay: 20 })
  await prompt.blur()
  await expect(prompt).toHaveText('将背景改为雪夜')
  await expect(page.getByText('已保存', { exact: true }).first()).toBeVisible()

  await page.reload()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await expect(page.getByRole('button', { name: '雨夜角色', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '雨夜角色', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '提示词' })).toHaveText(
    '将背景改为雪夜',
  )
})

test('persists image parameters and creates a canvas-selected media reference', async ({
  page,
}) => {
  await createCinematicProject(page)
  await page.getByRole('button', { name: '适配画布' }).click()

  const scene = page.getByRole('button', { name: '场景设定', exact: true })
  await scene.click()
  const panel = page.getByRole('region', { name: '场景设定 生成参数' })
  const parameterTrigger = panel.getByRole('button', { name: '图片生成参数' })
  await expect(parameterTrigger).toContainText('16:9 · 标准画质 · 2K · 1张')
  await parameterTrigger.click()
  const parameterDialog = panel.getByRole('dialog', { name: '图片生成参数' })
  await parameterDialog.getByRole('button', { name: '高画质' }).click()
  await parameterDialog.getByRole('button', { name: '4K' }).click()
  await parameterDialog.getByRole('button', { name: '9:16' }).click()
  await parameterDialog.getByRole('button', { name: '2张' }).click()
  await expect(parameterTrigger).toContainText('9:16 · 高画质 · 4K · 2张')
  await expect(panel.getByText('预计成本 36')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(parameterTrigger).toBeFocused()
  await panel.getByRole('button', { name: '展开高级设置' }).click()
  await expect(panel.getByLabel('风格化程度')).toHaveAttribute('step', '50')
  await expect(panel.getByLabel('怪异度')).toHaveAttribute('step', '50')
  await expect(panel.getByLabel('多样性')).toHaveAttribute('step', '5')
  await panel.getByLabel('个性化风格 P 值').fill('p-e2e-style')
  await panel.getByLabel('个性化风格 P 值').blur()
  await panel.getByLabel('风格化程度').fill('250')
  await panel.getByLabel('智能引用 AutoLink').uncheck()
  await expect(page.getByText('已保存', { exact: true }).first()).toBeVisible()

  const styleTrigger = panel.getByRole('button', { name: '风格' })
  await styleTrigger.click()
  const gallery = page.getByRole('dialog', { name: '风格广场' })
  await expect(gallery.getByRole('tab')).toHaveCount(3)
  await expect(
    gallery.getByRole('navigation', { name: '风格分类' }).getByRole('button'),
  ).toHaveCount(10)
  await expect(gallery.getByLabel('仅看可商用')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(styleTrigger).toBeFocused()

  await page.reload()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await scene.click()
  const reloadedPanel = page.getByRole('region', {
    name: '场景设定 生成参数',
  })
  await expect(
    reloadedPanel.getByRole('button', { name: '图片生成参数' }),
  ).toContainText('9:16 · 高画质 · 4K · 2张')
  await expect(reloadedPanel.getByText('预计成本 36')).toBeVisible()
  await reloadedPanel.getByRole('button', { name: '展开高级设置' }).click()
  await expect(reloadedPanel.getByLabel('个性化风格 P 值')).toHaveValue(
    'p-e2e-style',
  )
  await expect(reloadedPanel.getByLabel('风格化程度')).toHaveValue('250')
  await expect(reloadedPanel.getByLabel('智能引用 AutoLink')).not.toBeChecked()

  const imageChooser = await openUploadAtBlank(page)
  await imageChooser.setFiles('public/demo/character-lin-yuan.png')
  const image = page.getByRole('button', {
    name: 'character-lin-yuan.png',
    exact: true,
  })
  await expect(image).toBeVisible()
  await page
    .getByRole('region', { name: 'character-lin-yuan.png 生成参数' })
    .getByRole('button', { name: '参考' })
    .click()
  await expect(page.getByRole('region', { name: '从画布选择参考' })).toBeVisible()
  await scene.click()
  await expect(page.getByRole('status')).toContainText(
    '已将“场景设定”设为“character-lin-yuan.png”的参考',
  )
  await expect(
    page.getByLabel('场景设定 → character-lin-yuan.png', { exact: true }),
  ).toBeVisible()
})

test('opens the Liblib image template catalog and inserts one confirmed tool node', async ({
  page,
}) => {
  await createCinematicProject(page)
  await page.getByRole('button', { name: '适配画布' }).click()
  await page.getByRole('button', { name: '场景设定', exact: true }).click()
  const panel = page.getByRole('region', { name: '场景设定 生成参数' })
  const trigger = panel.getByRole('button', { name: '图片创作模板' })

  await trigger.click()
  const catalog = panel.getByRole('dialog', { name: '图片创作模板' })
  await expect(catalog.getByRole('group')).toHaveCount(4)
  await expect(catalog.getByRole('button')).toHaveCount(15)
  await catalog.getByRole('button', { name: '720全景' }).click()
  const confirmation = page.getByRole('alertdialog', {
    name: '添加720全景工具节点',
  })
  await expect(confirmation).toContainText('不会立即消耗积分')
  await confirmation.getByRole('button', { name: '确认添加720全景工具节点' }).click()

  await expect(page.getByRole('button', { name: '720全景', exact: true })).toBeVisible()
  await expect(
    page.getByLabel('场景设定 → 720全景', { exact: true }),
  ).toBeVisible()
})

test('keeps video drafts local and inserts confirmed derived nodes atomically', async ({
  page,
}) => {
  await page.setViewportSize({ width: 721, height: 778 })
  await createCinematicProject(page)
  await page.getByRole('button', { name: '适配画布' }).click()
  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await runSelectedNodeManagementAction(page, '生成视频')

  const video = page.getByRole('button', { name: '视频 01', exact: true })
  await expect(video).toBeVisible()
  const generation = page.getByRole('region', { name: '视频 01 生成参数' })
  await expect(generation).toBeVisible()
  await expect(generation.getByLabel('提示词')).toHaveAttribute('maxlength', '2000')
  await expect(generation.getByLabel('模型')).toHaveValue('mock-seedance-video')
  await expect(
    generation.getByRole('option', { name: /Mock Studio.*Seedance 2.0.*135 积分\/次.*演示/ }),
  ).toBeEnabled()
  await expect(generation.getByText('16:9 · 720P · 5s · 1个')).toBeVisible()
  await expect(generation.getByLabel('声音')).toHaveValue('开启')
  await expect(generation.getByText('预计成本 135')).toBeVisible()
  await generation.getByRole('button', { name: '展开高级设置' }).click()
  await expect(generation.getByLabel('联网搜索')).toBeChecked()
  await expect(generation.getByLabel('自动校验素材')).toBeChecked()
  await expect(generation.getByLabel('智能引用 AutoLink')).toBeChecked()
  await generation.getByRole('button', { name: '收起高级设置' }).click()

  const mediaTools = page.getByRole('toolbar', { name: '视频媒体处理工具' })
  await expect(mediaTools.getByRole('button')).toHaveCount(11)
  await expect(page.getByText(/当前仅支持时长不少于 4 秒/)).toBeVisible()
  await mediaTools.getByRole('button', { name: '剪辑' }).click()
  const clip = page.getByRole('dialog', { name: '剪辑内联编辑器' })
  await expect(clip.getByRole('img', { name: '剪辑帧 12' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(clip).toHaveCount(0)

  const initialNodeCount = await page.locator('.react-flow__node').count()
  await mediaTools.getByRole('button', { name: '高清' }).click()
  const upscaleConfirmation = page.getByRole('alertdialog', {
    name: '添加视频高清工具节点',
  })
  await expect(upscaleConfirmation).toContainText('将添加工具节点')
  await expect(page.locator('.react-flow__node')).toHaveCount(initialNodeCount)
  await upscaleConfirmation.getByRole('button', { name: '确认添加' }).click()
  await expect(page.getByRole('button', { name: '高清（1080P）', exact: true })).toBeVisible()
  const upscale = page.getByRole('region', { name: '视频高清参数' })
  await expect(upscale.getByLabel('模型')).toHaveValue('Topazlabs')
  await expect(upscale.getByLabel('分辨率')).toHaveValue('1080P')
  await expect(upscale.getByText('预计成本 16')).toBeVisible()

  await video.click()
  await generation.getByRole('button', { name: '展开完整视频工具' }).click()
  const frameTools = page.getByRole('toolbar', { name: '帧操作' })
  await frameTools.getByRole('button', { name: '截取当前帧', exact: true }).click()
  const frameConfirmation = page.getByRole('alertdialog', {
    name: '添加截取当前帧工具节点',
  })
  await expect(frameConfirmation).toContainText('将添加工具节点')
  await frameConfirmation.getByRole('button', { name: '确认添加' }).click()
  await expect(page.getByRole('button', { name: '截图', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '截图参数' })).toContainText('当前帧截图')
})

test('keyboard and list view preserve core actions in a strict small layout', async ({
  page,
}) => {
  await createCinematicProject(page)

  const storyboard = page.getByRole('button', {
    name: '分镜 01',
    exact: true,
  })
  const storyboardActions = page.getByLabel('分镜 01操作')
  await expect(storyboardActions).toBeHidden()
  await storyboard.focus()
  await page.keyboard.press('Enter')
  await expect(storyboardActions).toBeVisible()

  const scene = page.getByRole('button', { name: '场景设定', exact: true })
  await scene.focus()
  await page.keyboard.press('Enter')
  await expect(storyboardActions).toBeHidden()

  await storyboard.focus()
  await page.keyboard.press('Space')
  await expect(storyboardActions).toBeVisible()

  await page.getByRole('button', { name: '节点列表' }).click()
  const list = page.getByRole('dialog', { name: '节点列表' })
  const listStoryboard = list.getByRole('button', { name: '选择 分镜 01' })
  await listStoryboard.focus()
  await page.keyboard.press('Enter')
  await expect(listStoryboard).toHaveAttribute('aria-pressed', 'true')
  await list.getByRole('button', { name: '扩展镜头 分镜 01' }).click()
  await expect(list).toBeHidden()
  await expect(page.getByRole('button', { name: '分镜 02', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await runSelectedNodeManagementAction(page, '生成视频')
  await expect(
    page.getByRole('button', { name: '视频 01', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '节点列表' }).click()
  const videoItem = list.getByRole('listitem').filter({ hasText: '视频 01' })
  await videoItem.getByRole('button', { name: '选择 视频 01' }).click()
  await videoItem.getByRole('button', { name: '加入时间线 视频 01' }).click()
  await expect(list).toBeHidden()

  await page.setViewportSize({ width: 640, height: 360 })
  await page.getByRole('button', { name: 'Fit View' }).click()
  const selectedVideo = page.getByRole('button', {
    name: '视频 01',
    exact: true,
  })
  await expect(selectedVideo).toBeVisible()
  await selectedVideo.focus()
  await page.keyboard.press('Space')
  const primaryAction = page.getByRole('button', { name: '加入时间线' })
  await expect(primaryAction).toBeVisible()
  await primaryAction.focus()
  await expect(primaryAction).toBeFocused()
  await primaryAction.click()
  await page.screenshot({
    path: '../design-qa-evidence/zoom-200-reachability.png',
  })
})

test('exposes the full shortcut panel and executes guarded canvas keyboard actions', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await createCinematicProject(page)
  const canvas = page.getByRole('region', { name: '项目画布' })
  await page.getByRole('button', { name: '快捷键' }).click()
  const shortcuts = page.getByRole('complementary', { name: '快捷键' })
  for (const group of ['创作', '缩放', '移动画布', '其他']) {
    await expect(shortcuts.getByRole('heading', { name: group })).toBeVisible()
  }
  for (const copy of [
    '成组',
    '合并分镜组',
    '解组',
    '复制节点和连线',
    '节点复制',
    '创建副本',
    '整理画布',
  ]) {
    await expect(shortcuts.getByText(copy, { exact: true })).toBeVisible()
  }
  await expect(shortcuts).toContainText('键盘：按住 Space 临时平移')
  await expect(shortcuts).toContainText('触控板：双指移动与缩放')
  await page.keyboard.press('Escape')
  await expect(shortcuts).toHaveCount(0)

  await canvas.focus()
  const initialZoom = await page.locator('.react-flow__viewport').evaluate(
    (viewport) => {
      const match = viewport.getAttribute('style')?.match(/scale\(([-\d.]+)\)/)
      return match ? Number(match[1]) : 0
    },
  )
  await page.keyboard.press('+')
  await expect
    .poll(() =>
      page.locator('.react-flow__viewport').evaluate((viewport) => {
        const match = viewport.getAttribute('style')?.match(/scale\(([-\d.]+)\)/)
        return match ? Number(match[1]) : 0
      }),
    )
    .toBeGreaterThan(initialZoom)
  await page.keyboard.press('-')
  await page.keyboard.press('0')

  await page.keyboard.press('h')
  await expect(page.locator('.canvas-page')).toHaveClass(/canvas-page--hand-tool/)
  await expect(page.getByRole('button', { name: '移动' })).toHaveAttribute(
    'title',
    '抓手工具（H）',
  )
  await page.keyboard.press('v')
  await expect(page.locator('.canvas-page')).not.toHaveClass(/canvas-page--hand-tool/)

  await canvas.focus()
  await page.keyboard.press('Tab')
  const picker = page.getByRole('menu', { name: '添加节点' })
  await expect(picker).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(picker).toHaveCount(0)

  const character = page.getByRole('button', { name: '角色参考', exact: true })
  await character.focus()
  await page.keyboard.press('Enter')
  await canvas.focus()
  const nodeCount = await page.locator('.react-flow__node').count()
  await page.keyboard.press('d')
  await expect(page.locator('.react-flow__node')).toHaveCount(nodeCount + 1)
  await expect(
    page.getByRole('button', { name: '角色参考 副本', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Meta+z')
  await expect(
    page.getByRole('button', { name: '角色参考 副本', exact: true }),
  ).toHaveCount(0)
  await page.keyboard.press('Meta+Shift+z')
  await expect(
    page.getByRole('button', { name: '角色参考 副本', exact: true }),
  ).toBeVisible()

  await character.focus()
  await page.keyboard.press('Enter')
  await canvas.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '历史记录' }).click()
  const history = page.getByRole('complementary', { name: '历史' })
  await expect(history).toContainText('Mock Studio · MJ 风格图片')
  await expect(history).toContainText('消耗 18 积分')
  await expect(page.getByText('102 积分', { exact: true })).toHaveText('102 积分')
  await page.getByRole('button', { name: '关闭历史面板' }).click()

  await page.getByRole('button', { name: 'Agent', exact: true }).click()
  const agentPanel = page.getByRole('complementary', { name: 'Agent 工作区' })
  await expect(agentPanel.getByRole('toolbar', { name: 'Agent 对话工具' })).toBeVisible()
  await expect(agentPanel.getByRole('combobox', { name: '图片模型' })).toHaveValue('mock-mj-image')
  await expect(agentPanel.getByRole('combobox', { name: '视频模型' })).toHaveValue('mock-kling-video')
  await agentPanel.getByRole('button', { name: '设置' }).click()
  await expect(agentPanel.getByRole('checkbox', { name: '自动生成' })).toBeVisible()
  await expect(agentPanel.getByRole('checkbox', { name: '浏览器通知' })).toBeVisible()
  await expect(agentPanel.getByRole('checkbox', { name: '提示音' })).toBeVisible()
  await agentPanel.getByRole('button', { name: '设置' }).click()
  await agentPanel.getByRole('button', { name: '选择 Skill' }).click()
  const skillPicker = page.getByRole('dialog', { name: 'Skill 选择器' })
  for (const tab of ['创建', '全部', '通用', '收藏', '我的']) {
    await expect(skillPicker.getByRole('tab', { name: tab })).toBeVisible()
  }
  await expect(skillPicker.getByRole('searchbox', { name: '搜索 Skill' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(skillPicker).toHaveCount(0)
  await expect(agentPanel).toBeVisible()
  await agentPanel.getByRole('button', { name: '添加 @ 引用' }).click()
  await agentPanel.getByRole('menuitem', { name: /\u5f15\u7528\u5de5\u4f5c\u6d41/ }).click()
  const agentInput = page.getByLabel('告诉我下一步要做什么')
  await expect(agentInput).toHaveValue(/@工作流:/)
  await agentInput.fill('')
  await agentInput.pressSequentially('hv')
  await expect(agentInput).toHaveValue('hv')
  await expect(page.locator('.canvas-page')).not.toHaveClass(/canvas-page--hand-tool/)
  expect(errors).toEqual([])
})

test('marquee-selects every node with the left mouse button and exposes combination controls', async ({
  page,
}) => {
  await createCinematicProject(page)
  await page.getByRole('button', { name: '适配画布' }).click()

  const viewport = page.locator('.react-flow__viewport')
  let previousTransform = ''
  await expect
    .poll(async () => {
      const transform = (await viewport.getAttribute('style')) ?? ''
      const stable = transform === previousTransform
      previousTransform = transform
      return stable
    })
    .toBe(true)

  const nodes = page.locator('.react-flow__node')
  const nodeCount = await nodes.count()
  const drag = await page.locator('.react-flow__pane').evaluate((pane) => {
    const paneRect = pane.getBoundingClientRect()
    const nodeRects = Array.from(
      pane.querySelectorAll<HTMLElement>('.react-flow__node'),
      (node) => node.getBoundingClientRect(),
    )
    if (nodeRects.length < 2) {
      throw new Error('Need at least two nodes to marquee-select')
    }
    const left = Math.min(...nodeRects.map((rect) => rect.left))
    const top = Math.min(...nodeRects.map((rect) => rect.top))
    const right = Math.max(...nodeRects.map((rect) => rect.right))
    const bottom = Math.max(...nodeRects.map((rect) => rect.bottom))
    return {
      start: {
        x: Math.max(paneRect.left + 2, left - 18),
        y: Math.max(paneRect.top + 2, top - 18),
      },
      end: {
        x: Math.min(paneRect.right - 2, right + 18),
        y: Math.min(paneRect.bottom - 2, bottom + 18),
      },
    }
  })

  await page.mouse.move(drag.start.x, drag.start.y)
  await page.mouse.down({ button: 'left' })
  await page.mouse.move(drag.end.x, drag.end.y, { steps: 12 })
  await page.mouse.up({ button: 'left' })

  await expect(page.locator('.react-flow__node.selected')).toHaveCount(nodeCount)
  const toolbar = page.getByRole('toolbar', {
    name: `已选 ${nodeCount} 个节点 组合操作`,
  })
  await expect(toolbar).toBeVisible()
  for (const action of [
    '排列',
    '保存到资产',
    '创建副本',
    '复制',
    '打组',
    '添加到 Chat',
  ]) {
    await expect(toolbar.getByRole('button', { name: action })).toBeVisible()
  }

  await toolbar.getByRole('button', { name: '打组' }).click()
  await expect(page.getByRole('group', { name: '节点分组：分组 01' })).toBeVisible()
})

test('creates an undoable node copy at the real Option-drag drop point', async ({
  page,
}) => {
  await createCinematicProject(page)
  await page.getByRole('button', { name: '适配画布' }).click()
  const source = page.getByRole('button', { name: '分镜 01', exact: true })
  const sourceNode = page.locator('.react-flow__node').filter({ has: source })
  const before = await sourceNode.boundingBox()
  expect(before).not.toBeNull()

  await page.keyboard.down('Alt')
  await page.mouse.move(before!.x + before!.width / 2, before!.y + 24)
  await page.mouse.down()
  await page.mouse.move(
    before!.x + before!.width / 2 + 120,
    before!.y + 104,
    { steps: 8 },
  )
  await page.mouse.up()
  await page.keyboard.up('Alt')

  const copy = page.getByRole('button', { name: '分镜 01 副本', exact: true })
  await expect(copy).toBeVisible()
  const after = await sourceNode.boundingBox()
  const copyBox = await page.locator('.react-flow__node').filter({ has: copy }).boundingBox()
  expect(after).not.toBeNull()
  expect(copyBox).not.toBeNull()
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(4)
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(4)
  expect(Math.abs(copyBox!.x - before!.x)).toBeGreaterThan(60)

  const canvas = page.getByRole('region', { name: '项目画布' })
  await canvas.focus()
  await page.keyboard.press('Meta+z')
  await expect(copy).toHaveCount(0)
})

test('keeps the selected node primary action inside a 200% zoom layout viewport', async ({
  page,
}) => {
  await createCinematicProject(page)
  await page.getByRole('button', { name: '角色参考', exact: true }).click()
  const zoomIn = page.getByRole('button', { name: 'Zoom In' })
  for (let step = 0; step < 10 && (await zoomIn.isEnabled()); step += 1) {
    await zoomIn.click()
  }
  await page.setViewportSize({ width: 721, height: 778 })
  const canvas = page.getByRole('application', { name: '创作节点图' })
  await canvas.focus()
  await page.keyboard.down('Space')
  await page.mouse.move(300, 320)
  await page.mouse.down()
  await page.mouse.move(580, 320, { steps: 5 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  await expect(
    page.getByRole('button', { name: '角色参考', exact: true }),
  ).toBeVisible()
  const primaryAction = page
    .getByRole('toolbar', { name: '图片主操作' })
    .getByRole('button', { name: '图生图' })
  await expect(primaryAction).toBeVisible()
  const actionBox = await primaryAction.boundingBox()
  const modeBarBox = await page
    .getByRole('toolbar', { name: '画布模式工具' })
    .boundingBox()
  const workflowPanelBox = await page
    .getByRole('complementary', { name: '工作流运行面板' })
    .boundingBox()
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
  expect(actionBox).not.toBeNull()
  expect(modeBarBox).not.toBeNull()
  expect(workflowPanelBox).not.toBeNull()
  expect(actionBox!.x).toBeGreaterThanOrEqual(0)
  expect(actionBox!.y).toBeGreaterThanOrEqual(0)
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(viewport.width)
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(viewport.height)
  const actionOverlapsModeBar =
    actionBox!.x < modeBarBox!.x + modeBarBox!.width &&
    actionBox!.x + actionBox!.width > modeBarBox!.x &&
    actionBox!.y < modeBarBox!.y + modeBarBox!.height &&
    actionBox!.y + actionBox!.height > modeBarBox!.y
  expect(
    actionOverlapsModeBar,
    `primary action=${JSON.stringify(actionBox)}, mode bar=${JSON.stringify(modeBarBox)}`,
  ).toBe(false)
  const actionHitTarget = await page.evaluate(
    ({ x, y }) => {
      const target = document.elementFromPoint(x, y)
      return {
        blockedByWorkflowPanel: Boolean(target?.closest('.workflow-run-panel')),
        blockedByModeBar: Boolean(target?.closest('.canvas-mode-bar')),
        action: target?.closest('button')?.textContent?.trim(),
        blocker: {
          tag: target?.tagName,
          className: target instanceof HTMLElement ? target.className : '',
          text: target?.textContent?.trim(),
          parentClassName:
            target?.parentElement instanceof HTMLElement
              ? target.parentElement.className
              : '',
        },
      }
    },
    {
      x: actionBox!.x + actionBox!.width / 2,
      y: actionBox!.y + actionBox!.height / 2,
    },
  )
  expect(
    actionHitTarget.blockedByWorkflowPanel,
    `primary action=${JSON.stringify(actionBox)}, workflow panel=${JSON.stringify(workflowPanelBox)}`,
  ).toBe(false)
  expect(actionHitTarget.blockedByModeBar).toBe(false)
  expect(
    actionHitTarget.action,
    `primary action hit target=${JSON.stringify(actionHitTarget)}`,
  ).toBe('图生图')
  await primaryAction.click()
  await expect(primaryAction).toHaveAttribute('aria-pressed', 'true')
})

for (const width of [721, 720]) {
  test(`keeps the generated selection clear of the AI Director at ${width}×778`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 778 })
    await createCinematicProject(page)
    await page.getByRole('button', { name: '角色参考', exact: true }).click()
    await runSelectedNodeManagementAction(page, '生成视频')

    const generatedNode = page.getByRole('button', {
      name: '视频 01',
      exact: true,
    })
    await expect(generatedNode).toBeVisible()
    const primaryAction = page
      .getByLabel('视频 01操作')
      .getByRole('button', { name: '加入时间线' })
    await expect(primaryAction).toBeVisible()

    const agentToggle = page.getByRole('button', { name: 'Agent', exact: true })
    await agentToggle.click()
    await expect(agentToggle).toHaveAttribute('aria-pressed', 'true')
    const agentPanel = page.getByRole('complementary', {
      name: 'Agent 工作区',
    })
    await expect(agentPanel).toBeVisible()
    await page.getByRole('button', { name: 'Fit View' }).click()
    await page.waitForTimeout(300)

    const nodeBox = await generatedNode.boundingBox()
    const actionBox = await primaryAction.boundingBox()
    const agentBox = await agentPanel.boundingBox()
    expect(nodeBox).not.toBeNull()
    expect(actionBox).not.toBeNull()
    expect(agentBox).not.toBeNull()
    expect(nodeBox!.x).toBeGreaterThanOrEqual(0)
    expect(nodeBox!.y).toBeGreaterThanOrEqual(0)
    expect(nodeBox!.x + nodeBox!.width).toBeLessThanOrEqual(width)
    expect(nodeBox!.y + nodeBox!.height).toBeLessThanOrEqual(778)
    const overlapsAgent =
      nodeBox!.x < agentBox!.x + agentBox!.width &&
      nodeBox!.x + nodeBox!.width > agentBox!.x &&
      nodeBox!.y < agentBox!.y + agentBox!.height &&
      nodeBox!.y + nodeBox!.height > agentBox!.y
    expect(
      overlapsAgent,
      `generated node=${JSON.stringify(nodeBox)}, agent=${JSON.stringify(agentBox)}`,
    ).toBe(false)
    expect(actionBox!.x).toBeGreaterThanOrEqual(0)
    expect(actionBox!.y).toBeGreaterThanOrEqual(0)
    expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(width)
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(778)
    const actionHitTarget = await page.evaluate(
        ({ x, y }) => {
          const hit = document.elementFromPoint(x, y)
          return {
            action: hit?.closest('button')?.textContent?.trim(),
            tag: hit?.tagName,
            className:
              hit instanceof HTMLElement ? hit.className : hit?.getAttribute('class'),
            label: hit?.closest<HTMLElement>('[aria-label]')?.getAttribute('aria-label'),
          }
        },
        {
          x: actionBox!.x + actionBox!.width / 2,
          y: actionBox!.y + actionBox!.height / 2,
        },
      )
    expect(
      actionHitTarget,
      `add-to-timeline hit target=${JSON.stringify(actionHitTarget)}, action=${JSON.stringify(actionBox)}`,
    ).toEqual(expect.objectContaining({ action: expect.stringContaining('加入时间线') }))
    await primaryAction.click()
    await openPreview(page)
    await expect(
      page.getByRole('list', { name: '主视频轨' }).getByRole('listitem'),
    ).toContainText('视频 01')
  })
}

test('creates canvas nodes with Liblib context interactions, persistence, drag, and 200% reachability', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await createCinematicProject(page)

  await expect(page.getByRole('toolbar', { name: '创作工具' })).toHaveCount(0)
  await expect(page.getByRole('toolbar', { name: '画布模式工具' })).toBeVisible()
  const menuPoint = await findBlankCanvasPoint(page, true)
  await page.mouse.click(menuPoint.x, menuPoint.y, { button: 'right' })
  const contextMenu = page.getByRole('menu', { name: '画布快捷菜单' })
  await expect(contextMenu.getByRole('menuitem')).toHaveCount(6)
  await expect(contextMenu.getByRole('menuitem').nth(0)).toContainText('上传')
  await expect(
    contextMenu.getByRole('menuitem', { name: '保存到我的资产' }),
  ).toBeDisabled()
  await expect(contextMenu.getByRole('menuitem', { name: '粘贴' })).toBeDisabled()
  await expect(contextMenu.getByRole('menuitem', { name: '添加节点' })).toHaveAttribute(
    'aria-haspopup',
    'menu',
  )
  await contextMenu.getByRole('menuitem', { name: '添加节点' }).hover()
  const nodeSubmenu = page.getByRole('menu', { name: '添加节点子菜单' })
  await expect(nodeSubmenu.getByRole('menuitem')).toHaveCount(9)
  await expect(
    nodeSubmenu.getByRole('menuitem', { name: '导演台 NEW' }),
  ).toBeVisible()
  await expect(
    nodeSubmenu.getByRole('menuitem', { name: '逐帧拉片 SD2.5' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(contextMenu).toBeHidden()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeFocused()
  await page.mouse.click(menuPoint.x, menuPoint.y, { button: 'right' })
  await expect(contextMenu).toBeVisible()
  await page.getByRole('heading', { level: 1 }).click()
  await expect(contextMenu).toBeHidden()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeFocused()

  const freePoint = await findBlankCanvasPoint(page)
  await page.mouse.dblclick(freePoint.x, freePoint.y)
  const typePicker = page.getByRole('dialog', { name: '选择节点类型' })
  await expect(typePicker).toBeVisible()
  await expect(
    typePicker.getByRole('button', { name: '故事脚本生成', exact: true }),
  ).toBeFocused()
  await expect(
    typePicker.getByRole('button', { name: '全能参考生视频 SD2.5' }),
  ).toBeVisible()
  await expect(
    typePicker.getByRole('button', { name: '音频生视频 SD2.5' }),
  ).toBeVisible()
  await typePicker.getByRole('button', { name: '文本', exact: true }).click()
  const textNode = page.getByRole('button', { name: '文本 01', exact: true })
  await expect(textNode).toBeVisible()
  await expect(textNode).toBeFocused()
  await expect(page.getByLabel('文本 01操作')).toHaveCount(0)

  const imageChooser = await openUploadAtBlank(page)
  await imageChooser.setFiles('public/demo/character-lin-yuan.png')
  const imageNode = page.getByRole('button', {
    name: 'character-lin-yuan.png',
    exact: true,
  })
  await expect(imageNode).toBeVisible()
  await expect(imageNode.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/)

  await imageNode.click({ button: 'right' })
  const nodeMenu = page.getByRole('menu', { name: '画布快捷菜单' })
  await expect(nodeMenu.getByRole('menuitem')).toHaveCount(8)
  await expect(nodeMenu.getByRole('menuitem').allTextContents()).resolves.toEqual([
    '合规校验',
    '保存到我的资产',
    '创建主体',
    '复制',
    '创建副本',
    '粘贴',
    '删除 ⌘⌫',
    '复制到剪贴板',
  ])
  await nodeMenu.getByRole('menuitem', { name: '合规校验' }).click()
  await expect(page.getByRole('status')).toContainText('已通过本地演示合规校验')

  await openAddNodeAtBlank(page, '逐帧拉片 SD2.5')
  await expect(
    page.getByRole('button', { name: '逐帧拉片 01', exact: true }),
  ).toBeVisible()

  await openAddNodeAtBlank(page, '视频')
  const videoNode = page.getByRole('button', { name: '视频 01', exact: true })
  await expect(videoNode).toBeVisible()
  await expect(videoNode).toBeFocused()

  await page.getByRole('button', { name: '撤销' }).click()
  await expect(videoNode).toBeHidden()
  await page.getByRole('button', { name: '重做' }).click()
  await expect(videoNode).toBeVisible()

  const cancelPoint = await findBlankCanvasPoint(page)
  await page.mouse.click(cancelPoint.x, cancelPoint.y, { button: 'right' })
  await page.getByRole('menuitem', { name: '添加节点' }).click()
  await expect(page.getByRole('menu', { name: '添加节点子菜单' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: '画布快捷菜单' })).toBeHidden()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeFocused()
  await expect(
    page.getByRole('button', { name: '文本 02', exact: true }),
  ).toBeHidden()

  // The selected media node now owns a separate composer below its compact
  // card. Select the text node first so that composer is dismissed before the
  // pointer drag starts, matching the user-visible single-selection contract.
  await textNode.press('Enter')
  await expect(textNode).toBeFocused()
  const textFlowNode = page.locator('.react-flow__node').filter({ has: textNode })
  const beforeDrag = await textFlowNode.boundingBox()
  expect(beforeDrag).not.toBeNull()
  const dragPoint = await textFlowNode.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    for (let y = rect.top + 12; y < rect.bottom - 12; y += 12) {
      for (let x = rect.left + 12; x < rect.right - 12; x += 12) {
        const target = document.elementFromPoint(x, y)
        if (target && node.contains(target)) return { x, y }
      }
    }
    throw new Error('No unobstructed drag point found on the text node')
  })
  await page.mouse.move(dragPoint.x, dragPoint.y)
  await page.mouse.down()
  await page.mouse.move(
    dragPoint.x + 96,
    dragPoint.y + 64,
    { steps: 8 },
  )
  await page.mouse.up()
  const afterDrag = await textFlowNode.boundingBox()
  expect(afterDrag).not.toBeNull()
  expect(Math.abs(afterDrag!.x - beforeDrag!.x)).toBeGreaterThan(40)
  const persistedTransform = await textFlowNode.evaluate(
    (element) => (element as HTMLElement).style.transform,
  )
  await expect(page.getByText('已保存')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  for (const title of [
    '文本 01',
    'character-lin-yuan.png',
    '逐帧拉片 01',
    '视频 01',
  ]) {
    await expect(
      page.getByRole('button', { name: title, exact: true }),
    ).toBeVisible()
  }
  const reloadedImage = page.getByRole('button', {
    name: 'character-lin-yuan.png',
    exact: true,
  })
  await expect(reloadedImage.locator('img')).toHaveAttribute(
    'src',
    /^data:image\/png;base64,/,
  )
  expect(
    await page
      .locator('.react-flow__node')
      .filter({
        has: page.getByRole('button', { name: '文本 01', exact: true }),
      })
      .evaluate((element) => (element as HTMLElement).style.transform),
  ).toBe(persistedTransform)

  await page.setViewportSize({ width: 721, height: 778 })
  const narrowPoint = await findBlankCanvasPoint(page, true)
  await page.mouse.click(narrowPoint.x, narrowPoint.y, { button: 'right' })
  await page.getByRole('menuitem', { name: '添加节点' }).click()
  const narrowMenu = page.getByRole('menu', { name: '画布快捷菜单' })
  const narrowSubmenu = page.getByRole('menu', { name: '添加节点子菜单' })
  const menuBox = await narrowMenu.boundingBox()
  const submenuBox = await narrowSubmenu.boundingBox()
  expect(menuBox).not.toBeNull()
  expect(submenuBox).not.toBeNull()
  for (const box of [menuBox!, submenuBox!]) {
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(721)
    expect(box.y + box.height).toBeLessThanOrEqual(778)
  }
  await narrowSubmenu.getByRole('menuitem', { name: '文本' }).click()
  await expect(page.getByRole('button', { name: '文本 02', exact: true })).toBeVisible()

  expect(browserErrors).toEqual([])
})

test('inserts local effects, managed assets, and filtered characters from the dock libraries', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await createCinematicProject(page)

  await page.getByRole('button', { name: '打开工具箱' }).click()
  const toolbox = page.getByRole('complementary', { name: '工具箱' })
  await expect(toolbox.getByRole('list', { name: '动效模板' }).getByRole('button')).toHaveCount(17)
  await toolbox.getByRole('button', { name: '使用极光模板' }).click()
  await expect(page.getByRole('button', { name: '极光特效', exact: true })).toBeVisible()
  const effectSettings = page.getByRole('region', { name: '极光特效 特效参数' })
  await expect(effectSettings.getByLabel('强度')).toHaveValue('70')
  await expect(effectSettings.getByLabel('混合模式')).toHaveValue('滤色')
  await effectSettings.getByLabel('强度').fill('42')
  await expect(effectSettings.getByLabel('强度')).toHaveValue('42')

  await page.getByRole('button', { name: '资产管理' }).click()
  const assets = page.getByRole('dialog', { name: '资产管理' })
  await expect(assets.getByRole('tree', { name: '文件夹' })).toBeVisible()
  await assets.getByRole('searchbox', { name: '搜索素材' }).fill('角色参考')
  const originalAsset = assets.getByRole('article', { name: '素材 角色参考' })
  await expect(originalAsset).toBeVisible()
  await originalAsset.getByText('角色参考', { exact: true }).dblclick()
  const rename = originalAsset.getByRole('textbox', { name: '重命名角色参考' })
  await rename.fill('角色参考库')
  await rename.press('Enter')
  const renamedAsset = assets.getByRole('article', { name: '素材 角色参考库' })
  await renamedAsset.click({ button: 'right' })
  const assetMenu = page.getByRole('menu', { name: '素材操作' })
  await assetMenu.getByRole('menuitem', { name: '移动到' }).click()
  await assetMenu.getByRole('menuitem', { name: '灵感收集' }).click()
  await expect(renamedAsset).toContainText('灵感收集')
  await renamedAsset.getByRole('button', { name: '发送角色参考库到画布' }).click()
  await expect(page.getByRole('button', { name: '角色参考库', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '素材库' }).click()
  const materials = page.getByRole('dialog', { name: '素材库' })
  await expect(materials.getByRole('region', { name: '风格库' })).toBeVisible()
  await expect(materials.getByRole('region', { name: '特效库' })).toBeVisible()
  await materials.getByRole('button', { name: '添加风格参考节点' }).click()
  await expect(page.getByRole('button', { name: '风格参考 01', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '素材库' }).click()
  await page.getByRole('button', { name: '添加特效参考节点' }).click()
  await expect(page.getByRole('button', { name: '特效参考 01', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '角色库' }).click()
  const characters = page.getByRole('dialog', { name: '角色库' })
  await characters.getByLabel('性别').selectOption('女')
  await characters.getByLabel('时代').selectOption('古代')
  const character = characters.getByRole('article', { name: '角色 程野' })
  await expect(character.getByRole('img')).toHaveCount(4)
  await character.getByRole('button', { name: '查看程野' }).click()
  const detail = page.getByRole('dialog', { name: '角色详情 程野' })
  await expect(detail).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(detail).toBeHidden()
  await character.getByRole('button', { name: '使用程野' }).click()
  await characters.getByRole('button', { name: '应用 1 个角色到画布' }).click()
  await expect(page.getByRole('button', { name: '程野', exact: true })).toBeVisible()
  await expect(page.getByText('已保存')).toBeVisible()

  expect(browserErrors).toEqual([])
})

test('keeps storyboard dialogue, section state, node order, and canvas linkage in sync', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await createCinematicProject(page)

  await page.getByRole('button', { name: '故事板' }).click()
  const storyboard = page.getByRole('region', { name: '项目故事板' })
  for (const name of ['文本区', '图片区', '视频区']) {
    await expect(storyboard.getByRole('region', { name })).toBeVisible()
  }
  const stats = storyboard.getByRole('status', { name: '故事板统计' })
  await expect(stats).toContainText('总镜头数 3')
  await expect(stats).toContainText('总时长 00:00')

  const characterCard = storyboard.getByRole('article', { name: '图片故事板卡 角色参考' })
  await expect(characterCard).toContainText('960 × 1200')
  await characterCard.getByRole('textbox', { name: '角色参考对白' }).fill('林渊：灯火就在河对岸。')
  await characterCard.getByRole('button', { name: '保存角色参考对白' }).click()

  const sceneCard = storyboard.getByRole('article', { name: '图片故事板卡 场景设定' })
  const shotCard = storyboard.getByRole('article', { name: '图片故事板卡 分镜 01' })
  await shotCard.dragTo(sceneCard)
  const imageCards = storyboard.getByRole('region', { name: '图片区' }).getByRole('article')
  await expect(imageCards.nth(0)).toHaveAccessibleName('图片故事板卡 角色参考')
  await expect(imageCards.nth(1)).toHaveAccessibleName('图片故事板卡 分镜 01')
  await expect(imageCards.nth(2)).toHaveAccessibleName('图片故事板卡 场景设定')

  await storyboard.getByRole('button', { name: '收起文本区' }).click()
  await expect(storyboard.getByRole('button', { name: '展开文本区' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('已保存')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '故事板' }).click()
  await expect(page.getByRole('button', { name: '展开文本区' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('textbox', { name: '角色参考对白' })).toHaveValue('林渊：灯火就在河对岸。')

  const reloadedCards = page.getByRole('region', { name: '图片区' }).getByRole('article')
  await expect(reloadedCards.nth(1)).toHaveAccessibleName('图片故事板卡 分镜 01')
  await reloadedCards.nth(2).getByRole('button', { name: '定位 场景设定' }).click()
  await expect(page.getByRole('region', { name: '场景设定 生成参数' })).toBeVisible()

  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await runSelectedNodeManagementAction(page, '扩展镜头')
  await page.getByRole('button', { name: '故事板' }).click()
  await expect(page.getByRole('article', { name: '图片故事板卡 分镜 02' })).toBeVisible()
  await expect(page.getByRole('status', { name: '故事板统计' })).toContainText('总镜头数 4')
  await page.getByRole('article', { name: '图片故事板卡 分镜 02' }).getByRole('button', { name: '定位 分镜 02' }).click()
  await page.keyboard.press('Delete')
  await page.getByRole('button', { name: '故事板' }).click()
  await expect(page.getByRole('article', { name: '图片故事板卡 分镜 02' })).toHaveCount(0)
  await expect(page.getByRole('status', { name: '故事板统计' })).toContainText('总镜头数 3')

  expect(browserErrors).toEqual([])
})

test('edits and persists all specialized Liblib node detail panels', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await createCinematicProject(page)

  await openAddNodeAtBlank(page, '文本')
  const textNode = page.getByRole('button', { name: '文本 01', exact: true })
  const textPanel = page.getByRole('region', { name: '文本 01 文本参数' })
  await expect(textPanel).toBeVisible()
  await textPanel.getByRole('textbox', { name: '文本内容' }).fill('雨巷中的河灯旁白')
  await textPanel.getByRole('combobox', { name: '字体样式' }).selectOption('引用')
  await expect(textPanel).toContainText('8 / 5000')

  await openAddNodeAtBlank(page, '脚本')
  await expect(textPanel).toBeHidden()
  await expect(textNode).toContainText('文本节点')
  const scriptPanel = page.getByRole('region', { name: '脚本 01 脚本参数' })
  await expect(scriptPanel.getByRole('list', { name: '章节列表' })).toBeVisible()
  await scriptPanel.getByRole('textbox', { name: '第一章情节摘要' }).fill('雨夜重逢后追查失踪真相')
  await expect(scriptPanel.getByText(/共 \d+ 字/)).toBeVisible()

  await openAddNodeAtBlank(page, '音频')
  const audioPanel = page.getByRole('region', { name: '音频 01 音频参数' })
  await expect(audioPanel.getByText('00:12')).toBeVisible()
  await audioPanel.getByRole('combobox', { name: '音色' }).selectOption('沉稳男声')
  await audioPanel.getByRole('spinbutton', { name: '语速' }).fill('1.2')
  await audioPanel.getByRole('spinbutton', { name: '音量' }).fill('72')

  await openAddNodeAtBlank(page, '导演台 NEW')
  const directorPanel = page.getByRole('region', { name: '导演台 01 导演台参数' })
  const shotList = directorPanel.getByRole('list', { name: '分镜编排列表' })
  await expect(shotList.getByRole('listitem')).toHaveCount(2)
  await directorPanel.getByRole('button', { name: '上移人物入画' }).click()
  await directorPanel.getByRole('button', { name: '新增分镜' }).click()
  await expect(shotList.getByRole('listitem')).toHaveCount(3)

  await openAddNodeAtBlank(page, '逐帧拉片 SD2.5')
  const analysisPanel = page.getByRole('region', { name: '逐帧拉片 01 逐帧拉片参数' })
  await expect(analysisPanel).toContainText('尚未绑定视频')
  await analysisPanel.getByRole('checkbox', { name: '音乐维度' }).uncheck()
  await analysisPanel.getByRole('button', { name: '开始拉片（演示）' }).click()
  await expect(analysisPanel.getByRole('status')).toContainText('未调用真实模型')

  await openAddNodeAtBlank(page, '智能剪辑 Beta')
  const smartEditPanel = page.getByRole('region', { name: '智能剪辑 01 智能剪辑参数' })
  await expect(smartEditPanel.getByRole('list', { name: '剪辑轨道' }).getByRole('listitem')).toHaveCount(3)
  await expect(smartEditPanel.getByRole('list', { name: '片段列表' }).getByRole('listitem')).toHaveCount(2)
  await smartEditPanel.getByRole('spinbutton', { name: '片段 02时长' }).fill('5')
  await expect(smartEditPanel.getByText('导出时长 00:09')).toBeVisible()

  await expect(page.getByText('已保存')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await page.getByRole('button', { name: '适配画布' }).click()
  await page.getByRole('button', { name: '文本 01', exact: true }).click()
  const persistedText = page.getByRole('region', { name: '文本 01 文本参数' })
  await expect(persistedText.getByRole('textbox', { name: '文本内容' })).toHaveValue('雨巷中的河灯旁白')
  await expect(persistedText.getByRole('combobox', { name: '字体样式' })).toHaveValue('引用')
  expect(browserErrors).toEqual([])
})
