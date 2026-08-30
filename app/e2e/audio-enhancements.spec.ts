import { expect, test, type Page } from './provider-fixture'
import type { Locator } from '@playwright/test'
import type { Project } from '../src/features/project/model'

function wavFixture(seconds = 4) {
  const rate = 24000
  const length = rate * seconds
  const bytes = Buffer.alloc(44 + length * 2)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + length * 2, 4)
  bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28)
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(length * 2, 40)
  for (let i = 0; i < length; i++) bytes.writeInt16LE(Math.round(Math.cos(i * Math.PI / 24) * 8000), 44 + i * 2)
  return bytes.toString('base64')
}

async function createAudio(page: Page) {
  await page.goto('/projects/new')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await page.getByRole('button', { name: '添加节点', exact: true }).click()
  await page.getByRole('menuitem', { name: '音频', exact: true }).click()
  await expect(page.getByRole('region', { name: '音频 01 音频参数' })).toBeVisible()
  await page.getByRole('button', { name: '适配画布' }).click()
  return page.getByRole('region', { name: '音频 01 音频参数' })
}

async function readProject(page: Page): Promise<Project> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('wireless-canvas-v1')
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error)
    })
    try {
      return await new Promise((resolve, reject) => {
        const read = db.transaction('projects').objectStore('projects').get(location.pathname.split('/').at(-1)!)
        read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error)
      })
    } finally { db.close() }
  })
}

async function rangeValue(slider: Locator, value: number) {
  await slider.scrollIntoViewIfNeeded()
  const min = Number(await slider.getAttribute('min'))
  const step = Number(await slider.getAttribute('step'))
  await slider.press('Home')
  for (let i = 0; i < Math.round((value - min) / step); i++) await slider.press('ArrowRight')
  await expect(slider).toHaveValue(String(value))
}

