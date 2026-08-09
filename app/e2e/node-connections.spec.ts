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

test('selects and deletes a toolbar-created dependency edge', async ({ page }) => {
  await page.setViewportSize({ width: 721, height: 778 })
  await createCinematicProject(page)
  const toolbar = page.getByRole('toolbar', { name: '创作工具' })
  await toolbar.getByRole('button', { name: '视频', exact: true }).click()
  await clickBlankCanvas(page, true)
  const videoDialog = page.getByRole('dialog', { name: '创建视频节点' })
  await videoDialog.getByLabel('视频提示词').fill('镜头缓慢推向人物')
  await videoDialog.getByRole('button', { name: '确认创建' }).click()
  const videoNode = page.getByRole('button', { name: '视频 01' })
  await expect(videoNode).toBeVisible()

  const connect = page.getByRole('button', { name: '连线' })
  await connect.click()
  await page.getByRole('button', { name: '角色参考' }).click()
  await videoNode.click()
  const edge = page.getByLabel('角色参考 → 视频 01')
  await expect(edge).toBeVisible()
  await clickEdgePath(edge, page)
  const deleteAction = page.getByRole('button', {
    name: '删除连接：角色参考 → 视频 01',
  })
  const zoomIn = page.getByRole('button', { name: 'Zoom In' })
  while (await zoomIn.isEnabled()) await zoomIn.click()
  const panStart = await findBlankCanvasPoint(page)
  await page.keyboard.down('Space')
  await page.mouse.move(panStart.x, panStart.y)
  await page.mouse.down()
  await page.mouse.move(710, panStart.y, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  const actionBox = await deleteAction.boundingBox()
  expect(actionBox).not.toBeNull()
  expect(actionBox!.x).toBeGreaterThanOrEqual(0)
  expect(actionBox!.y).toBeGreaterThanOrEqual(0)
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(721)
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(778)
  expect(actionBox!.x + actionBox!.width).toBeGreaterThanOrEqual(700)
  await deleteAction.click()
  await expect(edge).toBeHidden()
  await expect(page.getByRole('button', { name: '角色参考' })).toBeFocused()
})
