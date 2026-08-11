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

async function clickBlankCanvas(
  page: import('@playwright/test').Page,
  fromBottomRight = false,
) {
  const point = await page.locator('.react-flow__pane').evaluate(
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
              '.react-flow__node, .canvas-toolbar, .director-composer, .canvas-placement-hint, .react-flow__controls',
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

  await page.mouse.click(point.x, point.y)
}

test('creator completes the minimum short-film loop', async ({ page }) => {
  await createCinematicProject(page)

  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await page.getByRole('button', { name: '扩展镜头' }).click()
  await expect(
    page.getByRole('button', { name: '分镜 02', exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await page.getByRole('button', { name: '生成视频' }).click()
  await expect(
    page.getByRole('button', { name: '视频 01', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '加入时间线' }).click()

  await page.getByRole('button', { name: '分镜 02', exact: true }).click()
  await page.getByRole('button', { name: '生成视频' }).click()
  await expect(
    page.getByRole('button', { name: '视频 02', exact: true }),
  ).toBeVisible()
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
  await list.getByRole('button', { name: '重生成 分镜 01' }).click()
  await expect(list.getByText('已完成')).toBeVisible()
  await list.getByRole('button', { name: '关闭' }).click()

  await page.getByRole('button', { name: '生成视频' }).click()
  await expect(
    page.getByRole('button', { name: '视频 01', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '节点列表' }).click()
  const videoItem = list.getByRole('listitem').filter({ hasText: '视频 01' })
  await videoItem.getByRole('button', { name: '选择 视频 01' }).click()
  await videoItem.getByRole('button', { name: '加入时间线 视频 01' }).click()
  await list.getByRole('button', { name: '关闭' }).click()

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
    .getByLabel('角色参考操作')
    .getByRole('button', { name: '生成视频' })
  const actionBox = await primaryAction.boundingBox()
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
  expect(actionBox).not.toBeNull()
  expect(actionBox!.x).toBeGreaterThanOrEqual(0)
  expect(actionBox!.y).toBeGreaterThanOrEqual(0)
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(viewport.width)
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(viewport.height)
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest('button')
          ?.textContent?.trim(),
      {
        x: actionBox!.x + actionBox!.width / 2,
        y: actionBox!.y + actionBox!.height / 2,
      },
    ),
  ).toContain('生成视频')
  await primaryAction.click()
  await expect(
    page.getByRole('button', { name: '视频 01', exact: true }),
  ).toBeVisible()
})

for (const width of [721, 720]) {
  test(`keeps the generated selection clear of the AI Director at ${width}×778`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 778 })
    await createCinematicProject(page)
    await page.getByRole('button', { name: '角色参考', exact: true }).click()
    await page
      .getByLabel('角色参考操作')
      .getByRole('button', { name: '生成视频' })
      .click()

    const generatedNode = page.getByRole('button', {
      name: '视频 01',
      exact: true,
    })
    await expect(generatedNode).toBeVisible()
    const primaryAction = page
      .getByLabel('视频 01操作')
      .getByRole('button', { name: '加入时间线' })
    await expect(primaryAction).toBeVisible()

    const nodeBox = await generatedNode.boundingBox()
    const actionBox = await primaryAction.boundingBox()
    const composerBox = await page.locator('.director-composer').boundingBox()
    expect(nodeBox).not.toBeNull()
    expect(actionBox).not.toBeNull()
    expect(composerBox).not.toBeNull()
    expect(nodeBox!.x).toBeGreaterThanOrEqual(0)
    expect(nodeBox!.y).toBeGreaterThanOrEqual(0)
    expect(nodeBox!.x + nodeBox!.width).toBeLessThanOrEqual(width)
    expect(nodeBox!.y + nodeBox!.height).toBeLessThanOrEqual(778)
    const overlapsDirector =
      nodeBox!.x < composerBox!.x + composerBox!.width &&
      nodeBox!.x + nodeBox!.width > composerBox!.x &&
      nodeBox!.y < composerBox!.y + composerBox!.height &&
      nodeBox!.y + nodeBox!.height > composerBox!.y
    expect(
      overlapsDirector,
      `generated node=${JSON.stringify(nodeBox)}, director=${JSON.stringify(composerBox)}`,
    ).toBe(false)
    expect(actionBox!.x).toBeGreaterThanOrEqual(0)
    expect(actionBox!.y).toBeGreaterThanOrEqual(0)
    expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(width)
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(778)
    expect(
      await page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest('button')
            ?.textContent?.trim(),
        {
          x: actionBox!.x + actionBox!.width / 2,
          y: actionBox!.y + actionBox!.height / 2,
        },
      ),
    ).toContain('加入时间线')
    await primaryAction.click()
    await page.getByRole('link', { name: '预览' }).click()
    await expect(
      page.getByRole('list', { name: '主视频轨' }).getByRole('listitem'),
    ).toContainText('视频 01')
  })
}