test('official voices and pitch persist; two audio versions preview and restore without more API requests at 721px', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 721, height: 778 })
  const bodies: Array<{ req_params: { speaker: string; additions?: string; audio_params: Record<string, unknown> } }> = []
  await page.route('**/tts/unidirectional', async route => {
    bodies.push(route.request().postDataJSON())
    await route.fulfill({ json: { code: 0, data: wavFixture(bodies.length === 1 ? 4 : 3), usage: { text_words: 10 } } })
  })
  const panel = await createAudio(page)
  await panel.getByRole('combobox', { name: '音频模型' }).selectOption('ark-tts')
  const voice = panel.getByRole('combobox', { name: '音色', exact: true })
  await voice.selectOption('zh_male_m191_uranus_bigtts')
  await panel.getByRole('textbox', { name: '音频生成提示词' }).fill('清晨薄雾中的古桥，第一版旁白。')
  await rangeValue(panel.getByRole('slider', { name: '音调', exact: true }), 3)
  await rangeValue(panel.getByRole('slider', { name: '语速', exact: true }), 1.2)
  await panel.getByRole('combobox', { name: '输出格式' }).selectOption('wav')
  const generate = panel.getByRole('button', { name: '生成音频，预计成本 1', exact: true })
  await generate.scrollIntoViewIfNeeded()
  await generate.click()
  const info = panel.getByRole('group', { name: '音频结果信息' })
  await expect(info).toContainText('4.00s')
  await expect(info).toContainText('24000 Hz')
  await expect(info).toContainText('WAV')
  await expect(info).toContainText('1 积分')
  expect(bodies[0].req_params.speaker).toBe('zh_male_m191_uranus_bigtts')
  expect(JSON.parse(bodies[0].req_params.additions!)).toEqual({ post_process: { pitch: 3 } })
  expect(bodies[0].req_params.audio_params).toMatchObject({ speech_rate: 20, loudness_rate: 50 })

  await panel.getByText('音色样音（4）').click()
  const audition = panel.getByRole('button', { name: '试听 云舟 2.0' })
  await audition.click()
  await expect(panel.getByLabel('音色样音播放器')).toHaveJSProperty('paused', false)
  await expect(panel.getByRole('button', { name: '试听 Vivi 2.0' })).toBeDisabled()
  expect(bodies).toHaveLength(1)
  await panel.getByText('音色样音（4）').click()

  await voice.selectOption('zh_female_vv_uranus_bigtts')
  await rangeValue(panel.getByRole('slider', { name: '音调', exact: true }), -2)
  await panel.getByRole('textbox', { name: '音频生成提示词' }).fill('暮色中归来的小船，第二版旁白。')
  await generate.click()
  await expect(info).toContainText('3.00s')
  await panel.getByText('音频版本（2）').click()
  await expect(panel.getByRole('img', { name: '音频版本 1 波形' })).toBeVisible()
  await expect(panel.getByRole('img', { name: '音频版本 2 波形' }).locator('span')).toHaveCount(64)
  await expect(panel.getByLabel('试听音频版本 1')).toHaveAttribute('src', /^data:audio\/wav/)
  await expect(panel.getByLabel('试听音频版本 2')).toHaveAttribute('src', /^data:audio\/wav/)
  await panel.getByRole('button', { name: '恢复音频版本 1' }).click()
  await expect(voice).toHaveValue('zh_male_m191_uranus_bigtts')
  await expect(panel.getByRole('slider', { name: '音调', exact: true })).toHaveValue('3')
  await expect(info).toContainText('4.00s')
  await expect(panel.getByRole('textbox', { name: '音频生成提示词' })).toHaveValue('清晨薄雾中的古桥，第一版旁白。')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '音频 01', exact: true }).click()
  await expect(voice).toHaveValue('zh_male_m191_uranus_bigtts')
  await expect(panel.getByRole('slider', { name: '音调', exact: true })).toHaveValue('3')
  await expect(info).toContainText('4.00s')
  await panel.getByText('音频版本（2）').click()
  await expect(panel.getByRole('img', { name: '音频版本 1 波形' })).toBeVisible()
  await page.getByRole('button', { name: '适配画布' }).click()
  await panel.getByRole('button', { name: '恢复音频版本 1' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: '../docs/qa/evidence/audio-enhancement/versions-721.png' })
  expect(bodies).toHaveLength(2)
  expect(errors).toEqual([])
})

