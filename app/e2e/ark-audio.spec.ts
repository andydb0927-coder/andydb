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
  await expect(restored.getByRole('button', { name: '人声/背景音分离', exact: true })).toBeDisabled()
  await expect(restored.getByRole('button', { name: '音频智能断句切分', exact: true })).toBeDisabled()
  await expect(restored.getByRole('button', { name: '试听选区' })).toBeEnabled()
  await expect(restored.getByRole('button', { name: '截取并导出 WAV' })).toBeEnabled()
  expect(requests).toHaveLength(1)
  await page.getByRole('button', { name: '历史记录' }).click()
  await page.getByRole('tab', { name: /音频 1/ }).click()
  await expect(page.getByRole('article', { name: '历史任务 音频 01' })).toContainText(
    '豆包语音合成 2.0',
  )
})

test('keeps unsupported audio post tools disabled without requests or persistent changes', async ({ page }) => {
  const networkAttempts: string[] = []
  await page.route(/https:\/\/.*(?:fixture\.|volcengine|volces|bytedance)/, async (route) => {
    networkAttempts.push(route.request().url())
    await route.abort('blockedbyclient')
  })
  await page.goto('/projects/new')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await addAudioNode(page)
  const panel = page.getByRole('region', { name: '音频 01 音频参数' })
  for (const [name, alternative] of [['人声/背景音分离', 'AI MediaKit'], ['音频智能断句切分', '豆包语音 ASR']]) {
    const tool = panel.getByRole('button', { name, exact: true })
    await expect(tool).toBeDisabled()
    await expect(tool).toHaveAccessibleDescription(new RegExp(`当前 Ark 接口不支持.*${alternative}`))
    await expect(tool).toHaveAccessibleDescription(/非官方报价.*不会扣费/)
    await expect(tool.locator('.ai-placeholder-badge')).toHaveText('待接入')
  }
  const model = panel.getByRole('combobox', { name: '音频模型' })
  for (const value of ['vocal-background-separation-api', 'audio-sentence-segmentation-api']) {
    await expect(model.locator(`option[value="${value}"]`)).toHaveJSProperty('disabled', true)
  }
  await expect(model.locator('option[value="ark-tts"]')).toHaveJSProperty('disabled', false)
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  const readPersistentCounts = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('wireless-canvas-v1')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    try {
      const tx = db.transaction(['projects', 'libraryAssets'], 'readonly')
      const read = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const [project, libraryCount] = await Promise.all([
        read(tx.objectStore('projects').get(location.pathname.split('/').at(-1)!)),
        read(tx.objectStore('libraryAssets').count()),
      ])
      return { jobs: project.jobs.length, assets: project.assets.length, libraryCount, versions: project.nodes.map((node: { versions: unknown[] }) => node.versions.length) }
    } finally { db.close() }
  })
  const before = await readPersistentCounts()
  expect(before.jobs).toBe(0)
  await page.reload()
  await page.getByRole('button', { name: '音频 01', exact: true }).click()
  await expect(panel.getByRole('button', { name: '人声/背景音分离', exact: true })).toBeDisabled()
  await expect(panel.getByRole('button', { name: '音频智能断句切分', exact: true })).toBeDisabled()
  expect(await readPersistentCounts()).toEqual(before)
  expect(networkAttempts).toEqual([])
})
