import { createFixtureCinematicProject, expect, test } from './provider-fixture'

test('edits an existing image through the intercepted Ark Pro contract and restores it after reload', async ({ page }) => {
  const requests: Array<Record<string, unknown>> = []
  await page.route('https://fixture.seedream.invalid/api/v3/images/generations', async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        data: [{
          url: 'https://media.fixture.invalid/image-edit-e2e.png',
          size: '2816x1584',
          width: 2816,
          height: 1584,
        }],
      },
    })
  })

  await createFixtureCinematicProject(page)
  await page.getByRole('button', { name: '适配画布' }).click()
  const scene = page.getByRole('button', { name: '场景设定', exact: true })
  await scene.click()
  const tools = page.getByRole('toolbar', { name: '图片创作工具' })

  await expect(tools.getByRole('button', { name: '高清' })).toBeDisabled()
  await expect(tools.getByRole('button', { name: '抠像' })).toBeDisabled()
  await tools.getByRole('button', { name: '扩图' }).click()
  let dialog = page.getByRole('dialog', { name: '提示词扩图' })
  await dialog.getByRole('textbox', { name: '编辑描述' }).fill('延续清晨山谷与薄雾')
  await dialog.getByRole('spinbutton', { name: '输出宽度' }).fill('2816')
  await dialog.getByRole('spinbutton', { name: '输出高度' }).fill('1584')
  await expect(dialog).toContainText('实际请求尺寸 2816 × 1584')
  await expect(dialog).toContainText('官方预计 ¥0.60')
  await dialog.getByRole('button', { name: '取消' }).click()
  expect(requests).toHaveLength(0)

  await tools.getByRole('button', { name: '扩图' }).click()
  dialog = page.getByRole('dialog', { name: '提示词扩图' })
  await dialog.getByRole('textbox', { name: '编辑描述' }).fill('延续清晨山谷与薄雾')
  await dialog.getByRole('spinbutton', { name: '输出宽度' }).fill('2816')
  await dialog.getByRole('spinbutton', { name: '输出高度' }).fill('1584')
  await dialog.getByRole('button', { name: '确认编辑并生成' }).click()

  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0]).toEqual({
    model: 'doubao-seedream-5-0-pro-260628',
    prompt: expect.stringContaining('向四周自然延展'),
    image: [expect.stringMatching(/^https:\/\/media\.fixture\.invalid\//)],
    size: '2816x1584',
    response_format: 'url',
    output_format: 'png',
    watermark: false,
  })
  expect(requests[0]).not.toHaveProperty('mask')
  expect(requests[0]).not.toHaveProperty('outpainting')
  await expect(scene.locator('img')).toHaveAttribute('src', 'https://media.fixture.invalid/image-edit-e2e.png')
  await expect(page.getByText('Seedream 5.0 Pro 图片编辑结果已保存到项目与生成历史。')).toBeVisible()
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await expect(page.getByRole('button', { name: '场景设定', exact: true }).locator('img'))
    .toHaveAttribute('src', 'https://media.fixture.invalid/image-edit-e2e.png')
  await page.getByRole('button', { name: '历史记录' }).click()
  await expect(page.getByRole('article', { name: '历史任务 场景设定' })).toContainText('Seedream 5.0 Pro 图片编辑')
})

test('keeps the original after a rejected erase and retries the saved edit contract at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 721, height: 778 })
  const requests: Array<Record<string, unknown>> = []
  await page.route('https://fixture.seedream.invalid/api/v3/images/generations', async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill(requests.length === 1
      ? { status: 401, json: { error: { message: 'fixture-private-error' } } }
      : { status: 200, json: { data: [{ url: 'https://media.fixture.invalid/image-erase-e2e.png', size: '1600x900' }] } })
  })
  await createFixtureCinematicProject(page)
  await page.getByRole('button', { name: '适配画布' }).click()
  const scene = page.getByRole('button', { name: '场景设定', exact: true })
  await scene.click()
  const originalUrl = await scene.locator('img').getAttribute('src')
  await page.getByRole('toolbar', { name: '图片创作工具' }).getByRole('button', { name: '擦除' }).click()
  const dialog = page.getByRole('dialog', { name: 'AI 局部擦除' })
  await dialog.getByRole('textbox', { name: '编辑描述' }).fill('移除路牌')
  await expect(dialog.getByRole('button', { name: '确认编辑并生成' })).toBeDisabled()
  for (const [name, value] of [['左边界', '100'], ['上边界', '200'], ['右边界', '600'], ['下边界', '800']]) {
    await dialog.getByRole('spinbutton', { name }).fill(value!)
  }
  const confirm = dialog.getByRole('button', { name: '确认编辑并生成' })
  await confirm.scrollIntoViewIfNeeded()
  await expect(confirm).toBeInViewport()
  await confirm.click()
  await expect(page.getByText(/图片编辑 鉴权失败/)).toBeVisible()
  await expect(page.getByText('fixture-private-error')).toHaveCount(0)
  await expect(scene.locator('img')).toHaveAttribute('src', originalUrl!)
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: '适配画布' }).click()
  await page.getByRole('button', { name: '场景设定', exact: true }).click()
  await page.getByRole('button', { name: '重试生成' }).click()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1]).toEqual(requests[0])
  expect(String(requests[1]!.prompt)).toContain('<bbox>100 200 600 800</bbox>')
  await expect(page.getByRole('button', { name: '场景设定', exact: true }).locator('img'))
    .toHaveAttribute('src', 'https://media.fixture.invalid/image-erase-e2e.png')
})
