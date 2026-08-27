import { expect, test } from './provider-fixture'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { resolveOfflineDist, resolveStaticFixtureFile } from './static-dist-fixture'

// Run after npm run build:mock: verifies the exact GitHub Pages artifact,
// not a dev server whose fixture keys would enable the providers.
test('production selectors contain only unconfigured real models and never generate demo results', async ({ page }) => {
  const root = resolveOfflineDist()
  const apiRequests: string[] = []
  page.on('request', (request) => {
    if (/images\/generations|chat\/completions|contents\/generations\/tasks|tts\//.test(request.url())) apiRequests.push(request.url())
  })
  await page.route('https://catalog-fixture.local/**', async (route) => {
    const target = resolveStaticFixtureFile(root, new URL(route.request().url()).pathname)
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
    await route.fulfill({ contentType: types[extname(target)] ?? 'application/octet-stream', body: await readFile(target) })
  })
  await page.goto('https://catalog-fixture.local/andydb/projects/new')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  const indexDocument = await readFile(resolveStaticFixtureFile(root, '/andydb/'), 'utf8')
  for (const path of ['/andydb/projects/new', '/andydb/1', '/andydb/1/index.html', '/andydb/missing-fixture.js']) {
    const response = await page.evaluate(async (pathname) => {
      const result = await fetch(pathname)
      return { status: result.status, type: result.headers.get('content-type'), body: await result.text() }
    }, path)
    expect(response.status).toBe(200)
    expect(response.type).toContain('text/html')
    expect(response.body).toBe(indexDocument)
  }
  for (const [type, modelLabel, ids, promptLabel, generate] of [
    ['图片', '图片模型', ['seedream-5-pro-api'], '提示词', '生成图片，预计成本 18'],
    ['视频', '模型', ['seedance-api', 'seedance-prompt-optimization-api', 'deep-motion-capture-api', 'smart-edit-api'], '提示词', '生成视频，预计成本 135'],
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
    if (type === '图片') {
      await expect(model).not.toContainText(/720全景|九宫格|四宫格|25宫格|光影|设定图/)
      const presetTrigger = page.getByRole('button', { name: '图片创作模板' })
      await presetTrigger.click()
      const presets = page.getByRole('dialog', { name: '图片创作模板' })
      for (const label of ['720全景', '多机位九宫格', '剧情推演四宫格', '25宫格连贯分镜', '电影级光影校正', '角色设定图']) {
        await expect(presets.getByRole('button', { name: label, exact: true })).toBeVisible()
      }
      await presets.getByRole('button', { name: '720全景', exact: true }).click()
      const notice = page.getByRole('dialog', { name: '720全景', exact: true })
      await expect(notice).toContainText('720全景开发验证配置未完成')
      await expect(notice.getByRole('button', { name: '确认生成' })).toBeDisabled()
      await expect(notice).toContainText('不保证等距柱状投影')
      await page.keyboard.press('Escape')
      await expect(notice).toHaveCount(0)
      await expect(presetTrigger).toBeFocused()
      await expect(model).toHaveValue('seedream-5-pro-api')
      await expect(page.getByRole('button', { name: generate })).toBeDisabled()
    }
  }
  await page.goto('https://catalog-fixture.local/andydb/agents')
  const skillModel = page.getByRole('combobox', { name: '选择模型', exact: true })
  await expect(skillModel).toHaveValue('seedance-api')
  await expect(skillModel.getByRole('option')).toHaveCount(4)
  for (const option of await skillModel.getByRole('option').all()) await expect(option).toHaveJSProperty('disabled', true)
  await expect(skillModel).not.toContainText(/Mock Studio|本地演示|MiniMax|Seedance 2.5/)
  await expect(page.getByRole('button', { name: '开始创作' })).toBeDisabled()
  expect(apiRequests).toEqual([])
})