test('creates canvas nodes with keyboard, persistence, drag, and 200% reachability', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await createCinematicProject(page)

  const toolbar = page.getByRole('toolbar', { name: '创作工具' })
  const selectTool = toolbar.getByRole('button', { name: '选择', exact: true })
  const textTool = toolbar.getByRole('button', { name: '文本', exact: true })
  await textTool.focus()
  await page.keyboard.press('Enter')
  await expect(textTool).toHaveAttribute('aria-pressed', 'true')
  await clickBlankCanvas(page)
  const textDialog = page.getByRole('dialog', { name: '创建文本节点' })
  await textDialog.getByLabel('文字内容').fill('雨落在旧车站的独白')
  await textDialog.getByLabel('文字内容').press('Control+Enter')
  const textNode = page.getByRole('button', { name: '文本 01', exact: true })
  await expect(textNode).toBeVisible()
  await expect(textNode).toBeFocused()
  await expect(page.getByLabel('文本 01操作')).toBeVisible()
  await expect(selectTool).toHaveAttribute('aria-pressed', 'true')

  await toolbar.getByRole('button', { name: '图片', exact: true }).click()
  await clickBlankCanvas(page)
  const imageDialog = page.getByRole('dialog', { name: '创建图片节点' })
  await imageDialog
    .getByLabel('本地图片')
    .setInputFiles('public/demo/character-lin-yuan.png')
  await imageDialog.getByLabel('图片描述（选填）').fill('雨夜人物参考')
  await imageDialog.getByRole('button', { name: '确认创建' }).click()
  const imageNode = page.getByRole('button', { name: '图片 01', exact: true })
  await expect(imageNode).toBeVisible()
  await expect(imageNode.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/)
  await expect(selectTool).toHaveAttribute('aria-pressed', 'true')

  await toolbar.getByRole('button', { name: '分镜', exact: true }).click()
  await clickBlankCanvas(page)
  const storyboardDialog = page.getByRole('dialog', { name: '创建分镜节点' })
  await storyboardDialog.getByLabel('画面提示词').fill('近景，雨滴落在袖口')
  await storyboardDialog.getByRole('button', { name: '确认创建' }).click()
  await expect(
    page.getByRole('button', { name: '分镜 02', exact: true }),
  ).toBeVisible()

  await toolbar.getByRole('button', { name: '视频', exact: true }).click()
  await clickBlankCanvas(page)
  const videoDialog = page.getByRole('dialog', { name: '创建视频节点' })
  await videoDialog.getByLabel('视频提示词').fill('镜头缓慢推向人物')
  await videoDialog.getByRole('button', { name: '确认创建' }).click()
  const videoNode = page.getByRole('button', { name: '视频 01', exact: true })
  await expect(videoNode).toBeVisible()
  await expect(videoNode).toBeFocused()

  await page.getByRole('button', { name: '撤销' }).click()
  await expect(videoNode).toBeHidden()
  await page.getByRole('button', { name: '重做' }).click()
  await expect(videoNode).toBeVisible()

  await textTool.focus()
  await page.keyboard.press('Enter')
  await clickBlankCanvas(page)
  await expect(page.getByRole('dialog', { name: '创建文本节点' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '创建文本节点' })).toBeHidden()
  await expect(textTool).toBeFocused()
  await expect(
    page.getByRole('button', { name: '文本 02', exact: true }),
  ).toBeHidden()

  const textFlowNode = page.locator('.react-flow__node').filter({ has: textNode })
  const beforeDrag = await textFlowNode.boundingBox()
  expect(beforeDrag).not.toBeNull()
  await page.mouse.move(
    beforeDrag!.x + beforeDrag!.width / 2,
    beforeDrag!.y + 20,
  )
  await page.mouse.down()
  await page.mouse.move(
    beforeDrag!.x + beforeDrag!.width / 2 + 96,
    beforeDrag!.y + 84,
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
  for (const title of ['文本 01', '图片 01', '分镜 02', '视频 01']) {
    await expect(
      page.getByRole('button', { name: title, exact: true }),
    ).toBeVisible()
  }
  const reloadedImage = page.getByRole('button', {
    name: '图片 01',
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
  await toolbar.getByRole('button', { name: '文本', exact: true }).click()
  await clickBlankCanvas(page, true)
  const zoomDialog = page.getByRole('dialog', { name: '创建文本节点' })
  await zoomDialog.getByLabel('标题').fill('')
  await zoomDialog.getByRole('button', { name: '确认创建' }).click()
  await expect(zoomDialog.getByText('请输入标题')).toBeVisible()
  await expect(zoomDialog.getByText('请输入文字内容')).toBeVisible()
  const dialogBox = await zoomDialog.boundingBox()
  const cancelBox = await zoomDialog.getByRole('button', { name: '取消' }).boundingBox()
  const confirmBox = await zoomDialog
    .getByRole('button', { name: '确认创建' })
    .boundingBox()
  expect(dialogBox).not.toBeNull()
  expect(cancelBox).not.toBeNull()
  expect(confirmBox).not.toBeNull()
  for (const box of [dialogBox!, cancelBox!, confirmBox!]) {
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(721)
    expect(box.y + box.height).toBeLessThanOrEqual(778)
  }
  await zoomDialog.getByRole('button', { name: '取消' }).click()

  expect(browserErrors).toEqual([])
})
