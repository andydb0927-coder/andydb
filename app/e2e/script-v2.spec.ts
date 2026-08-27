import { expect, test, type Page } from './provider-fixture'
import { scriptBreakdownFixture, scriptShotsFixture, scriptChatFixture } from '../src/features/script/fixtures/script-v2.fixture'
import { subjectResponseFixture } from '../src/features/generation/fixtures/ark-final.fixture'
import type { Project } from '../src/features/project/model'
import type { SubjectAsset } from '../src/features/subjects/subject-model'
import type { LibraryAssetRecord } from '../src/features/assets/library-model'

async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('wireless-canvas-v1')
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error)
    })
    const read = <T>(store: string) => new Promise<T[]>((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).getAll()
      request.onsuccess = () => resolve(request.result as T[]); request.onerror = () => reject(request.error)
    })
    const [projects, subjects, assets] = await Promise.all([read<Project>('projects'), read<SubjectAsset>('subjects'), read<LibraryAssetRecord>('libraryAssets')])
    db.close()
    return { projects, subjects, assets }
  })
}

async function fixture(page: Page, failSecond = false) {
  const imageRequests: Array<Record<string, unknown>> = []
  const chatRequests: Array<Record<string, unknown>> = []
  await page.route('https://fixture.seedream.invalid/api/v3/chat/completions', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    chatRequests.push(body)
    const text = JSON.stringify(body)
    await route.fulfill({ json: text.includes('script-v2-breakdown') ? scriptChatFixture(scriptBreakdownFixture) : text.includes('script-v2-storyboard') ? scriptChatFixture(scriptShotsFixture) : subjectResponseFixture })
  })
  await page.route('https://fixture.seedream.invalid/api/v3/images/generations', async route => {
    imageRequests.push(route.request().postDataJSON() as Record<string, unknown>)
    if (failSecond && imageRequests.length === 2) { await route.fulfill({ status: 500, body: 'private-upstream-detail' }); return }
    await route.fulfill({ json: { data: [{ url: `https://media.fixture.invalid/image-script-shot-${imageRequests.length}.png`, size: imageRequests.at(-1)!.size }] } })
  })
  return { imageRequests, chatRequests }
}

async function openScript(page: Page) {
  await page.goto('/projects/new')
  await page.getByRole('button', { name: '添加节点', exact: true }).click()
  const menu = page.getByRole('menu', { name: '添加节点', exact: true })
  await menu.getByRole('menuitem', { name: '脚本', exact: true }).click()
  const panel = page.getByRole('region', { name: '脚本 01 脚本参数' })
  await panel.getByRole('button', { name: 'AI拆解', exact: true }).click()
  const workspace = page.getByRole('dialog', { name: '脚本 v2 工作台', exact: true })
  await workspace.getByRole('textbox', { name: '剧本原文' }).fill('清晨，小舟提着旧灯笼走过薄雾中的古桥，与旧友告别，留下一只纸船。')
  return workspace
}

async function confirm(page: Page, cost: number) {
  const confirm = page.getByRole('dialog', { name: '确认脚本任务费用' })
  await expect(confirm).toContainText(`总预计成本 ${cost} 积分`)
  await confirm.getByRole('button', { name: '确认并执行' }).click()
}

async function analyze(page: Page) {
  const workspace = await openScript(page)
  await workspace.getByRole('button', { name: 'AI拆解', exact: true }).click()
  await confirm(page, 1)
  await expect(workspace.getByRole('region', { name: '剧本角色' })).toContainText('小舟')
  await workspace.getByRole('button', { name: '生成分镜故事板' }).click()
  await confirm(page, 1)
  await expect(workspace.getByRole('article', { name: '分镜 1 薄雾古桥' })).toBeVisible()
  return workspace
}

