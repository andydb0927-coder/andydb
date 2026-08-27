import { expect, test } from './provider-fixture'
import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

// Run after the mock production build: verifies the exact GitHub Pages artifact,
// not a dev server whose fixture keys would enable the providers.
test('production selectors contain only unconfigured real models and never generate demo results', async ({ page }) => {
  const apiRequests: string[] = []
  page.on('request', (request) => {
    if (/images\/generations|chat\/completions|contents\/generations\/tasks|tts\//.test(request.url())) apiRequests.push(request.url())
  })
  await page.route('https://catalog-fixture.local/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/andydb\/?/, '')
    const file = extname(path) ? path : 'index.html'
    const root = resolve('dist')
    const target = resolve(root, file)
    if (!target.startsWith(`${root}/`)) throw new Error('Invalid production fixture path')
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
    await route.fulfill({ contentType: types[extname(file)] ?? 'application/octet-stream', body: await readFile(target) })
  })
  await page.goto('https://catalog-fixture.local/andydb/projects/new')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  for (const [type, modelLabel, ids, promptLabel, generate] of [
    ['图片', '图片模型', ['seedream-5-pro-api', 'panorama-720-api', 'multi-camera-grid-api', 'plot-four-grid-api', 'storyboard-25-grid-api', 'cinematic-lighting-api', 'setting-image-api'], '提示词', '生成图片，预计成本 18'],
    ['视频', '模型', ['seedance-api', 'seedance-prompt-optimization-api', 'deep-motion-capture-api', 'smart-edit-api', 'frame-analysis-api'], '提示词', '生成视频，预计成本 135'],
    ['文本', '文本模型', ['ark-text-llm'], '文本生成提示词', '生成文本，预计成本 1'],
    ['音频', '音频模型', ['ark-tts', 'ark-audio-gen', 'vocal-background-separation-api', 'audio-sentence-segmentation-api'], '音频生成提示词', '生成音频，预计成本 1'],
  ] as const) {
    await page.getByRole('toolbar', { name: '画布模式工具' }).getByRole('button', { name: '添加节点' }).click()
    await page.getByRole('menu', { name: '添加节点' }).getByRole('menuitem', { name: type, exact: true }).click()
    const model = page.getByRole('combobox', { name: modelLabel, exact: true })
    await expect(model).toBeVisible()
    expect(await model.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(ids)
    for (const option of await model.getByRole('option').all()) {
      await expect(option).toHaveJSProperty('disabled', true)
      await expect(option).toContainText(/未配置|配置未完成|未启用|待接入/)
    }
    await expect(model).not.toContainText(/Mock Studio|本地演示|内部测试/)
    await page.getByRole('textbox', { name: promptLabel, exact: true }).fill('未配置时不得生成演示内容')
    await expect(page.getByRole('button', { name: generate })).toBeDisabled()
  }
  await page.goto('https://catalog-fixture.local/andydb/agents')
  const skillModel = page.getByRole('combobox', { name: '选择模型', exact: true })
  await expect(skillModel).toHaveValue('seedance-api')
  await expect(skillModel.getByRole('option')).toHaveCount(5)
  for (const option of await skillModel.getByRole('option').all()) await expect(option).toHaveJSProperty('disabled', true)
  await expect(skillModel).not.toContainText(/Mock Studio|本地演示|MiniMax|Seedance 2.5/)
  await expect(page.getByRole('button', { name: '开始创作' })).toBeDisabled()
  expect(apiRequests).toEqual([])
})
