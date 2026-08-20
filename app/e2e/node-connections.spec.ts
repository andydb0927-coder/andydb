import { expect, test } from '@playwright/test'

import { runSelectedNodeManagementAction } from './canvas-node-actions'

async function createCinematicProject(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('link', { name: '新建项目', exact: true }).click()
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

async function readCanvasZoom(page: import('@playwright/test').Page) {
  return page.locator('.react-flow__viewport').evaluate((viewport) => {
    const match = viewport.getAttribute('style')?.match(/scale\(([-\d.]+)\)/)
    return match ? Number(match[1]) : 0
  })
}

async function setCanvasZoom(
  page: import('@playwright/test').Page,
  targetZoom: number,
) {
  const currentZoom = await readCanvasZoom(page)
  const point = await findBlankCanvasPoint(page)
  await page.mouse.move(point.x, point.y)
  await page.mouse.wheel(
    0,
    -Math.log2(targetZoom / currentZoom) / 0.002,
  )
  await expect.poll(() => readCanvasZoom(page)).toBeCloseTo(targetZoom, 2)
  await expect
    .poll(async () => {
      const zoom = await readCanvasZoom(page)
      const graphStrokeWidths = await page
        .locator('.dependency-edge__interaction')
        .evaluateAll((paths) =>
          paths.map((path) => Number(path.getAttribute('stroke-width'))),
        )
      return graphStrokeWidths.length > 0 && graphStrokeWidths.every(
        (strokeWidth) => Math.abs(strokeWidth * zoom - 24) < 0.25,
      )
    })
    .toBe(true)
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
}

async function measureEdgeHitBand(
  edge: import('@playwright/test').Locator,
  expectedEdgeLabel: string,
) {
  return edge.locator('.dependency-edge__interaction').evaluate(
    (element, label) => {
      const path = element as SVGPathElement
      const matrix = path.getScreenCTM()
      const length = path.getTotalLength()
      const zoom = Math.abs(matrix?.a ?? 0)
      if (!matrix || length === 0 || zoom === 0) {
        throw new Error('Dependency edge path is not measurable')
      }

      const edgeAt = (x: number, y: number) =>
        document
          .elementFromPoint(x, y)
          ?.closest('.react-flow__edge')
          ?.getAttribute('aria-label') ?? null
      const isBlockedAt = (x: number, y: number) =>
        Boolean(
          document
            .elementFromPoint(x, y)
            ?.closest(
              '.react-flow__node, .canvas-mode-bar, .canvas-context-menu, .director-composer, .react-flow__controls, .dependency-edge__delete',
            ),
        )
      const diagnostics: Array<Record<string, unknown>> = []

      for (let index = 3; index <= 17; index += 1) {
        const pathLength = (length * index) / 20
        const pathPoint = path.getPointAtLength(pathLength)
        const before = path.getPointAtLength(Math.max(0, pathLength - 1))
        const after = path.getPointAtLength(Math.min(length, pathLength + 1))
        const screenPoint = new DOMPoint(pathPoint.x, pathPoint.y).matrixTransform(
          matrix,
        )
        const tangentX = after.x - before.x
        const tangentY = after.y - before.y
        const tangentLength = Math.hypot(tangentX, tangentY)
        if (tangentLength === 0) continue
        const normalX = -tangentY / tangentLength
        const normalY = tangentX / tangentLength

        for (const direction of [1, -1]) {
          // Convert the screen-pixel probe distance into graph space before
          // applying the React Flow viewport matrix.
          const screenOffsetPoint = (screenPixels: number) => {
            const transformed = new DOMPoint(
              pathPoint.x + normalX * (screenPixels / zoom) * direction,
              pathPoint.y + normalY * (screenPixels / zoom) * direction,
            ).matrixTransform(matrix)
            return { x: transformed.x, y: transformed.y }
          }
          const at11 = screenOffsetPoint(11)
          const at13 = screenOffsetPoint(13)
          const centerEdge = edgeAt(screenPoint.x, screenPoint.y)
          const edge11 = edgeAt(at11.x, at11.y)
          const edge13 = edgeAt(at13.x, at13.y)
          const at11Blocked = isBlockedAt(at11.x, at11.y)
          if (
            centerEdge === label &&
            edge11 === label &&
            edge13 !== label &&
            !at11Blocked
          ) {
            return { at11, at13, edge11, edge13 }
          }
          if (diagnostics.length < 10) {
            diagnostics.push({
              centerEdge,
              edge11,
              edge13,
              at11Blocked,
              zoom,
            })
          }
        }
      }

      throw new Error(
        `No dependency edge boundary point found: ${JSON.stringify({
          expectedEdgeLabel: label,
          diagnostics,
        })}`,
      )
    },
    expectedEdgeLabel,
  )
}

async function dragHandle(
  page: import('@playwright/test').Page,
  source: import('@playwright/test').Locator,
  target: import('@playwright/test').Locator,
) {
  const sourceBox = await source.boundingBox()
  expect(sourceBox).not.toBeNull()
  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2,
    sourceBox!.y + sourceBox!.height / 2,
  )
  await page.mouse.down()
  let targetBox = await target.boundingBox()
  expect(targetBox).not.toBeNull()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.mouse.move(
      targetBox!.x + targetBox!.width / 2,
      targetBox!.y + targetBox!.height / 2,
      { steps: attempt === 0 ? 12 : 2 },
    )
    await page.waitForTimeout(40)
    const nextTargetBox = await target.boundingBox()
    expect(nextTargetBox).not.toBeNull()
    const moved =
      Math.abs(nextTargetBox!.x - targetBox!.x) +
      Math.abs(nextTargetBox!.y - targetBox!.y)
    targetBox = nextTargetBox
    if (moved < 0.5) break
  }
  const targetLabel = await target.getAttribute('aria-label')
  const hitTarget = await page.evaluate(
    ({ x, y }) => {
      const hit = document.elementFromPoint(x, y)
      return {
        label: hit?.closest<HTMLElement>('[aria-label]')?.getAttribute('aria-label'),
        tag: hit?.tagName,
        className: hit instanceof HTMLElement ? hit.className : hit?.getAttribute('class'),
        text: hit?.textContent?.trim().slice(0, 80),
      }
    },
    {
      x: targetBox!.x + targetBox!.width / 2,
      y: targetBox!.y + targetBox!.height / 2,
    },
  )
  expect(hitTarget.label, `target handle center should remain reachable for ${targetLabel}: ${JSON.stringify(hitTarget)}`).toBe(
    targetLabel,
  )
  await page.mouse.up()
}

