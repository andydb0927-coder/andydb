import { expect, test } from '@playwright/test'

async function createCinematicProject(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page
    .getByLabel('描述你想创作的短片')
    .fill('一位女子在雨夜寻找失踪的弟弟')
  await page.getByRole('radio', { name: /电影感叙事/ }).check()
  await page.getByRole('button', { name: '创建项目' }).click()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
}

async function findBlankCanvasPoint(
  page: import('@playwright/test').Page,
  fromBottomRight = false,
) {
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
}

async function clickBlankCanvas(
  page: import('@playwright/test').Page,
  fromBottomRight = false,
) {
  const point = await findBlankCanvasPoint(page, fromBottomRight)
  await page.mouse.click(point.x, point.y)
}

async function clickEdgePath(
  edge: import('@playwright/test').Locator,
  page: import('@playwright/test').Page,
) {
  const point = await edge
    .locator('.react-flow__edge-interaction')
    .evaluate((element) => {
      const path = element as SVGPathElement
      const edgeGroup = path.closest('.react-flow__edge')
      const matrix = path.getScreenCTM()
      const length = path.getTotalLength()
      if (!edgeGroup || !matrix || length === 0) {
        throw new Error('Dependency edge path is not measurable')
      }

      for (let index = 2; index <= 18; index += 1) {
        const pathPoint = path.getPointAtLength((length * index) / 20)
        const screenPoint = new DOMPoint(pathPoint.x, pathPoint.y).matrixTransform(
          matrix,
        )
        const hit = document.elementFromPoint(screenPoint.x, screenPoint.y)
        if (hit?.closest('.react-flow__edge') === edgeGroup) {
          return { x: screenPoint.x, y: screenPoint.y }
        }
      }

      throw new Error('No unobstructed dependency edge point found')
    })

  await page.mouse.click(point.x, point.y)
}

async function expectDeleteActionInsideViewport(
  page: import('@playwright/test').Page,
  deleteAction: import('@playwright/test').Locator,
  viewport: { width: number; height: number },
) {
  const actionBox = await deleteAction.boundingBox()
  const composerBox = await page.locator('.director-composer').boundingBox()
  expect(actionBox).not.toBeNull()
  expect(composerBox).not.toBeNull()
  expect(actionBox!.x).toBeGreaterThanOrEqual(0)
  expect(actionBox!.y).toBeGreaterThanOrEqual(0)
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(viewport.width)
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(viewport.height)
  expect(
    actionBox!.x < composerBox!.x + composerBox!.width &&
      actionBox!.x + actionBox!.width > composerBox!.x &&
      actionBox!.y < composerBox!.y + composerBox!.height &&
      actionBox!.y + actionBox!.height > composerBox!.y,
  ).toBe(false)
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest('button')
          ?.getAttribute('aria-label'),
      {
        x: actionBox!.x + actionBox!.width / 2,
        y: actionBox!.y + actionBox!.height / 2,
      },
    ),
  ).toBe(await deleteAction.getAttribute('aria-label'))
}

