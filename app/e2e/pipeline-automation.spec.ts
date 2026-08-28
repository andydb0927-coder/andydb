import { expect, test, type Page } from './provider-fixture'
import { createProject, type CanvasNode, type Project } from '../src/features/project/model'
import type { PipelineRun } from '../src/features/pipeline/pipeline-model'

async function records<T>(page: Page, table: string): Promise<T[]> {
  return page.evaluate(async name => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open('wireless-canvas-v1'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error) })
    try { return await new Promise<T[]>((resolve, reject) => { const read = db.transaction(name).objectStore(name).getAll(); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error) }) }
    finally { db.close() }
  }, table)
}
async function seed(page: Page, transform = false) {
  await page.goto('/projects/new')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  const id = new URL(page.url()).pathname.split('/').at(-1)!
  const project = { ...createProject('管线端到端验收', ''), id }
  project.nodes = [0, 1, 2].map((i): CanvasNode => ({ id: `p${i}`, kind: i === 0 ? 'text' : 'image', title: ['故事起点', '分镜图片', '镜像后处理'][i], modelProviderId: i === 0 ? 'ark-text-llm' : 'seedream-5-pro-api', position: { x: 50 + i * 430, y: 100 }, activeVersionId: `v${i}`, versions: [{ id: `v${i}`, prompt: i === 0 ? '清晨薄雾中的古桥' : '电影远景构图', createdAt: project.createdAt }], sourceChanged: false,
    ...(i === 0 ? { details: { type: 'text', content: '', fontStyle: '正文', editorMode: 'generate', prompt: '清晨薄雾中的古桥', modelProviderId: 'ark-text-llm' } as const } : {}),
    ...(i === 2 && transform ? { pipelineConfig: { action: 'image-transform', mirrorHorizontal: true, rotationQuarterTurns: 1 } } : {}),
  }))
  project.edges = [{ id: 'e1', sourceNodeId: 'p0', targetNodeId: 'p1' }, { id: 'e2', sourceNodeId: 'p1', targetNodeId: 'p2' }]
  project.canvases![0] = { ...project.canvases![0], nodes: project.nodes, edges: project.edges, viewport: { x: 0, y: 40, zoom: 0.7 } }
  await page.evaluate(async project => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open('wireless-canvas-v1'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error) })
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(project); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }) }
    finally { db.close() }
  }, project)
  await page.reload()
  await expect(page.getByRole('button', { name: '管线自动化', exact: true })).toBeVisible()
  return id
}
async function open(page: Page) {
  await page.getByRole('button', { name: '管线自动化', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '管线自动化', exact: true })
  await expect(panel).toBeVisible()
  return panel
}
async function start(page: Page) {
  const panel = await open(page)
  await panel.getByLabel('管线起点', { exact: true }).selectOption('p0')
  await panel.getByRole('button', { name: '执行整条管线', exact: true }).click()
  await page.getByRole('alertdialog', { name: '确认执行管线' }).getByRole('button', { name: '确认执行', exact: true }).click()
  return panel
}
async function run(page: Page) { return (await records<PipelineRun>(page, 'pipelineRuns'))[0] }
async function project(page: Page, id: string) { return (await records<Project>(page, 'projects')).find(item => item.id === id)! }