async function clickEdgePath(
  edge: import('@playwright/test').Locator,
  page: import('@playwright/test').Page,
  screenOffset = 0,
) {
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
  const point = await edge
    .locator('.react-flow__edge-interaction')
    .evaluate((element, offset) => {
      const path = element as SVGPathElement
      const edgeGroup = path.closest('.react-flow__edge')
      const matrix = path.getScreenCTM()
      const length = path.getTotalLength()
      if (!edgeGroup || !matrix || length === 0) {
        throw new Error('Dependency edge path is not measurable')
      }
      const diagnostics: Array<Record<string, unknown>> = []

      for (let index = 2; index <= 18; index += 1) {
        const pathLength = (length * index) / 20
        const pathPoint = path.getPointAtLength(pathLength)
        const before = path.getPointAtLength(Math.max(0, pathLength - 1))
        const after = path.getPointAtLength(Math.min(length, pathLength + 1))
        const screenPoint = new DOMPoint(pathPoint.x, pathPoint.y).matrixTransform(
          matrix,
        )
        const screenBefore = new DOMPoint(before.x, before.y).matrixTransform(matrix)
        const screenAfter = new DOMPoint(after.x, after.y).matrixTransform(matrix)
        const tangentX = screenAfter.x - screenBefore.x
        const tangentY = screenAfter.y - screenBefore.y
        const tangentLength = Math.hypot(tangentX, tangentY)
        if (tangentLength === 0) continue
        const normalX = -tangentY / tangentLength
        const normalY = tangentX / tangentLength
        const directions = offset === 0 ? [0] : [1, -1]
        for (const direction of directions) {
          const x = screenPoint.x + normalX * offset * direction
          const y = screenPoint.y + normalY * offset * direction
          const hit = document.elementFromPoint(x, y)
          if (hit?.closest('.react-flow__edge') === edgeGroup) return { x, y }
          if (diagnostics.length < 8) {
            diagnostics.push({
              x,
              y,
              hit: hit?.className?.toString() ?? hit?.tagName,
              centerHit: document.elementFromPoint(screenPoint.x, screenPoint.y)
                ?.className?.toString(),
            })
          }
        }
      }

      const style = getComputedStyle(path)
      throw new Error(
        `No unobstructed dependency edge point found: ${JSON.stringify({
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
          vectorEffect: style.vectorEffect,
          pointerEvents: style.pointerEvents,
          matrix: { a: matrix.a, d: matrix.d, e: matrix.e, f: matrix.f },
          diagnostics,
        })}`,
      )
    }, screenOffset)

  await page.mouse.click(point.x, point.y)
}

