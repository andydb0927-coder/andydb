import { expect, test } from '@playwright/test'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function createCinematicProject(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page
    .getByLabel('描述你想创作的短片')
    .fill('一位女子在雨夜寻找失踪的弟弟')
  await page.getByRole('radio', { name: /电影感叙事/ }).check()
  await page.getByRole('button', { name: '创建项目' }).click()
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
