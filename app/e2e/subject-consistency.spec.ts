import { expect, test, type Page } from './provider-fixture'
import { waitCanvasViewportIdle } from './canvas-viewport'
import type { Project } from '../src/features/project/model'
import type { SubjectAsset } from '../src/features/subjects/subject-model'

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
    try { return { projects: await read<Project>('projects'), subjects: await read<SubjectAsset>('subjects') } }
    finally { db.close() }
  })
}

async function createSubject(page: Page) {
  await page.goto('/projects/new')
  await page.getByRole('button', { name: '添加节点', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: '上传', exact: true }).click()
  await (await chooser).setFiles('public/demo/character-lin-yuan.png')
  await page.getByRole('button', { name: 'character-lin-yuan.png', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '创建主体', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '创建本地主体', exact: true })
  await expect(dialog.getByRole('status')).toContainText('已填写视觉草稿')
  await dialog.getByLabel('主体名称', { exact: true }).fill('雨夜旅人')
  await dialog.getByLabel('主体描述', { exact: true }).fill('黑色风衣，蓝色围巾，短发青年')
  await dialog.getByRole('button', { name: '保存到主体库' }).click()
  await expect(page.getByRole('article', { name: '主体 雨夜旅人', exact: true })).toBeVisible()
  return (await stored(page)).subjects[0]
}

test('subject details, edited identity and automatic image reference reach the wire and persist across projects', async ({ page }) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 1440, height: 1024 })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const requests: Array<{ prompt: string; image: string[]; size: string }> = []
  await page.route('https://fixture.seedream.invalid/api/v3/images/generations', async route => {
    requests.push(route.request().postDataJSON())
    await route.fulfill({ json: { data: [{ url: `https://media.fixture.invalid/image-subject-${requests.length}.png`, size: requests.at(-1)!.size }] } })
  })
  const subject = await createSubject(page)
  await page.goto('/projects/new')
  await expect(page).toHaveURL(/\/project\/[^/]+$/)
  const projectId = page.url().split('/').at(-1)!
  await page.getByRole('button', { name: '添加节点', exact: true }).click()
  await page.getByRole('menuitem', { name: '图片', exact: true }).click()
  await page.getByRole('button', { name: '角色库', exact: true }).click()
  await page.getByRole('button', { name: '使用雨夜旅人', exact: true }).click()
  const panel = page.getByRole('region', { name: '图片 01 生成参数', exact: true })
  await expect(panel).toBeVisible()
  await expect.poll(async () => (await stored(page)).projects.find(project => project.id === projectId)?.edges.length).toBe(1)
  await page.getByRole('button', { name: '角色库', exact: true }).click()
  await page.getByRole('button', { name: '查看主体雨夜旅人' }).click()
  const details = page.getByRole('dialog', { name: '主体详情 雨夜旅人', exact: true })
  await expect(details.getByRole('img', { name: '雨夜旅人来源图 1' })).toBeVisible()
  await expect(details).toContainText('画布节点引用：1')
  await details.getByRole('textbox', { name: '主体特征描述' }).fill('白色外套，长发，蓝色围巾')
  await details.getByRole('button', { name: '保存特征描述' }).click()
  await expect(details).toContainText('特征描述已保存')
  await details.getByRole('button', { name: '关闭主体详情' }).click()
  await page.getByRole('button', { name: '关闭角色库面板' }).click()
  await panel.getByRole('textbox', { name: '提示词', exact: true }).fill('清晨古桥上的旅人')
  await panel.getByRole('button', { name: '生成图片，预计成本 18' }).click()
  await page.getByRole('alertdialog', { name: '确认真实图片生成' }).getByRole('button', { name: '确认生成 1 张图片' }).click()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0].image).toEqual([subject.coverUrl])
  expect(requests[0].prompt).toBe('保持参考主体一致（以以下特征为准）：\n雨夜旅人：白色外套，长发，蓝色围巾\n\n清晨古桥上的旅人')
  await expect.poll(async () => (await stored(page)).projects.find(project => project.id === projectId)?.jobs[0]?.status).toBe('succeeded')
  const project = (await stored(page)).projects.find(project => project.id === projectId)!
  expect(project.jobs[0].generationConfig?.subjects?.[0]).toMatchObject({ id: subject.id, description: '白色外套，长发，蓝色围巾' })
  expect(project.nodes.find(node => node.title === '图片 01')?.versions.at(-1)?.prompt).toBe('清晨古桥上的旅人')
  await page.getByRole('button', { name: '适配画布', exact: true }).click()
  await waitCanvasViewportIdle(page)
  await expect(page.getByRole('button', { name: '雨夜旅人', exact: true })).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: '../docs/qa/evidence/subject-consistency/identity-reference.png' })
  await page.goto(`/subjects/${subject.id}`)
  await expect(page.getByRole('heading', { name: '主体详情 · 雨夜旅人' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '主体特征描述' })).toHaveValue('白色外套，长发，蓝色围巾')
  await expect(page.getByText('生成使用次数：1', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('生成使用次数：1', { exact: true })).toBeVisible()
  await page.screenshot({ path: '../docs/qa/evidence/subject-consistency/details-page.png' })
  expect(errors).toEqual([])
})