test('script v2 completes persisted breakdown, editable storyboard, serial images, subjects and canvas delivery', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const { imageRequests, chatRequests } = await fixture(page)
  const workspace = await analyze(page)
  const first = workspace.getByRole('article', { name: '分镜 1 薄雾古桥' })
  await first.getByText('编辑分镜', { exact: true }).click()
  await first.getByRole('textbox', { name: '分镜 1 机位' }).fill('桥面低机位')
  await workspace.getByRole('combobox', { name: '分镜画面比例' }).selectOption('21:9')
  await expect(workspace).toContainText('3136 × 1344')
  await workspace.getByRole('button', { name: '批量生成分镜' }).click()
  await confirm(page, 36)
  await expect(workspace).toContainText('本轮完成 2 镜，失败 0 镜')
  expect(imageRequests).toHaveLength(2)
  expect(imageRequests[0]).toMatchObject({ size: '3136x1344', prompt: expect.stringContaining('桥面低机位') })
  expect(imageRequests[1]).toMatchObject({ size: '3136x1344' })
  await expect(first.getByRole('img')).toBeVisible()
  const character = workspace.getByRole('article', { name: '角色 小舟' })
  await character.getByRole('combobox', { name: '小舟参考图' }).selectOption({ label: '薄雾古桥' })
  await character.getByRole('button', { name: '提取主体', exact: true }).click()
  await confirm(page, 1)
  await expect(character).toContainText('已入主体库')
  await expect.poll(async () => (await stored(page)).subjects.length).toBe(1)
  expect(chatRequests).toHaveLength(3)
  const before = await stored(page)
  expect(before.projects[0].jobs.filter(job => job.status === 'succeeded')).toHaveLength(5)
  const script = before.projects[0].nodes.find(node => node.details?.type === 'script')!
  expect(script.details?.type === 'script' && script.details.shots?.every(shot => before.assets.some(asset => asset.id === shot.assetId))).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('script-v2-workspace.png') })
  await workspace.getByRole('button', { name: '关闭脚本工作台' }).click()
  await page.getByRole('button', { name: '故事板', exact: true }).click()
  const board = page.getByRole('region', { name: '脚本 01分镜故事板', exact: true })
  await board.getByRole('article', { name: '分镜 1 薄雾古桥' }).getByText('编辑分镜', { exact: true }).click()
  await board.getByRole('textbox', { name: '分镜 1 运镜' }).fill('缓慢横移')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '故事板', exact: true }).click()
  await expect(board.getByRole('img', { name: '分镜 1 薄雾古桥' })).toBeVisible()
  await board.getByRole('button', { name: '发送分镜 1 到画布' }).click()
  await expect(page.getByRole('button', { name: '薄雾古桥', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '故事板', exact: true }).click()
  await board.getByRole('button', { name: '发送分镜 1 到画布' }).click()
  await expect(page.getByRole('button', { name: '薄雾古桥', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: '角色库', exact: true }).click()
  await expect(page.getByRole('article', { name: '主体 小舟', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

for (const viewport of [{ width: 721, height: 778 }, { width: 720, height: 450 }]) {
test(`script v2 preserves partial success and retry reachability at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
  await page.setViewportSize(viewport)
  const { imageRequests } = await fixture(page, true)
  const workspace = await analyze(page)
  await workspace.getByRole('button', { name: '批量生成分镜' }).click()
  await confirm(page, 36)
  await expect(workspace).toContainText('本轮完成 1 镜，失败 1 镜')
  await expect(workspace.getByRole('article', { name: '分镜 2 纸船远去' })).toContainText('生成失败')
  await expect(workspace).not.toContainText('private-upstream-detail')
  await workspace.getByRole('button', { name: '关闭脚本工作台' }).click()
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '适配画布', exact: true }).click()
  await page.getByRole('button', { name: '脚本 01', exact: true }).click()
  await page.getByRole('region', { name: '脚本 01 脚本参数' }).getByRole('button', { name: '分镜工作台' }).click()
  await expect(workspace).toContainText('总预计成本 18 积分')
  await workspace.getByRole('button', { name: '批量生成分镜' }).click()
  await confirm(page, 18)
  await expect(workspace).toContainText('本轮完成 1 镜，失败 0 镜')
  expect(imageRequests).toHaveLength(3)
  await workspace.getByRole('article', { name: '分镜 2 纸船远去' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath(`script-v2-${viewport.width}x${viewport.height}.png`) })
  await page.keyboard.press('Escape')
  await expect(workspace).toHaveCount(0)
})
}
