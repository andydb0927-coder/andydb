import { expect, test, type Download, type Page } from '@playwright/test'

async function createProject(page: Page) {
  await page.goto('/projects/new?recipe=cinematic-story')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
}

async function openExportMenu(page: Page) {
  await page.getByRole('button', { name: '发布与分享' }).click()
  return page.getByRole('menu', { name: '发布与分享菜单' })
}

async function readDownload(download: Download) {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

test('exports canvas ranges and a complete workflow JSON snapshot', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await createProject(page)

  let menu = await openExportMenu(page)
  await expect(menu.getByRole('menuitem', { name: '导出画布' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '导出工作流 JSON' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '导入工作流 JSON' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '预览', exact: true })).toBeVisible()
  await menu.getByRole('menuitem', { name: '导出画布' }).click()

  const exportDialog = page.getByRole('dialog', { name: '导出画布' })
  await expect(exportDialog).toContainText(/当前视口·\d+ × \d+/)
  await expect(exportDialog).toContainText(/全画布·\d+ × \d+/)
  await exportDialog.getByRole('radio', { name: 'SVG 矢量图' }).check()
  await exportDialog.getByRole('radio', { name: /全画布/ }).check()
  const svgDownloadPromise = page.waitForEvent('download')
  await exportDialog.getByRole('button', { name: '导出 SVG' }).click()
  const svgDownload = await svgDownloadPromise
  expect(svgDownload.suggestedFilename()).toMatch(/-画布-全画布-\d{8}-\d{6}\.svg$/)
  const svg = (await readDownload(svgDownload)).toString('utf8')
  expect(svg).toContain('<svg')
  expect(svg).toContain('data-node-id=')

  menu = await openExportMenu(page)
  await menu.getByRole('menuitem', { name: '导出画布' }).click()
  const pngDialog = page.getByRole('dialog', { name: '导出画布' })
  const pngDownloadPromise = page.waitForEvent('download')
  await pngDialog.getByRole('button', { name: '导出 PNG' }).click()
  const pngDownload = await pngDownloadPromise
  expect(pngDownload.suggestedFilename()).toMatch(
    /-画布-当前视口-\d{8}-\d{6}\.png$/,
  )
  const png = await readDownload(pngDownload)
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])

  menu = await openExportMenu(page)
  const jsonDownloadPromise = page.waitForEvent('download')
  await menu.getByRole('menuitem', { name: '导出工作流 JSON' }).click()
  const jsonDownload = await jsonDownloadPromise
  expect(jsonDownload.suggestedFilename()).toMatch(/-工作流-\d{8}-\d{6}\.json$/)
  const snapshot = JSON.parse((await readDownload(jsonDownload)).toString('utf8')) as {
    format: string
    version: number
    exportedAt: string
    project: Record<string, unknown> & {
      nodes: Array<Record<string, unknown>>
      edges: Array<Record<string, unknown>>
    }
  }
  expect(snapshot).toMatchObject({
    format: 'wireless-canvas-workflow',
    version: 1,
    exportedAt: expect.any(String),
    project: {
      id: expect.any(String),
      title: expect.any(String),
      intent: expect.any(String),
      assets: expect.any(Array),
      nodes: expect.any(Array),
      edges: expect.any(Array),
      timeline: expect.any(Array),
      jobs: expect.any(Array),
      exportJobs: expect.any(Array),
      groups: expect.any(Array),
    },
  })
  expect(snapshot.project.nodes.length).toBeGreaterThan(0)
  expect(snapshot.project.nodes[0]).toMatchObject({
    id: expect.any(String),
    title: expect.any(String),
    position: { x: expect.any(Number), y: expect.any(Number) },
    versions: expect.any(Array),
    activeVersionId: expect.any(String),
  })
  expect(snapshot.project.edges[0]).toMatchObject({
    id: expect.any(String),
    sourceNodeId: expect.any(String),
    targetNodeId: expect.any(String),
  })
  expect(browserErrors).toEqual([])
})