test('creates, rejects, deletes, undoes, and restores dependency connections', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.setViewportSize({ width: 1440, height: 1024 })
  await createCinematicProject(page)
  const canvasUrl = page.url()
  const character = page.getByRole('button', { name: '角色参考' })
  const scene = page.getByRole('button', { name: '场景设定' })
  const storyboard = page.getByRole('button', { name: '分镜 01' })
  const sourceNodeId = await character.getAttribute('data-canvas-node-id')
  expect(sourceNodeId).not.toBeNull()
  await expect(
    page.getByLabel('角色参考 → 分镜 01', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByLabel('场景设定 → 分镜 01', { exact: true }),
  ).toBeVisible()

  await storyboard.click()
  await page.getByRole('button', { name: '生成视频' }).click()
  const video = page.getByRole('button', { name: '视频 01' })
  await expect(video).toBeVisible()
  await expect(
    page.getByLabel('分镜 01 → 视频 01', { exact: true }),
  ).toBeVisible()

  await character.hover()
  const sourceHandle = page.getByLabel('从角色参考建立连接')
  const targetHandle = page.getByLabel('连接到视频 01')
  await sourceHandle.dragTo(targetHandle)
  const characterVideoEdge = page.getByLabel('角色参考 → 视频 01', {
    exact: true,
  })
  await expect(characterVideoEdge).toHaveCount(1)
  await expect(characterVideoEdge).toBeVisible()

  const toolbar = page.getByRole('toolbar', { name: '创作工具' })
  await toolbar.getByRole('button', { name: '文本', exact: true }).click()
  await clickBlankCanvas(page)
  const textDialog = page.getByRole('dialog', { name: '创建文本节点' })
  await textDialog.getByLabel('文字内容').fill('雨夜车站的旁白')
  await textDialog.getByRole('button', { name: '确认创建' }).click()
  const text = page.getByRole('button', { name: '文本 01' })
  await expect(text).toBeVisible()

  const connect = page.getByRole('button', { name: '连线' })
  await connect.focus()
  await page.keyboard.press('Enter')
  await video.focus()
  await page.keyboard.press('Space')
  await character.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toContainText('此连接会形成循环依赖')
  await page.keyboard.press('Escape')
  await expect(connect).toBeFocused()

  await page.keyboard.press('Enter')
  await video.focus()
  await page.keyboard.press('Space')
  await text.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toContainText(
    '这两种节点不能建立生成依赖',
  )
  await page.keyboard.press('Escape')
  await expect(connect).toBeFocused()

  await text.click()
  await page.getByRole('button', { name: '删除节点' }).click()
  await expect(text).toBeHidden()

  await page.getByRole('application', { name: '创作节点图' }).focus()
  await page.keyboard.press('l')
  await expect(connect).toHaveAttribute('aria-pressed', 'true')
  await scene.focus()
  await page.keyboard.press('Space')
  await video.focus()
  await page.keyboard.press('Enter')
  const sceneVideoEdge = page.getByLabel('场景设定 → 视频 01', {
    exact: true,
  })
  await expect(sceneVideoEdge).toHaveCount(1)
  await expect(sceneVideoEdge).toBeVisible()
  await expect(connect).toBeFocused()
  await expect(
    page.getByLabel('分镜 01 → 视频 01', { exact: true }),
  ).toBeVisible()
  await expect(characterVideoEdge).toBeVisible()

  await page.getByRole('button', { name: '撤销' }).click()
  await expect(sceneVideoEdge).toBeHidden()
  await expect(characterVideoEdge).toBeVisible()
  await page.getByRole('button', { name: '重做' }).click()
  await expect(sceneVideoEdge).toBeVisible()

  await clickEdgePath(characterVideoEdge, page)
  const characterDeleteAction = page.getByRole('button', {
    name: '删除连接：角色参考 → 视频 01',
  })
  await expect(characterDeleteAction).toBeVisible()
  await characterDeleteAction.click()
  await expect(characterVideoEdge).toBeHidden()
  await expect(character).toBeFocused()
  await page.getByRole('button', { name: '撤销' }).click()
  await expect(characterVideoEdge).toBeVisible()

  await clickEdgePath(sceneVideoEdge, page)
  await sceneVideoEdge.focus()
  await page.keyboard.press('Delete')
  await expect(sceneVideoEdge).toBeHidden()
  await expect(scene).toBeFocused()
  await page.getByRole('button', { name: '撤销' }).click()
  await expect(sceneVideoEdge).toBeVisible()

  await expect(page.getByText('已保存')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await expect(
    page.getByLabel('分镜 01 → 视频 01', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByLabel('角色参考 → 视频 01', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByLabel('场景设定 → 视频 01', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '文本 01' })).toBeHidden()

  await page.getByRole('link', { name: '预览' }).click()
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()
  await expect(
    page.getByRole('list', { name: '主视频轨' }).getByRole('listitem'),
  ).toHaveCount(0)
  await expect(page.getByRole('region', { name: '成片播放器' })).toContainText(
    '时间线为空',
  )

  await page.goto(`${canvasUrl}?focus=${sourceNodeId}`)
  const focusedSource = page.getByRole('button', { name: '角色参考' })
  await expect
    .poll(() =>
      focusedSource.evaluate((element) =>
        element.closest('.react-flow__node')?.classList.contains('selected'),
      ),
    )
    .toBe(true)
  await focusedSource.focus()
  await expect(focusedSource).toBeFocused()
  await page.getByRole('button', { name: 'Fit View' }).click()

  const reloadedSceneVideoEdge = page.getByLabel('场景设定 → 视频 01', {
    exact: true,
  })
  await clickEdgePath(reloadedSceneVideoEdge, page)
  const sceneDeleteAction = page.getByRole('button', {
    name: '删除连接：场景设定 → 视频 01',
  })
  await expect(sceneDeleteAction).toBeVisible()
  await expectDeleteActionInsideViewport(page, sceneDeleteAction, {
    width: 1440,
    height: 1024,
  })
  await page.screenshot({
    path: '../design-qa-evidence/node-connections-1440x1024.png',
  })

  await page.setViewportSize({ width: 721, height: 778 })
  await page.getByRole('button', { name: 'Fit View' }).click()
  await clickEdgePath(reloadedSceneVideoEdge, page)
  await expect(sceneDeleteAction).toBeVisible()
  await expectDeleteActionInsideViewport(page, sceneDeleteAction, {
    width: 721,
    height: 778,
  })
  await page.screenshot({
    path: '../design-qa-evidence/node-connections-721x778.png',
  })

  expect(errors).toEqual([])
})