async function hoverEdgePath(
  edge: import('@playwright/test').Locator,
  page: import('@playwright/test').Page,
) {
  const point = await edge
    .locator('.dependency-edge__interaction')
    .evaluate((element) => {
      const path = element as SVGPathElement
      const edgeGroup = path.closest('.react-flow__edge')
      const matrix = path.getScreenCTM()
      const length = path.getTotalLength()
      if (!edgeGroup || !matrix || length === 0) {
        throw new Error('Dependency edge path is not measurable')
      }
      for (let index = 2; index <= 18; index += 1) {
        const point = path.getPointAtLength((length * index) / 20)
        const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(matrix)
        if (document.elementFromPoint(screenPoint.x, screenPoint.y)?.closest(
          '.react-flow__edge',
        ) === edgeGroup) {
          return { x: screenPoint.x, y: screenPoint.y }
        }
      }
      throw new Error('No unobstructed dependency edge hover point found')
    })
  await page.mouse.move(point.x, point.y)
}

async function expectDeleteActionInsideViewport(
  page: import('@playwright/test').Page,
  deleteAction: import('@playwright/test').Locator,
  viewport: { width: number; height: number },
) {
  const actionBox = await deleteAction.boundingBox()
  const agentPanel = page.getByRole('complementary', { name: 'Agent 工作区' })
  const agentBox = (await agentPanel.count()) > 0
    ? await agentPanel.boundingBox()
    : null
  expect(actionBox).not.toBeNull()
  expect(actionBox!.x).toBeGreaterThanOrEqual(0)
  expect(actionBox!.y).toBeGreaterThanOrEqual(0)
  expect(actionBox!.width).toBeGreaterThanOrEqual(32)
  expect(actionBox!.height).toBeGreaterThanOrEqual(32)
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(viewport.width)
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(viewport.height)
  if (agentBox) {
    expect(
      actionBox!.x < agentBox.x + agentBox.width &&
        actionBox!.x + actionBox!.width > agentBox.x &&
        actionBox!.y < agentBox.y + agentBox.height &&
        actionBox!.y + actionBox!.height > agentBox.y,
    ).toBe(false)
  }
  const centerHit = await page.evaluate(
    ({ x, y }) =>
      document
        .elementFromPoint(x, y)
        ?.closest('button')
        ?.getAttribute('aria-label'),
    {
      x: actionBox!.x + actionBox!.width / 2,
      y: actionBox!.y + actionBox!.height / 2,
    },
  )
  expect(centerHit).toBe(
    await deleteAction.getAttribute('aria-label'),
  )
}

async function expectVisibilityToggleInsideViewport(
  page: import('@playwright/test').Page,
  toggle: import('@playwright/test').Locator,
  viewport: { width: number; height: number },
) {
  const box = await toggle.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)

  const centerHit = await page.evaluate(
    ({ x, y }) =>
      document
        .elementFromPoint(x, y)
        ?.closest('button')
        ?.getAttribute('aria-label'),
    { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
  )
  expect(centerHit).toBe(await toggle.getAttribute('aria-label'))
}

