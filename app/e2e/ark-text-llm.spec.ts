import { expect, test, type Page } from './provider-fixture'

async function blankCanvasPoint(page: Page) {
  return page.locator('.react-flow__pane').evaluate((pane) => {
    const rect = pane.getBoundingClientRect()
    for (let y = rect.top + 90; y < rect.bottom - 180; y += 48) {
      for (let x = rect.left + 120; x < rect.right - 80; x += 48) {
        const target = document.elementFromPoint(x, y)
        if (!target?.closest(
          '.react-flow__node, .canvas-mode-bar, .react-flow__controls, button, input, textarea, select',
        )) return { x, y }
      }
    }
    throw new Error('No blank canvas point found')
  })
}

async function addTextNode(page: Page) {
  const point = await blankCanvasPoint(page)
  await page.mouse.click(point.x, point.y, { button: 'right' })
  await page.getByRole('menuitem', { name: '添加节点' }).click()
  await page.getByRole('menuitem', { name: '文本', exact: true }).click()
}

test('selects the intercepted Ark text model, generates, and restores its persistent result', async ({ page }) => {
  const requests: Array<Record<string, unknown>> = []
  await page.route('https://fixture.seedream.invalid/api/v3/chat/completions', async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        id: 'chatcmpl-e2e-ark-text',
        object: 'chat.completion',
        model: 'doubao-seed-2-1-pro-260628',
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: '清晨的薄雾缠住古桥，河水把第一束天光带向远方。',
          },
        }],
        usage: {
          prompt_tokens: 24,
          completion_tokens: 20,
          total_tokens: 44,
        },
      },
    })
  })

  await page.goto('/projects/new')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await addTextNode(page)
  const panel = page.getByRole('region', { name: '文本 01 文本参数' })
  const model = panel.getByRole('combobox', { name: '文本模型' })
  const liveOption = model.locator('option[value="ark-text-llm"]')
  await expect(liveOption).toBeAttached()
  await expect(liveOption).toBeEnabled()
  await expect(liveOption.locator('..')).toHaveAttribute(
    'label',
    '官方 API 已接（开发直连）',
  )
  await model.selectOption('ark-text-llm')
  await panel.getByRole('textbox', { name: '文本生成提示词' }).fill('清晨薄雾中的古桥')
  await panel.getByRole('button', { name: '生成文本，预计成本 1' }).click()

  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0]).toMatchObject({
    model: 'doubao-seed-2-1-pro-260628',
    messages: [
      expect.objectContaining({ role: 'system' }),
      { role: 'user', content: '清晨薄雾中的古桥' },
    ],
    max_tokens: 1200,
    temperature: 0.7,
    thinking: { type: 'disabled' },
    stream: false,
  })
  await expect(panel.getByRole('textbox', { name: '文本内容' })).toHaveValue(
    '清晨的薄雾缠住古桥，河水把第一束天光带向远方。',
  )
  await expect(panel.getByText('来源模型：豆包 Seed 2.1 Pro')).toBeVisible()
  await expect(page.getByText('豆包 Seed 2.1 Pro结果已保存到项目与生成历史。'))
    .toBeVisible()

  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '文本 01', exact: true }).click()
  const restored = page.getByRole('region', { name: '文本 01 文本参数' })
  await expect(restored.getByRole('textbox', { name: '文本内容' })).toHaveValue(
    '清晨的薄雾缠住古桥，河水把第一束天光带向远方。',
  )
  await page.getByRole('button', { name: '历史记录' }).click()
  await page.getByRole('tab', { name: /文本 1/ }).click()
  await expect(page.getByRole('article', { name: '历史任务 文本 01' })).toContainText(
    '豆包 Seed 2.1 Pro',
  )
})
