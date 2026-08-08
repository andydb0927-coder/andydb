import { test, expect } from '@playwright/test'

async function createCinematicProject(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page
    .getByLabel('描述你想创作的短片')
    .fill('一位女子在雨夜寻找失踪的弟弟')
  await page.getByRole('radio', { name: /电影感叙事/ }).check()
  await page.getByRole('button', { name: '创建项目' }).click()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
}

test('creator completes the minimum short-film loop', async ({ page }) => {
  await createCinematicProject(page)

  await page.getByRole('button', { name: '分镜 01' }).click()
  await page.getByRole('button', { name: '扩展镜头' }).click()
  await expect(page.getByRole('button', { name: '分镜 02' })).toBeVisible()

  await page.getByRole('button', { name: '分镜 01' }).click()
  await page.getByRole('button', { name: '生成视频' }).click()
  await expect(page.getByRole('button', { name: '视频 01' })).toBeVisible()
  await page.getByRole('button', { name: '加入时间线' }).click()

  await page.getByRole('button', { name: '分镜 02' }).click()
  await page.getByRole('button', { name: '生成视频' }).click()
  await expect(page.getByRole('button', { name: '视频 02' })).toBeVisible()
  await page.getByRole('button', { name: '加入时间线' }).click()

  await page.getByRole('link', { name: '预览' }).click()
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()
  await page.getByRole('button', { name: '将视频 02 前移' }).click()
  await expect(
    page.getByRole('list', { name: '主视频轨' }).getByRole('listitem').first(),
  ).toContainText('视频 02')
  await page.getByRole('button', { name: '导出影片' }).click()
  await expect(page.getByText('演示导出已完成')).toBeVisible()
})

test('keyboard and list view preserve core actions in a strict small layout', async ({
  page,
}) => {
  await createCinematicProject(page)

  const storyboard = page.getByRole('button', { name: '分镜 01' })
  const storyboardActions = page.getByLabel('分镜 01操作')
  await storyboard.focus()
  await page.keyboard.press('Enter')
  await expect(storyboardActions).toBeVisible()

  const scene = page.getByRole('button', { name: '场景设定' })
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
  await list.getByRole('button', { name: '重生成 分镜 01' }).click()
  await expect(list.getByText('已完成')).toBeVisible()
  await list.getByRole('button', { name: '关闭' }).click()

  await page.getByRole('button', { name: '生成视频' }).click()
  await expect(page.getByRole('button', { name: '视频 01' })).toBeVisible()
  await page.getByRole('button', { name: '节点列表' }).click()
  const videoItem = list.getByRole('listitem').filter({ hasText: '视频 01' })
  await videoItem.getByRole('button', { name: '选择 视频 01' }).click()
  await videoItem.getByRole('button', { name: '加入时间线 视频 01' }).click()
  await list.getByRole('button', { name: '关闭' }).click()

  await page.setViewportSize({ width: 640, height: 360 })
  await page.getByRole('button', { name: 'Fit View' }).click()
  const selectedVideo = page.getByRole('button', { name: '视频 01' })
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

test('keeps the selected node primary action inside a 200% zoom layout viewport', async ({
  page,
}) => {
  await createCinematicProject(page)
  await page.getByRole('button', { name: '角色参考' }).click()
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
  await expect(page.getByRole('button', { name: '角色参考' })).toBeVisible()
  const primaryAction = page
    .getByLabel('角色参考操作')
    .getByRole('button', { name: '生成视频' })
  const actionBox = await primaryAction.boundingBox()
  expect(actionBox).not.toBeNull()
  expect(actionBox!.x).toBeGreaterThanOrEqual(0)
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  )
})
