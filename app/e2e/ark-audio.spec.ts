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

async function addAudioNode(page: Page) {
  const point = await blankCanvasPoint(page)
  await page.mouse.click(point.x, point.y, { button: 'right' })
  await page.getByRole('menuitem', { name: '添加节点' }).click()
  await page.getByRole('menuitem', { name: '音频', exact: true }).click()
}

function wavFixtureBase64() {
  const sampleRate = 24_000
  const samples = 2_400
  const bytes = Buffer.alloc(44 + samples * 2)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(36 + samples * 2, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(sampleRate, 24)
  bytes.writeUInt32LE(sampleRate * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(samples * 2, 40)
  for (let index = 0; index < samples; index += 1) {
    bytes.writeInt16LE(Math.round(Math.sin(index / 12) * 2_000), 44 + index * 2)
  }
  return bytes.toString('base64')
}

test('selects Ark TTS, generates intercepted audio, and restores the persistent result', async ({ page }) => {
  const requests: Array<Record<string, unknown>> = []
  await page.route(
    'https://fixture.seedream.invalid/api/v3/tts/unidirectional',
    async (route) => {
      requests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'OK',
          data: wavFixtureBase64(),
          usage: { text_words: 11 },
        }),
      })
    },
  )

  await page.goto('/projects/new')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await addAudioNode(page)

  const panel = page.getByRole('region', { name: '音频 01 音频参数' })
  const model = panel.getByRole('combobox', { name: '音频模型' })
  const ttsOption = model.locator('option[value="ark-tts"]')
  const audioGenOption = model.locator('option[value="ark-audio-gen"]')
  await expect(ttsOption).toBeEnabled()
  await expect(audioGenOption).toBeEnabled()
  await expect(ttsOption.locator('..')).toHaveAttribute(
    'label',
    '官方 API 已接（开发直连）',
  )

  await model.selectOption('ark-tts')
  await panel.getByRole('textbox', { name: '音频生成提示词' }).fill(
    '清晨薄雾中的古桥，温暖女声旁白。',
  )
  await panel.getByRole('combobox', { name: '输出格式' }).selectOption('wav')
  await panel.getByRole('spinbutton', { name: '语速' }).fill('1.2')
  await panel.getByRole('spinbutton', { name: '音量' }).fill('75')
  await page.getByRole('button', { name: '适配画布' }).click()
  await panel
    .getByRole('button', { name: '生成音频，预计成本 1' })
    .evaluate((button: HTMLButtonElement) => button.click())

  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0]).toEqual({
    req_params: {
      text: '清晨薄雾中的古桥，温暖女声旁白。',
      speaker: 'zh_female_vv_uranus_bigtts',
      audio_params: {
        format: 'wav',
        sample_rate: 24_000,
        speech_rate: 20,
        loudness_rate: 50,
      },
    },
  })
  await expect(page.getByText('豆包语音合成 2.0结果已保存到项目与生成历史。'))
    .toBeVisible()
  await expect(page.getByLabel('播放音频 01')).toBeVisible()
  await expect(panel.getByRole('link', { name: '下载音频' })).toHaveAttribute(
    'href',
    /^data:audio\/wav;base64,/,
  )

  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '音频 01', exact: true }).click()
  const restored = page.getByRole('region', { name: '音频 01 音频参数' })
  await expect(page.getByLabel('播放音频 01')).toBeVisible()
  await expect(restored.getByRole('link', { name: '下载音频' })).toHaveAttribute(
    'href',
    /^data:audio\/wav;base64,/,
  )
  await page.getByRole('button', { name: '历史记录' }).click()
  await page.getByRole('tab', { name: /音频 1/ }).click()
  await expect(page.getByRole('article', { name: '历史任务 音频 01' })).toContainText(
    '豆包语音合成 2.0',
  )
})