test('same-source extraction offers explicit merge, cancel does not write and merge preserves identity', async ({ page }) => {
  test.setTimeout(60000)
  const subject = await createSubject(page)
  await page.getByRole('button', { name: '关闭角色库面板' }).click()
  const openAgain = async () => {
    await page.getByRole('button', { name: 'character-lin-yuan.png', exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: '创建主体', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '创建本地主体', exact: true })
    await expect(dialog.getByRole('status')).toContainText('已填写视觉草稿')
    await dialog.getByLabel('主体描述', { exact: true }).fill('同一旅人的棕色皮包')
    await dialog.getByRole('button', { name: '保存到主体库' }).click()
    await expect(dialog.getByRole('region', { name: '相似主体提示' })).toContainText('同一来源图')
    return dialog
  }
  let dialog = await openAgain()
  expect((await stored(page)).subjects).toHaveLength(1)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect((await stored(page)).subjects[0].description).toBe(subject.description)
  dialog = await openAgain()
  await page.screenshot({ path: '../docs/qa/evidence/subject-consistency/similar-review.png' })
  await dialog.getByRole('button', { name: '合并到雨夜旅人' }).click()
  await expect(dialog).toHaveCount(0)
  const subjects = (await stored(page)).subjects
  expect(subjects).toHaveLength(1)
  expect(subjects[0].id).toBe(subject.id)
  expect(subjects[0].description).toContain('棕色皮包')
  expect(subjects[0].description).toContain(subject.description)
  await page.reload()
  await page.getByRole('button', { name: '角色库', exact: true }).click()
  await expect(page.getByRole('article', { name: '主体 雨夜旅人', exact: true })).toContainText('棕色皮包')
})

test('721px deletion reports storyboard and character impact; removing library record preserves project data', async ({ page }) => {
  test.setTimeout(60000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const subject = await createSubject(page)
  await page.getByRole('button', { name: '使用雨夜旅人', exact: true }).click()
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  // Only this fresh BrowserContext gets a stored legacy storyboard fixture.
  await page.evaluate(async subjectId => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('wireless-canvas-v1'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite'), table = tx.objectStore('projects')
      const read = table.get(location.pathname.split('/').at(-1)!)
      read.onsuccess = () => {
        const project = read.result as Project
        project.nodes.push({ id: 'script-usage-fixture', kind: 'script', title: '主体分镜引用', position: { x: 1100, y: 700 }, versions: [], sourceChanged: false,
          details: { type: 'script', chapters: [], characters: [{ id: 'traveler', name: '雨夜旅人', description: '黑色风衣', subjectId }],
            shots: [{ id: 'scene-shot', title: '桥上旅人', sceneId: 'bridge', shotSize: '全景', cameraAngle: '正面', cameraMovement: '静止', prompt: '旅人在桥上', characterIds: ['traveler'] }] } })
        table.put(project)
      }
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, subject.id)
  await page.reload()
  await page.setViewportSize({ width: 721, height: 778 })
  await page.getByRole('button', { name: '角色库', exact: true }).click()
  await page.getByRole('button', { name: '删除雨夜旅人' }).click()
  const dialog = page.getByRole('dialog', { name: '删除主体 雨夜旅人', exact: true })
  await expect(dialog).toContainText('角色引用：1 · 分镜引用：1')
  await expect(dialog.getByRole('button', { name: '确认删除主体' })).toBeInViewport()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect((await stored(page)).subjects).toHaveLength(1)
  const before = (await stored(page)).projects[0]
  await page.getByRole('button', { name: '删除雨夜旅人' }).click()
  await expect(dialog).toContainText('角色引用：1 · 分镜引用：1')
  await page.screenshot({ path: '../docs/qa/evidence/subject-consistency/delete-impact-721.png' })
  await dialog.getByRole('button', { name: '确认删除主体' }).click()
  await expect(page.getByRole('article', { name: '主体 雨夜旅人', exact: true })).toHaveCount(0)
  const after = await stored(page)
  expect(after.subjects).toHaveLength(0)
  expect(after.projects[0].nodes).toEqual(before.nodes)
  expect(after.projects[0].assets).toEqual(before.assets)
  await page.reload()
  expect((await stored(page)).projects[0].nodes).toEqual(before.nodes)
  await page.goto(`/subjects/${subject.id}`)
  await expect(page.getByRole('heading', { name: '主体不存在或已删除' })).toBeVisible()
  expect(errors).toEqual([])
})