test('keeps the visibility toggle fully targetable at the normal layout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 })
  await createCinematicProject(page)
  const toggle = page.getByRole('button', { name: '隐藏连线' })

  await expectVisibilityToggleInsideViewport(page, toggle, {
    width: 1440,
    height: 1024,
  })
})

test('toggles connection visibility with focused Enter and Space activation', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.setViewportSize({ width: 1440, height: 1024 })
  await createCinematicProject(page)
  const edge = page.getByLabel('角色参考 → 分镜 01', { exact: true })
  const hideToggle = page.getByRole('button', { name: '隐藏连线' })

  await hideToggle.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('button', { name: '显示连线' }),
  ).toHaveAttribute('aria-pressed', 'false')
  await expect(edge.locator('.dependency-edge__paths')).toHaveCount(0)
  await expect(page.getByText('连线已隐藏，端口仍可使用')).toBeVisible()

  const showToggle = page.getByRole('button', { name: '显示连线' })
  await showToggle.focus()
  await page.keyboard.press('Space')
  await expect(
    page.getByRole('button', { name: '隐藏连线' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(edge.locator('.dependency-edge__paths')).toHaveCount(1)
  await expect(page.getByText('连线已显示')).toBeVisible()
  expect(errors).toEqual([])
})

test('hides and restores dependency visuals without changing connection data', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await createCinematicProject(page)
  const edge = page.getByLabel('角色参考 → 分镜 01', { exact: true })
  const toggle = page.getByRole('button', { name: '隐藏连线' })

  await expect(edge.locator('.dependency-edge__paths')).toHaveCount(1)
  await toggle.click()
  await expect(page.getByRole('button', { name: '显示连线' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(edge).toHaveCount(0)
  await expect(page.getByText('连线已隐藏，端口仍可使用')).toBeVisible()

  await page.getByRole('button', { name: '显示连线' }).click()
  await expect(edge).toHaveCount(1)
  await expect(edge.locator('.dependency-edge__paths')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('preserves hidden connection data for the H hand tool and real L handle flow', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await createCinematicProject(page)
  const originalEdge = page.getByLabel('角色参考 → 分镜 01', { exact: true })
  const agentToggle = page.getByRole('button', { name: 'Agent', exact: true })
  await agentToggle.click()
  await expect(agentToggle).toHaveAttribute('aria-pressed', 'true')
  const directorInput = page.getByLabel('告诉我下一步要做什么')
  const canvas = page.getByRole('region', { name: '项目画布' })

  await directorInput.focus()
  await page.keyboard.press('h')
  await expect(directorInput).toHaveValue('h')
  await expect(page.getByRole('button', { name: '隐藏连线' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.getByRole('button', { name: '关闭 Agent' }).click()
  await expect(agentToggle).toHaveAttribute('aria-pressed', 'false')

  await canvas.focus()
  await page.keyboard.press('h')
  await expect(page.locator('.canvas-page')).toHaveClass(/canvas-page--hand-tool/)
  await expect(page.getByRole('button', { name: '隐藏连线' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: '隐藏连线' }).click()
  await expect(page.getByRole('button', { name: '显示连线' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(originalEdge.locator('.dependency-edge__paths')).toHaveCount(0)

  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await runSelectedNodeManagementAction(page, '生成视频')
  const video = page.getByRole('button', { name: '视频 01', exact: true })
  await expect(video).toBeVisible()

  await canvas.focus()
  await page.keyboard.press('l')
  await expect(
    page.getByRole('button', { name: '连线', exact: true }),
  ).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: '从角色参考建立连接' }).focus()
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: '连接到视频 01' }).focus()
  await page.keyboard.press('Enter')

  const newEdge = page.getByLabel('角色参考 → 视频 01', { exact: true })
  await expect(newEdge).toHaveCount(0)

  await page.getByRole('button', { name: '显示连线' }).click()
  await expect(originalEdge.locator('.dependency-edge__paths')).toHaveCount(1)
  await expect(newEdge).toHaveCount(1)
  await expect(newEdge.locator('.dependency-edge__paths')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('keeps the visibility control reachable at 721 by 778 and reloads visible', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.setViewportSize({ width: 721, height: 778 })
  await createCinematicProject(page)
  const edge = page.getByLabel('角色参考 → 分镜 01', { exact: true })
  const toggle = page.getByRole('button', { name: '隐藏连线' })

  await expectVisibilityToggleInsideViewport(page, toggle, {
    width: 721,
    height: 778,
  })
  const modeBarBox = await page
    .getByRole('toolbar', { name: '画布模式工具' })
    .boundingBox()
  expect(modeBarBox).not.toBeNull()
  expect(modeBarBox!.width).toBeLessThanOrEqual(240)
  expect(modeBarBox!.x + modeBarBox!.width).toBeLessThanOrEqual(721)
  const separatorAlpha = await toggle.evaluate((button) => {
    const color = getComputedStyle(button).borderLeftColor
    const match = color.match(/rgba?\(([^)]+)\)/)
    if (!match) return 0
    const channels = match[1].split(',').map(Number)
    return channels.length === 4 ? channels[3] : 1
  })
  expect(separatorAlpha).toBeGreaterThan(0)

  await toggle.click()
  await expect(edge.locator('.dependency-edge__paths')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await expect(page.getByRole('button', { name: '隐藏连线' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(edge.locator('.dependency-edge__paths')).toHaveCount(1)
  expect(errors).toEqual([])
})

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
  const character = page.getByRole('button', {
    name: '角色参考',
    exact: true,
  })
  const scene = page.getByRole('button', { name: '场景设定', exact: true })
  const storyboard = page.getByRole('button', { name: '分镜 01', exact: true })
  const sourceNodeId = await character.getAttribute('data-canvas-node-id')
  expect(sourceNodeId).not.toBeNull()
  await expect(
    page.getByLabel('角色参考 → 分镜 01', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByLabel('场景设定 → 分镜 01', { exact: true }),
  ).toBeVisible()

  await storyboard.click()
  await runSelectedNodeManagementAction(page, '生成视频')
  const video = page.getByRole('button', { name: '视频 01', exact: true })
  await expect(video).toBeVisible()
  await expect(
    page.getByLabel('分镜 01 → 视频 01', { exact: true }),
  ).toBeVisible()

  await character.hover()
  const sourceHandle = page.getByRole('button', {
    name: '从角色参考建立连接',
    exact: true,
  })
  const targetHandle = page.getByRole('button', {
    name: '连接到视频 01',
    exact: true,
  })
  const handleHitSize = await sourceHandle.evaluate((handle) => {
    const viewport = handle
      .closest('.react-flow')
      ?.querySelector<HTMLElement>('.react-flow__viewport')
    const zoom = viewport
      ? new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a
      : 1

    return Number.parseFloat(getComputedStyle(handle, '::after').width) * zoom
  })
  expect(handleHitSize).toBeCloseTo(24, 1)
  await dragHandle(page, sourceHandle, targetHandle)
  const characterVideoEdge = page.getByLabel('角色参考 → 视频 01', {
    exact: true,
  })
  await expect(characterVideoEdge).toHaveCount(1)
  await expect(characterVideoEdge).toBeVisible()

  await openAddNodeAtBlank(page, '文本')
  const text = page.getByRole('button', { name: '文本 01', exact: true })
  await expect(text).toBeVisible()

  const connect = page.getByRole('button', { name: '连线', exact: true })
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
  await page.keyboard.press('Delete')
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
  await expect(
    page.getByRole('button', { name: '文本 01', exact: true }),
  ).toBeHidden()

  await openPreview(page)
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()
  await expect(
    page.getByRole('list', { name: '主视频轨' }).getByRole('listitem'),
  ).toHaveCount(0)
  await expect(page.getByRole('region', { name: '成片播放器' })).toContainText(
    '时间线为空',
  )

  await page.goto(`${canvasUrl}?focus=${sourceNodeId}`)
  const focusedSource = page.getByRole('button', {
    name: '角色参考',
    exact: true,
  })
  await expect
    .poll(() =>
      focusedSource.evaluate((element) =>
        element.closest('.react-flow__node')?.classList.contains('selected'),
      ),
    )
    .toBe(true)
  await focusedSource.focus()
  await expect(focusedSource).toBeFocused()
  await page
    .getByRole('button', { name: 'Fit View' })
    .evaluate((button: HTMLButtonElement) => button.click())

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

test('exposes real handles as named buttons and connects them by keyboard', async ({
  page,
}) => {
  await createCinematicProject(page)
  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await runSelectedNodeManagementAction(page, '生成视频')
  await expect(
    page.getByRole('button', { name: '视频 01', exact: true }),
  ).toBeVisible()

  const sourceHandle = page.getByRole('button', {
    name: '从角色参考建立连接',
  })
  const targetHandle = page.getByRole('button', { name: '连接到视频 01' })
  await expect(sourceHandle).toHaveAttribute('tabindex', '0')
  await expect(targetHandle).toHaveAttribute('tabindex', '0')

  await sourceHandle.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('请选择目标节点')

  await targetHandle.focus()
  await page.keyboard.press('Space')
  await expect(
    page.getByLabel('角色参考 → 视频 01', { exact: true }),
  ).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: '连线', exact: true }),
  ).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('drops a source connection on blank canvas to create one referenced downstream node', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 })
  await createCinematicProject(page)

  const sourceHandle = page.getByRole('button', {
    name: '从角色参考建立连接',
  })
  const sourceBox = await sourceHandle.boundingBox()
  const dropPoint = await findBlankCanvasPoint(page, true)
  expect(sourceBox).not.toBeNull()

  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2,
    sourceBox!.y + sourceBox!.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(dropPoint.x, dropPoint.y, { steps: 14 })
  await page.mouse.up()

  const picker = page.getByRole('menu', { name: '引用该节点生成' })
  await expect(picker).toContainText('角色参考')
  await picker.getByRole('menuitem', { name: '图片', exact: true }).click()

  await expect(
    page.getByRole('button', { name: '图片 01', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByLabel('角色参考 → 图片 01', { exact: true }),
  ).toHaveCount(1)
  await expect(page.getByLabel('1 个上游参考')).toBeVisible()

  await page.getByRole('button', { name: '撤销' }).click()
  await expect(
    page.getByRole('button', { name: '图片 01', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByLabel('角色参考 → 图片 01', { exact: true }),
  ).toHaveCount(0)
})

test('inserts a contextual media node from the edge midpoint and undoes the graph replacement once', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 })
  await createCinematicProject(page)
  const originalLabel = '场景设定 → 分镜 01'
  const originalEdge = page.getByLabel(originalLabel, { exact: true })

  await hoverEdgePath(originalEdge, page)
  const insert = page.getByRole('button', {
    name: `在连接“${originalLabel}”中插入节点`,
  })
  await expect(insert).toBeVisible()
  await insert.click()
  await expect(page.getByRole('dialog', { name: '选择节点类型' })).toBeVisible()
  await page.getByRole('button', { name: '视频', exact: true }).click()

  await expect(originalEdge).toHaveCount(0)
  await expect(
    page.getByLabel('场景设定 → 视频 01', { exact: true }),
  ).toHaveCount(1)
  await expect(
    page.getByLabel('视频 01 → 分镜 01', { exact: true }),
  ).toHaveCount(1)
  await expect(
    page.getByText(/承接“场景设定”并输出至“分镜 01”/),
  ).toBeVisible()

  await page.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByLabel(originalLabel, { exact: true })).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: '视频 01', exact: true }),
  ).toHaveCount(0)
})

test('keeps edge hit and delete targets screen-sized at Fit View and minZoom', async ({
  page,
}) => {
  await page.setViewportSize({ width: 721, height: 778 })
  await createCinematicProject(page)
  const edge = page.getByLabel('场景设定 → 分镜 01', { exact: true })
  const deleteAction = page.getByRole('button', {
    name: '删除连接：场景设定 → 分镜 01',
  })

  await page
    .getByRole('button', { name: 'Fit View' })
    .evaluate((button: HTMLButtonElement) => button.click())
  await clickEdgePath(edge, page, 10)
  await expect(deleteAction).toBeVisible()
  await expectDeleteActionInsideViewport(page, deleteAction, {
    width: 721,
    height: 778,
  })

  await clickBlankCanvas(page, true)
  const zoomOut = page.getByRole('button', { name: 'Zoom Out' })
  const readZoom = () =>
    page.locator('.react-flow__viewport').evaluate((viewport) => {
      const match = viewport.getAttribute('style')?.match(/scale\(([\d.]+)\)/)
      return match ? Number(match[1]) : 0
    })
  for (let index = 0; index < 8; index += 1) {
    const before = await readZoom()
    if (before <= 0.351) break
    await zoomOut.evaluate((button: HTMLButtonElement) => button.click())
    await expect.poll(readZoom).toBeLessThan(before)
  }
  await expect.poll(readZoom).toBeCloseTo(0.35, 2)

  await clickEdgePath(edge, page, 10)
  await expect(deleteAction).toBeVisible()
  await expectDeleteActionInsideViewport(page, deleteAction, {
    width: 721,
    height: 778,
  })
})

for (const zoom of [0.35, 1, 1.8]) {
  test(`keeps the dependency edge hit band at 24px at zoom ${zoom}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1024 })
    await createCinematicProject(page)
    await setCanvasZoom(page, zoom)
    await expect.poll(() => readCanvasZoom(page)).toBeCloseTo(zoom, 2)

    const edgeLabel = '场景设定 → 分镜 01'
    const edge = page.getByLabel(edgeLabel, { exact: true })
    const deleteAction = page.getByRole('button', {
      name: `删除连接：${edgeLabel}`,
    })
    const points = await measureEdgeHitBand(edge, edgeLabel)

    expect(points.edge11, '11px must hit the intended edge').toBe(edgeLabel)
    expect(points.edge13, '13px must not hit this or an adjacent edge').toBeNull()

    await page.mouse.click(points.at11.x, points.at11.y)
    await expect(deleteAction).toBeVisible()
    const actionBox = await deleteAction.boundingBox()
    expect(actionBox).not.toBeNull()
    expect(actionBox!.width).toBeGreaterThanOrEqual(32)
    expect(actionBox!.height).toBeGreaterThanOrEqual(32)

    await clickBlankCanvas(page, true)
    await expect(deleteAction).toBeHidden()
    await page.mouse.click(points.at13.x, points.at13.y)
    await expect(page.locator('.dependency-edge__delete')).toHaveCount(0)
  })
}

test('cancels active toolbar choices before native handle drags', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 })
  await createCinematicProject(page)
  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await runSelectedNodeManagementAction(page, '生成视频')
  await expect(
    page.getByRole('button', { name: '视频 01', exact: true }),
  ).toBeVisible()

  const connect = page.getByRole('button', { name: '连线', exact: true })
  const videoTarget = page.getByRole('button', { name: '连接到视频 01' })
  const characterVideo = page.getByLabel('角色参考 → 视频 01', {
    exact: true,
  })
  const sceneVideo = page.getByLabel('场景设定 → 视频 01', { exact: true })

  await connect.click()
  await dragHandle(
    page,
    page.getByRole('button', { name: '从角色参考建立连接' }),
    videoTarget,
  )
  await expect(characterVideo).toHaveCount(1)
  await expect(connect).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.locator('.creative-node--connection-source')).toHaveCount(0)
  await page.getByRole('button', { name: '撤销' }).click()
  await expect(characterVideo).toBeHidden()

  await connect.click()
  await page
    .getByRole('button', { name: '角色参考', exact: true })
    .click()
  await expect(page.getByRole('status')).toHaveText('请选择目标节点')
  await dragHandle(
    page,
    page.getByRole('button', { name: '从场景设定建立连接' }),
    videoTarget,
  )
  await expect(sceneVideo).toHaveCount(1)
  await expect(characterVideo).toBeHidden()
  await expect(connect).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.locator('.creative-node--connection-source')).toHaveCount(0)
  await page.getByRole('button', { name: '撤销' }).click()
  await expect(sceneVideo).toBeHidden()
})
