import { createFixtureCinematicProject, expect, test, type Page } from './provider-fixture'
import { subjectResponseFixture } from '../src/features/generation/fixtures/ark-final.fixture'

async function readStoredState(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('wireless-canvas-v1')
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error)
    })
    const read = (store: string) => new Promise<any[]>((resolve, reject) => {
      const get = db.transaction(store).objectStore(store).getAll()
      get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error)
    })
    const [subjects, projects, assets] = await Promise.all(['subjects', 'projects', 'libraryAssets'].map(read))
    db.close()
    return { subjects, projects, assets }
  })
}

test('auto-extracts a reviewed subject without replacing the image and persists structured data for reuse', async ({ page }) => {
  const requests: any[] = []
  let release!: () => void
  await page.route('https://fixture.seedream.invalid/api/v3/chat/completions', async route => {
    requests.push(route.request().postDataJSON())
    await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ json: subjectResponseFixture })
  })
  await createFixtureCinematicProject(page)
  await page.getByRole('button', { name: '适配画布' }).click()
  const before = await readStoredState(page)
  await page.getByRole('button', { name: '场景设定', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '创建主体' }).click()
  const dialog = page.getByRole('dialog', { name: '创建本地主体' })
  await expect(dialog.getByRole('status')).toContainText('正在提取')
  await expect.poll(() => requests.length).toBe(1)
  await dialog.getByLabel('主体名称').fill('我命名的旅人')
  release()
  await expect(dialog.getByLabel('主体外貌')).toHaveValue('短发，面向镜头')
  await expect(dialog.getByLabel('主体服装')).toHaveValue('蓝色外套，灰色围巾')
  await expect(dialog.getByLabel('主体名称')).toHaveValue('我命名的旅人')
  await expect(dialog.getByRole('status')).toContainText('0.021000')
  expect(requests[0].messages[1].content[0]).toMatchObject({ type: 'image_url', image_url: { url: expect.stringContaining('https://media.fixture.invalid/') } })
  expect((await readStoredState(page)).subjects).toHaveLength(0)
  await dialog.getByRole('button', { name: '保存到主体库' }).click()
  await expect(page.getByRole('article', { name: '主体 我命名的旅人' })).toBeVisible()
  const after = await readStoredState(page)
  expect(after.subjects[0]).toMatchObject({ name: '我命名的旅人', aiExtraction: { appearance: '短发，面向镜头', clothing: '蓝色外套，灰色围巾', providerId: 'ai-subject-extraction', usage: { inputTokens: 2000, outputTokens: 300 } } })
  expect(after.projects[0].nodes.map((node: any) => node.versions)).toEqual(before.projects[0].nodes.map((node: any) => node.versions))
  expect(after.projects[0].jobs).toEqual(before.projects[0].jobs)
  expect(after.assets).toEqual(before.assets)
  await page.reload()
  await page.getByRole('button', { name: '角色库' }).click()
  await expect(page.getByRole('article', { name: '主体 我命名的旅人' })).toContainText('蓝色外套')
  expect((await readStoredState(page)).subjects[0].aiExtraction.usage.estimatedCostCny).toBe(0.021)
  await page.goto('/projects/new')
  await page.getByRole('button', { name: '角色库' }).click()
  const subject = page.getByRole('article', { name: '主体 我命名的旅人' })
  await subject.getByRole('button', { name: '使用我命名的旅人' }).click()
  await expect(page.getByRole('button', { name: '我命名的旅人', exact: true })).toBeVisible()
  expect(requests).toHaveLength(1)
})

test('shows safe extraction errors, allows manual input and cancels pending analysis without creating subjects', async ({ page }) => {
  await page.setViewportSize({ width: 721, height: 778 })
  await page.route('https://fixture.seedream.invalid/api/v3/chat/completions', route => route.fulfill({ status: 403, body: 'private-fixture-key' }))
  await createFixtureCinematicProject(page)
  await page.getByRole('button', { name: '适配画布' }).click()
  const image = page.getByRole('button', { name: '场景设定', exact: true })
  await image.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '创建主体' }).click()
  const dialog = page.getByRole('dialog', { name: '创建本地主体' })
  await expect(dialog.getByRole('alert')).toContainText('主体提取')
  await expect(dialog).not.toContainText('private-fixture-key')
  await dialog.getByLabel('主体名称').fill('手动名称仍可用')
  await expect(dialog.getByRole('button', { name: '保存到主体库' })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  let release!: () => void
  let calls = 0
  await page.route('https://fixture.seedream.invalid/api/v3/chat/completions', async route => {
    calls++
    await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ json: subjectResponseFixture }).catch(() => undefined)
  })
  await image.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '创建主体' }).click()
  await expect(dialog.getByRole('status')).toContainText('正在提取')
  await expect.poll(() => calls).toBe(1)
  await page.keyboard.press('Escape')
  release()
  await expect(dialog).toHaveCount(0)
  expect((await readStoredState(page)).subjects).toEqual([])
})

test('exposes honest voice cloning limits and runs local video prompt optimization without networking', async ({ page }) => {
  const apiRequests: string[] = []
  page.on('request', request => { if (/chat\/completions|tts\/|generations/.test(request.url())) apiRequests.push(request.url()) })
  await page.goto('/projects/new')
  await page.getByRole('button', { name: '添加节点' }).click()
  await page.getByRole('menu', { name: '添加节点' }).getByRole('menuitem', { name: '音频', exact: true }).click()
  const clone = page.getByRole('button', { name: /音色克隆/ })
  await clone.scrollIntoViewIfNeeded()
  await expect(clone).toBeDisabled()
  await expect(clone).toHaveAccessibleDescription(/openspeech.*专用.*槽位/)
  await page.getByRole('button', { name: '添加节点' }).click()
  await page.getByRole('menu', { name: '添加节点' }).getByRole('menuitem', { name: '视频', exact: true }).click()
  const prompt = page.getByRole('textbox', { name: '提示词', exact: true })
  await prompt.fill('雨夜古桥')
  await page.getByRole('button', { name: '本地优化提示词' }).click()
  await expect(prompt).toContainText('镜头：')
  await expect(page.getByText('本地规则优化完成，免费且不联网；公开视频API未提供独立优化端点，真实 AI 优化待接入。')).toBeVisible()
  expect(apiRequests).toEqual([])
})
