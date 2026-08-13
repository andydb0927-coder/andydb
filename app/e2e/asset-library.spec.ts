import { expect, test } from '@playwright/test'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function createCinematicProject(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('link', { name: '新建项目', exact: true }).click()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
}

test('imports and reuses a local image through the platform', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await createCinematicProject(page)
  await page.getByRole('link', { name: '素材与历史' }).click()
  await page.getByLabel('上传本地素材').setInputFiles({
    name: '雨夜参考.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  })
  await page.getByRole('radio', { name: '图片' }).click()
  await page
    .getByRole('button', { name: '添加 雨夜参考.png 到项目并打开画布' })
    .click()
  await expect(page).toHaveURL(
    (url) => (url.searchParams.get('focus') ?? '').length > 0,
  )
  await expect(page.getByRole('status')).toHaveText(
    '已将 雨夜参考.png 添加到项目并打开画布',
  )
  const focusedAsset = page.getByRole('button', {
    name: '雨夜参考.png',
    exact: true,
  })
  await expect(focusedAsset).toBeVisible()
  await expect
    .poll(() =>
      focusedAsset.evaluate((element) =>
        element.closest('.react-flow__node')?.classList.contains('selected'),
      ),
    )
    .toBe(true)
  await page.getByRole('link', { name: '预览' }).click()
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()

  expect(browserErrors).toEqual([])
})

for (const width of [721, 780]) {
  test(`keeps asset controls inside and operable at ${width}px`, async ({
    page,
  }) => {
    const height = 900
    await page.setViewportSize({ width, height })
    await createCinematicProject(page)
    await page.getByRole('link', { name: '素材与历史' }).click()

    const controlContainer = page.locator('.platform-library__controls')
    await controlContainer.scrollIntoViewIfNeeded()
    await expect(controlContainer).toBeVisible()
    expect(
      await controlContainer.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)

    const controls = [
      page.getByLabel('搜索素材'),
      page.getByLabel('目标项目'),
    ]

    for (const control of controls) {
      await control.scrollIntoViewIfNeeded()
      await expect(control).toBeVisible()
      const box = await control.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.y + box!.height).toBeLessThanOrEqual(height)
    }

    for (const label of ['全部', '图片', '视频', '音频']) {
      const filter = controlContainer.getByText(label, { exact: true })
      const box = await filter.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    }

    await page.getByLabel('搜索素材').fill('雨夜')
    await page.getByRole('radio', { name: '图片' }).check()
    const targetProject = page.getByLabel('目标项目')
    const selectedProjectId = await targetProject.inputValue()
    expect(selectedProjectId.length).toBeGreaterThan(0)
    await targetProject.selectOption(selectedProjectId)
    await expect(targetProject).toHaveValue(selectedProjectId)
  })
}