test('topology runs fresh text → image → real local transform; templates and history survive refresh', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const requests: Array<{ prompt: string; size: string }> = []
  await page.route('https://fixture.seedream.invalid/api/v3/images/generations', async route => {
    requests.push(route.request().postDataJSON())
    await route.fulfill({ json: { data: [{ url: 'https://media.fixture.invalid/image-pipeline.png', size: requests.at(-1)!.size }] } })
  })
  const id = await seed(page, true)
  const panel = await start(page)
  await expect.poll(async () => (await run(page))?.status).toBe('succeeded')
  await expect(page.getByRole('status', { name: '故事起点管线状态', exact: true })).toHaveText('已完成')
  await expect(page.getByRole('status', { name: '镜像后处理管线状态', exact: true })).toHaveText('已完成')
  expect(requests).toHaveLength(1)
  expect(requests[0].prompt).toContain('已生成文本：清晨薄雾中的古桥')
  const saved = await project(page, id)
  expect(saved.jobs).toHaveLength(3)
  expect(saved.jobs.every(job => job.status === 'succeeded')).toBe(true)
  expect(saved.assets.at(-1)?.url).toMatch(/^data:image\/png/)
  const dimensions = await page.evaluate(url => new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = () => reject(new Error('fixture图片无法解码')); image.src = url
  }), saved.assets[1].url)
  expect(saved.assets.at(-1)).toMatchObject({ width: dimensions.height, height: dimensions.width })
  expect(saved.jobs.at(-1)?.creditsSpent).toBe(0)
  expect(saved.nodes.every(node => node.versions.length === 2)).toBe(true)
  expect(saved.nodes[0].details).toMatchObject({ type: 'text', content: '已生成文本：清晨薄雾中的古桥' })
  await panel.getByRole('tab', { name: '管线模板' }).click()
  await panel.getByLabel('模板名称', { exact: true }).fill('古桥分镜管线')
  await panel.getByRole('button', { name: '保存当前管线为模板' }).click()
  await expect(panel.getByRole('button', { name: '创建管线：古桥分镜管线' })).toBeVisible()
  expect(JSON.stringify(await records(page, 'pipelineTemplates'))).not.toMatch(/media.fixture|data:image|imageResults|assetId/)
  await page.screenshot({ path: '../docs/qa/evidence/pipeline-automation/template-library.png' })
  await panel.getByRole('button', { name: '创建管线：古桥分镜管线' }).click()
  await expect.poll(async () => (await project(page, id)).nodes.length).toBe(6)
  expect((await project(page, id)).nodes.slice(3).every(node => node.versions.length === 1 && !node.versions[0].assetId)).toBe(true)
  await page.reload()
  const restored = await open(page)
  await restored.getByRole('tab', { name: '执行历史' }).click()
  await restored.getByRole('button', { name: /故事起点的管线/ }).click()
  await expect(restored.getByRole('region', { name: '运行详情' })).toContainText('成功 3 / 3')
  await page.screenshot({ path: '../docs/qa/evidence/pipeline-automation/completed-history.png' })
  await restored.getByRole('tab', { name: '管线模板' }).click()
  await restored.getByRole('textbox', { name: '重命名模板 古桥分镜管线' }).fill('古桥模板修订')
  await restored.getByRole('heading', { name: '管线模板', exact: true }).click()
  await expect(restored.getByRole('button', { name: '删除模板：古桥模板修订' })).toBeVisible()
  await restored.getByRole('button', { name: '删除模板：古桥模板修订' }).click()
  await page.getByRole('alertdialog', { name: '删除管线模板' }).getByRole('button', { name: '确认删除模板' }).click()
  await expect(restored.getByText('尚无管线模板')).toBeVisible()
  expect((await project(page, id)).nodes).toHaveLength(6)
  expect(requests).toHaveLength(1)
  expect(errors).toEqual([])
})

test('failure pauses with a Chinese reason; retry only failed step, then skip remaining step', async ({ page }) => {
  let attempts = 0
  await page.route('https://fixture.seedream.invalid/api/v3/images/generations', async route => {
    attempts++
    if (attempts === 1) { await route.fulfill({ status: 429, json: { error: { code: 'RateLimitExceeded', message: 'fixture rate limit' } } }); return }
    const body = route.request().postDataJSON()
    await route.fulfill({ json: { data: [{ url: 'https://media.fixture.invalid/image-retry.png', size: body.size }] } })
  })
  const id = await seed(page)
  await page.getByRole('button', { name: '故事板', exact: true }).click()
  await page.getByRole('button', { name: '工作流', exact: true }).click()
  const panel = await start(page)
  await expect.poll(async () => (await run(page))?.pausedReason).toBe('failure')
  await expect(panel.getByRole('button', { name: '重试 分镜图片' })).toBeEnabled()
  expect((await run(page)).steps[1].error).toMatch(/[\u4e00-\u9fff]/)
  await page.screenshot({ path: '../docs/qa/evidence/pipeline-automation/failure-controls.png' })
  await panel.getByRole('button', { name: '跳过 镜像后处理' }).click()
  await panel.getByRole('button', { name: '重试 分镜图片' }).click()
  await page.getByRole('alertdialog', { name: '确认重试步骤' }).getByRole('button', { name: '确认重试' }).click()
  await expect.poll(async () => (await run(page))?.status).toBe('succeeded')
  expect(attempts).toBe(2)
  const saved = await project(page, id)
  expect(saved.jobs.filter(job => job.nodeId === 'p0')).toHaveLength(1)
  expect(saved.jobs.filter(job => job.nodeId === 'p1')).toHaveLength(2)
  expect((await run(page)).steps[2].skipped).toBe('user')
})

