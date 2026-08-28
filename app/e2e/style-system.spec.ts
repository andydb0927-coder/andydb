import { expect, test, type Page } from './provider-fixture'
import type { Project } from '../src/features/project/model'

async function currentProject(page: Page): Promise<Project> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('wireless-canvas-v1')
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error)
    })
    try {
      return await new Promise<Project>((resolve, reject) => {
        const read = db.transaction('projects').objectStore('projects').get(location.pathname.split('/').at(-1)!)
        read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error)
      })
    } finally { db.close() }
  })
}

async function openNode(page: Page, kind: '图片' | '视频' | '文本') {
  await page.goto('/projects/new')
  await page.getByRole('button', { name: '添加节点', exact: true }).click()
  await page.getByRole('menu', { name: '添加节点', exact: true }).getByRole('menuitem', { name: kind, exact: true }).click()
  return page.getByRole('region', { name: kind === '文本' ? '文本 01 文本参数' : `${kind} 01 生成参数`, exact: true })
}

test('style custom card, favorite, selected highlight, actual image prefix and raw history survive reload', async ({ page }) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 1440, height: 1024 })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const requests: Array<{ prompt: string; size: string }> = []
  await page.route('https://fixture.seedream.invalid/api/v3/images/generations', async route => {
    requests.push(route.request().postDataJSON())
    await route.fulfill({ json: { data: [{ url: 'https://media.fixture.invalid/image-style.png', size: requests.at(-1)!.size }] } })
  })
  const panel = await openNode(page, '图片')
  await panel.getByRole('button', { name: '风格', exact: true }).click()
  let gallery = page.getByRole('dialog', { name: '风格广场', exact: true })
  await gallery.getByRole('button', { name: '自定义风格' }).click()
  await gallery.getByRole('textbox', { name: '风格名称' }).fill('清晨水墨')
  await gallery.getByRole('textbox', { name: '提示词片段' }).fill('水墨留白，柔和晨光。')
  await gallery.getByRole('button', { name: '保存风格' }).click()
  const card = gallery.getByRole('article', { name: '清晨水墨' })
  await card.getByRole('button', { name: '收藏 清晨水墨', exact: true }).click()
  await card.getByRole('button', { name: '应用风格 清晨水墨' }).click()
  await expect(panel).toContainText('已应用风格：清晨水墨')
  await panel.getByRole('textbox', { name: '提示词', exact: true }).fill('薄雾中的古桥')
  await panel.getByRole('button', { name: '生成图片，预计成本 18' }).click()
  const confirmation = page.getByRole('alertdialog', { name: '确认真实图片生成' })
  await expect(confirmation).toContainText('已应用风格：清晨水墨')
  await confirmation.getByRole('button', { name: '确认生成 1 张图片' }).click()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0].prompt).toBe('水墨留白，柔和晨光。\n\n薄雾中的古桥')
  await expect.poll(async () => (await currentProject(page)).jobs[0]?.status).toBe('succeeded')
  const saved = await currentProject(page)
  expect(saved.jobs[0].prompt).toBe('薄雾中的古桥')
  expect(saved.jobs[0].generationConfig?.style?.name).toBe('清晨水墨')
  expect(saved.nodes[0].versions.at(-1)?.prompt).toBe('薄雾中的古桥')
  await page.reload()
  await page.getByRole('button', { name: '图片 01', exact: true }).click()
  await expect(panel).toContainText('已应用风格：清晨水墨')
  await panel.getByRole('button', { name: '风格', exact: true }).click()
  gallery = page.getByRole('dialog', { name: '风格广场', exact: true })
  await gallery.getByRole('tab', { name: '我的收藏' }).click()
  await expect(gallery.getByRole('article', { name: '清晨水墨' })).toHaveAttribute('data-selected', 'true')
  await expect(gallery.getByRole('button', { name: '取消收藏 清晨水墨' })).toBeVisible()
  await page.screenshot({ path: '../docs/qa/evidence/style-system/custom-style-favorite.png' })
  await gallery.getByRole('button', { name: '移除风格' }).click()
  await expect(panel).not.toContainText('已应用风格：清晨水墨')
  await expect.poll(async () => (await currentProject(page)).nodes[0].appliedStyle).toBeNull()
  await page.getByRole('button', { name: '历史记录', exact: true }).click()
  await expect(page.getByRole('complementary', { name: '历史' })).toContainText('已应用风格：清晨水墨')
  await page.getByRole('button', { name: /重发画布/ }).first().click()
  await page.getByRole('button', { name: '确认重新生成', exact: true }).click()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1].prompt).toBe(requests[0].prompt)
  expect(errors).toEqual([])
})

test('video style goes into Seedance content prompt and incompatible styles are disabled at 721px', async ({ page }) => {
  await page.setViewportSize({ width: 721, height: 778 })
  const bodies: Array<{ content: Array<{ type: string; text?: string }> }> = []
  await page.route('https://fixture.seedream.invalid/api/v3/contents/generations/tasks', async route => {
    bodies.push(route.request().postDataJSON())
    await route.fulfill({ json: { id: 'style-video-task' } })
  })
  const panel = await openNode(page, '视频')
  await panel.getByRole('button', { name: '风格', exact: true }).click()
  const gallery = page.getByRole('dialog', { name: '风格广场', exact: true })
  await expect(gallery.getByRole('button', { name: '应用风格 分镜脚本故事版分镜' })).toBeDisabled()
  await gallery.getByRole('button', { name: '应用风格 Z-Image 人像写真' }).click()
  await expect(panel).toContainText('已应用风格：Z-Image 人像写真')
  await panel.getByRole('textbox', { name: '提示词', exact: true }).fill('古桥边的人物缓缓转身')
  await panel.getByRole('button', { name: /生成视频，预计成本/ }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0].content.find(item => item.type === 'text')?.text).toBe('采用电影人像风格：克制情绪、低饱和色彩、柔和侧光、细腻胶片颗粒。\n\n古桥边的人物缓缓转身')
  await expect.poll(async () => (await currentProject(page)).jobs[0]?.status).toBe('succeeded')
  await page.screenshot({ path: '../docs/qa/evidence/style-system/video-style-721.png' })
})

test('text style is a real system prefix and does not replace the user prompt', async ({ page }) => {
  const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = []
  await page.route('https://fixture.seedream.invalid/api/v3/chat/completions', async route => {
    bodies.push(route.request().postDataJSON())
    await route.fulfill({ json: { choices: [{ message: { content: '晨雾未散，桥上的人等来故友。' } }], usage: { prompt_tokens: 20, completion_tokens: 20, total_tokens: 40 } } })
  })
  const panel = await openNode(page, '文本')
  await panel.getByRole('button', { name: '风格', exact: true }).click()
  await page.getByRole('dialog', { name: '风格广场', exact: true }).getByRole('button', { name: '应用风格 J_漫剧素材三视图' }).click()
  await panel.getByRole('textbox', { name: '文本生成提示词' }).fill('写一段古桥旁白')
  await panel.getByRole('button', { name: /生成文本，预计成本/ }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0].messages[0].content).toContain('采用漫剧角色设定风格')
  expect(bodies[0].messages[0].content).toContain('中文创作助手')
  expect(bodies[0].messages[1]).toEqual({ role: 'user', content: '写一段古桥旁白' })
  await expect.poll(async () => (await currentProject(page)).jobs[0]?.status).toBe('succeeded')
  expect((await currentProject(page)).jobs[0].generationConfig?.style?.name).toBe('J_漫剧素材三视图')
})