test('audio generation pitch and offline fades/normalization produce a real persisted WAV without paid requests', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1024 })
  const bodies: Array<{ audio_config: Record<string, unknown> }> = []
  await page.route('**/tts/create', async route => {
    bodies.push(route.request().postDataJSON())
    await route.fulfill({ json: { audio: wavFixture(), duration: 4, original_duration: 4 } })
  })
  const panel = await createAudio(page)
  await panel.getByRole('combobox', { name: '音频模型' }).selectOption('ark-audio-gen')
  await panel.getByRole('textbox', { name: '音频生成提示词' }).fill('微风拂过湖面的环境音。')
  await panel.getByRole('combobox', { name: '输出格式' }).selectOption('ogg_opus')
  await expect(panel.getByRole('combobox', { name: '采样率' })).toHaveValue('48000')
  await expect(panel.getByRole('combobox', { name: '采样率' }).locator('option')).toHaveCount(1)
  await panel.getByRole('combobox', { name: '输出格式' }).selectOption('wav')
  await panel.getByRole('combobox', { name: '采样率' }).selectOption('24000')
  await rangeValue(panel.getByRole('slider', { name: '音调', exact: true }), -3)
  await panel.getByRole('button', { name: '生成音频，预计成本 12', exact: true }).click()
  // Local queue accounting reserves the declared target cost; provider currency
  // estimate separately uses the returned original_duration (4 seconds).
  await expect(panel.getByRole('group', { name: '音频结果信息' })).toContainText('12 积分（约¥0.066667）')
  await page.getByRole('button', { name: '适配画布' }).click()
  expect(bodies[0].audio_config).toMatchObject({ pitch_rate: -3, sample_rate: 24000, format: 'wav' })
  await rangeValue(panel.getByRole('slider', { name: '音频变速' }), 2)
  await rangeValue(panel.getByRole('slider', { name: '音频淡入' }), 0.2)
  await rangeValue(panel.getByRole('slider', { name: '音频淡出' }), 0.2)
  await panel.getByRole('checkbox', { name: '音量归一化' }).check()
  await panel.getByRole('button', { name: '试听选区' }).scrollIntoViewIfNeeded()
  await panel.getByRole('button', { name: '试听选区' }).click()
  const preview = panel.getByLabel('本地处理试听')
  await expect(preview).toHaveAttribute('src', /^data:audio\/wav;base64,/)
  const decoded = await preview.evaluate(async (element: HTMLAudioElement) => {
    const context = new AudioContext()
    try {
      const buffer = await context.decodeAudioData(await (await fetch(element.src)).arrayBuffer())
      const samples = buffer.getChannelData(0)
      let peak = 0
      for (const value of samples) peak = Math.max(peak, Math.abs(value))
      return { duration: buffer.duration, peak, first: samples[0], last: samples.at(-1) }
    } finally { await context.close() }
  })
  expect(decoded.duration).toBeCloseTo(2, 2)
  expect(decoded.peak).toBeCloseTo(10 ** (-1 / 20), 2)
  expect(Math.abs(decoded.first)).toBeLessThan(0.002)
  expect(Math.abs(decoded.last!)).toBeLessThan(0.002)
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  expect((await readProject(page)).assets.filter(asset => asset.kind === 'audio')).toHaveLength(1)
  await panel.getByRole('button', { name: '截取并导出 WAV' }).click()
  await expect(page.getByText('已导出本地处理 WAV（截取/变速/淡入淡出/归一化），结果已写入资产库。')).toBeVisible()
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  const saved = await readProject(page)
  const audio = saved.assets.filter(asset => asset.kind === 'audio')
  expect(audio).toHaveLength(2)
  expect(audio[1].mimeType).toBe('audio/wav')
  expect(audio[1].durationSeconds).toBeCloseTo(2, 3)
  expect(audio[1].sampleRate).toBeGreaterThan(0)
  expect(saved.jobs).toHaveLength(1)
  const source = saved.nodes.find(node => node.title === '音频 01')!
  expect(source.details).toMatchObject({ fadeInSeconds: 0.2, fadeOutSeconds: 0.2, normalize: true, playbackRate: 2, pitch: -3 })
  const output = saved.nodes.find(node => node.title === '音频 01 2.0x')!
  // Local processing preserves the source dependency now that every canvas
  // node kind can be connected through the shared graph policy.
  expect(output.versions.find(version => version.id === output.activeVersionId)?.assetId).toBe(audio[1].id)
  expect(saved.edges).toContainEqual(expect.objectContaining({
    sourceNodeId: source.id,
    targetNodeId: output.id,
  }))
  await page.reload()
  expect((await readProject(page)).assets.filter(asset => asset.kind === 'audio')).toHaveLength(2)
  await page.getByRole('button', { name: '音频 01 2.0x', exact: true }).click()
  await page.getByRole('button', { name: '适配画布' }).click()
  const outputPanel = page.getByRole('region', { name: '音频 01 2.0x 音频参数' })
  await expect(outputPanel.getByRole('group', { name: '音频结果信息' })).toContainText('2.00s')
  await outputPanel.getByRole('link', { name: '下载音频' }).scrollIntoViewIfNeeded()
  await expect(outputPanel.getByRole('link', { name: '下载音频' })).toHaveAttribute('download', '音频 01 2.0x.wav')
  await page.screenshot({ path: '../docs/qa/evidence/audio-enhancement/local-wav-1440.png' })
  await page.getByRole('button', { name: '资产管理', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '资产管理' })).toContainText('音频 01 2.0x')
  expect(bodies).toHaveLength(1)
  expect(errors).toEqual([])
})
