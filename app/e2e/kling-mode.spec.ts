import { expect, test } from '@playwright/test'

import { runSelectedNodeManagementAction } from './canvas-node-actions'

test('switches Kling live to text-to-video and submits the supported request', async ({
  page,
}) => {
  const createBodies: Array<Record<string, unknown>> = []

  await page.route('https://media.fixture.invalid/e2e-kling-result.mp4', (route) =>
    route.fulfill({ status: 200, contentType: 'video/mp4', body: '' }),
  )
  await page.route('https://fixture.kling.invalid/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (
      request.method() === 'POST' &&
      url.pathname === '/text-to-video/kling-2.6'
    ) {
      const body = request.postDataJSON() as Record<string, unknown>
      createBodies.push(body)
      await route.fulfill({
        status: 200,
        json: { code: 0, data: { id: 'e2e-kling-task', status: 'submitted' } },
      })
      return
    }
    if (request.method() === 'GET' && url.pathname === '/tasks') {
      const externalTaskId = url.searchParams.get('external_task_ids')
      await route.fulfill({
        status: 200,
        json: {
          code: 0,
          data: [{
            id: 'e2e-kling-task',
            external_task_id: externalTaskId,
            status: 'succeeded',
            outputs: [{
              type: 'video',
              url: 'https://media.fixture.invalid/e2e-kling-result.mp4',
              duration: 5,
            }],
          }],
        },
      })
      return
    }
    await route.abort('blockedbyclient')
  })

  await page.goto('/projects/new?recipe=cinematic-story')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  await runSelectedNodeManagementAction(page, '生成视频')

  const panel = page.getByRole('region', { name: '视频 01 生成参数' })
  const model = panel.getByRole('combobox', { name: '模型' })
  const mode = panel.getByRole('combobox', { name: '生成模式' })
  await expect(mode).toHaveValue('全能参考')

  await model.selectOption('kling-api')

  await expect(mode).toHaveValue('文生视频')
  await expect(mode.getByRole('option', { name: '文生视频' })).toBeEnabled()
  for (const label of ['全能参考', '图生视频', '首尾帧', '图片参考']) {
    await expect
      .poll(() =>
        mode
          .getByRole('option', { name: label })
          .evaluate((option) => (option as HTMLOptionElement).disabled),
      )
      .toBe(true)
  }
  await expect(panel.getByRole('status')).toContainText(
    '当前模型不支持全能参考，已自动切换为文生视频',
  )

  const generate = panel.getByRole('button', {
    name: '生成视频，预计成本 24',
  })
  await expect(generate).toBeEnabled()
  await generate.click()

  await expect.poll(() => createBodies.length).toBe(1)
  expect(createBodies[0]).toMatchObject({
    settings: {
      audio: 'off',
      resolution: '720p',
      aspect_ratio: '16:9',
      duration: 5,
    },
    options: {
      external_task_id: expect.any(String),
      watermark_info: { enabled: false },
    },
  })
  await expect(
    page.getByRole('button', { name: '视频 01', exact: true }).locator('video'),
  ).toHaveAttribute(
    'src',
    'https://media.fixture.invalid/e2e-kling-result.mp4',
  )
})