test('pause completes active step, cancel preserves results; controls remain reachable at 721px', async ({ page }) => {
  await page.setViewportSize({ width: 721, height: 778 })
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let submitted = 0
  await page.route('https://fixture.seedream.invalid/api/v3/chat/completions', async route => {
    submitted++; await gate
    await route.fulfill({ json: { choices: [{ message: { content: '古桥雨雾' } }] } })
  })
  const id = await seed(page)
  await page.getByRole('button', { name: '故事板', exact: true }).click()
  await page.getByRole('button', { name: '工作流', exact: true }).click()
  const panel = await start(page)
  await expect.poll(() => submitted).toBe(1)
  await expect(page.getByRole('status', { name: '故事起点管线状态', exact: true })).toContainText('执行中')
  await panel.getByRole('button', { name: '暂停管线', exact: true }).click()
  release()
  await expect.poll(async () => (await run(page))?.pausedReason).toBe('manual')
  expect((await run(page)).steps[0].status).toBe('succeeded')
  await panel.getByRole('button', { name: '取消管线（保留已完成）', exact: true }).click()
  await expect.poll(async () => (await run(page))?.status).toBe('cancelled')
  expect((await project(page, id)).assets).toHaveLength(1)
  await page.screenshot({ path: '../docs/qa/evidence/pipeline-automation/controls-721.png' })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '管线自动化', exact: true })).toBeFocused()
})

test('refresh suspends an unfinished pipeline without automatically resending; project histories are isolated', async ({ page }) => {
  let attempts = 0
  await page.route('https://fixture.seedream.invalid/api/v3/images/generations', async route => { attempts++; await route.fulfill({ status: 503, json: { error: { message: 'fixture unavailable' } } }) })
  const id = await seed(page); await start(page)
  await expect.poll(async () => (await run(page))?.pausedReason).toBe('failure')
  await page.reload(); const panel = await open(page)
  await expect(panel.getByRole('button', { name: '重试 分镜图片' })).toBeEnabled()
  expect(attempts).toBe(1)
  expect((await run(page)).steps[0].status).toBe('succeeded')
  await panel.getByRole('button', { name: '取消管线（保留已完成）' }).click()
  await expect.poll(async () => (await run(page)).status).toBe('cancelled')
  await page.goto('/projects/new')
  const other = await open(page)
  await other.getByRole('tab', { name: '执行历史' }).click()
  await expect(other.getByText('暂无管线运行记录')).toBeVisible()
  await page.goto(`/project/${id}`)
  const original = await open(page)
  await original.getByRole('tab', { name: '执行历史' }).click()
  await expect(original.getByRole('button', { name: /故事起点的管线/ })).toBeVisible()
})

test('reload interrupts an active provider request; manual resume never repeats completed upstream', async ({ page }) => {
  let attempts = 0
  await page.route('https://fixture.seedream.invalid/api/v3/images/generations', route => {
    attempts++
    // Deliberately leave the first intercepted request pending until navigation aborts it.
    if (attempts === 1) return
    return route.fulfill({ json: { data: [{ url: 'https://media.fixture.invalid/image-resumed.png', size: route.request().postDataJSON().size }] } })
  })
  const id = await seed(page, true)
  await start(page)
  await expect.poll(async () => (await run(page))?.steps[1].jobId).toBeTruthy()
  await expect.poll(() => attempts).toBe(1)
  await page.reload()
  const panel = await open(page)
  await expect(panel.getByRole('button', { name: '继续管线', exact: true })).toBeEnabled()
  expect(attempts).toBe(1)
  await panel.getByRole('button', { name: '继续管线', exact: true }).click()
  await expect.poll(async () => (await run(page))?.status).toBe('succeeded')
  expect(attempts).toBe(2)
  expect((await project(page, id)).jobs.filter(job => job.nodeId === 'p0')).toHaveLength(1)
  expect((await project(page, id)).assets).toHaveLength(3)
})
