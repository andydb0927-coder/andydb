import { expect, test } from './provider-fixture'

test('creates a durable subject from an upload and reuses it in another project', async ({ page }) => {
  await page.goto('/projects/new')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()

  await page.getByRole('button', { name: '添加节点' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menu', { name: '添加节点' }).getByRole('menuitem', { name: '上传' }).click()
  await (await chooser).setFiles('public/demo/character-lin-yuan.png')

  const imageNode = page.getByRole('button', { name: 'character-lin-yuan.png', exact: true })
  await expect(imageNode).toBeVisible()
  await imageNode.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '创建主体' }).click()
  const dialog = page.getByRole('dialog', { name: '创建本地主体' })
  await expect(dialog.getByRole('status')).toContainText('已填写视觉草稿')
  await dialog.getByLabel('主体名称').fill('雨夜旅人')
  await dialog.getByLabel('主体描述').fill('黑色风衣与冷色轮廓光')
  await dialog.getByLabel('主体标签').fill('主角, 雨夜')
  await expect(dialog.getByRole('button', { name: 'AI 身份提取' })).toBeEnabled()
  await dialog.getByRole('button', { name: '保存到主体库' }).click()

  const library = page.getByRole('dialog', { name: '角色库' })
  const localSubject = library.getByRole('article', { name: '主体 雨夜旅人' })
  await expect(localSubject).toContainText('当前项目主体')
  await localSubject.getByRole('button', { name: '编辑雨夜旅人' }).click()
  await page.getByLabel('编辑主体描述').fill('黑色风衣、冷色轮廓光、雨夜主角')
  await page.getByRole('button', { name: '保存主体修改' }).click()
  await expect(localSubject).toContainText('雨夜主角')

  await page.goto('/projects/new')
  await page.getByRole('button', { name: '角色库' }).click()
  const reused = page.getByRole('article', { name: '主体 雨夜旅人' })
  await expect(reused).toContainText('来自其他项目')
  await reused.getByRole('button', { name: '使用雨夜旅人' }).click()
  await expect(page.getByRole('button', { name: '雨夜旅人', exact: true })).toBeVisible()
})

test('opens tutorial detail pages with category and adjacent lesson navigation', async ({ page }) => {
  await page.goto('/tutorials')
  await page.getByRole('link', { name: '查看教程：添加创作节点' }).click()

  await expect(page).toHaveURL(/\/tutorials\/add-node$/)
  await expect(page.getByRole('heading', { name: '添加创作节点' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '教程分类导航' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '操作步骤' })).toBeVisible()
  await expect(page.getByRole('link', { name: '上一篇：新建第一个项目' })).toBeVisible()
  await page.getByRole('link', { name: '下一篇：建立节点连线' }).click()
  await expect(page.getByRole('heading', { name: '建立节点连线' })).toBeVisible()
})

test('binds challenge tags into the new project and renders the complete activity document', async ({ page }) => {
  await page.goto('/activity/director-master')
  for (const section of ['赛事时间线', '活动赛道', '赛制规则', '奖项说明', '示例作品']) {
    await expect(page.getByRole('region', { name: section })).toBeVisible()
  }
  await expect(page.getByRole('link', { name: /查看示例作品/ })).toHaveCount(3)
  await page.getByRole('link', { name: '去创作' }).click()
  await expect(page).toHaveURL(/\/project\/[^/]+$/)

  const projectId = page.url().split('/project/')[1]
  const challengeBinding = await page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wireless-canvas-v1')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const project = await new Promise<{ challengeId?: string; challengeTags?: string[] }>((resolve, reject) => {
      const request = database.transaction('projects', 'readonly').objectStore('projects').get(id)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    database.close()
    return { challengeId: project.challengeId, challengeTags: project.challengeTags }
  }, projectId)

  expect(challengeBinding).toEqual({
    challengeId: 'director-master',
    challengeTags: ['光影接力导演挑战', '多镜头叙事工作流'],
  })
})
