import { expect, test } from './provider-fixture'


test('selects the live Seedance 2.0 provider and submits the official task contract', async ({
  page,
}) => {
  const createBodies: Array<Record<string, unknown>> = []
  let releaseCreateRequest: (() => void) | undefined
  const createRequestGate = new Promise<void>((resolve) => {
    releaseCreateRequest = resolve
  })

  await page.route('https://media.fixture.invalid/e2e-seedance-result.mp4', (route) =>
    route.fulfill({ status: 200, contentType: 'video/mp4', body: '' }),
  )
  await page.route('https://fixture.seedream.invalid/api/v3/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (
      request.method() === 'POST' &&
      url.pathname === '/api/v3/contents/generations/tasks'
    ) {
      createBodies.push(request.postDataJSON() as Record<string, unknown>)
      await createRequestGate
      await route.fulfill({
        status: 200,
        json: { id: 'cgt-e2e-seedance-task' },
      })
      return
    }
    if (
      request.method() === 'GET' &&
      url.pathname === '/api/v3/contents/generations/tasks/cgt-e2e-seedance-task'
    ) {
      await route.fulfill({
        status: 200,
        json: {
          id: 'cgt-e2e-seedance-task',
          model: 'doubao-seedance-2-0-260128',
          status: 'succeeded',
          content: {
            video_url: 'https://media.fixture.invalid/e2e-seedance-result.mp4',
          },
          duration: 5,
          ratio: '16:9',
          resolution: '720p',
          generate_audio: false,
          usage: { completion_tokens: 54_000 },
        },
      })
      return
    }
    await route.abort('blockedbyclient')
  })

  await page.goto('/projects/new')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await page.getByRole('toolbar', { name: '画布模式工具' }).getByRole('button', { name: '添加节点' }).click()
  await page.getByRole('menu', { name: '添加节点' }).getByRole('menuitem', { name: '视频', exact: true }).click()

  const panel = page.getByRole('region', { name: '视频 01 生成参数' })
  const model = panel.getByRole('combobox', { name: '模型' })
  const mode = panel.getByRole('combobox', { name: '生成模式' })

  await model.selectOption('seedance-api')
  await expect(mode).toHaveValue('全能参考')
  for (const label of ['文生视频', '全能参考', '图生视频', '首尾帧', '图片参考']) {
    await expect(mode.getByRole('option', { name: label })).toBeEnabled()
  }
  await mode.selectOption('文生视频')
  await panel.getByRole('combobox', { name: '声音' }).selectOption('关闭')
  await panel.getByRole('textbox', { name: '提示词' }).fill(
    '雨夜霓虹街道，摄影机缓慢向前推进',
  )

  const generate = panel.getByRole('button', {
    name: '生成视频，预计成本 135',
  })
  await expect(generate).toBeEnabled()
  await generate.click()

  await expect.poll(() => createBodies.length, {
    timeout: 15_000,
    message: 'Seedance fixture create request should be dispatched',
  }).toBe(1)
  await expect(
    page.getByRole('status').filter({ hasText: /已提交|生成中/ }),
  ).toBeVisible()
  releaseCreateRequest?.()
  expect(createBodies[0]).toMatchObject({
    model: 'doubao-seedance-2-0-260128',
    content: [{
      type: 'text',
      text: '雨夜霓虹街道，摄影机缓慢向前推进',
    }],
    duration: 5,
    ratio: 'adaptive',
    resolution: '720p',
    generate_audio: false,
    watermark: false,
  })
  await expect(
    page.getByRole('button', { name: '视频 01', exact: true }).locator('video'),
  ).toHaveAttribute(
    'src',
    'https://media.fixture.invalid/e2e-seedance-result.mp4',
  )
})
