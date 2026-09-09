import { mkdir } from 'node:fs/promises'
import { expect, test, type Page } from './provider-fixture'
import { makeProjectFixture } from '../src/test/fixtures'
import { DUBBING_QA_CATEGORIES, loadDubbingQaTemplate } from '../src/features/dubbing/dubbing-qa-standard'
import type { DubbingWorkspace } from '../src/features/dubbing/dubbing-workbench-model'
import { deliveryQaFixture, externalDeliveryFixture, approvedDeliveryFixture } from '../src/features/dubbing/__fixtures__/dubbing-delivery.fixture'
import { DUBBING_EXTERNAL_CHECKS } from '../src/features/dubbing/dubbing-delivery'

async function seed(page: Page) {
  await page.goto('/projects')
  await expect(page.getByRole('heading', { name: '全部项目' })).toBeVisible()
  const project = makeProjectFixture()
  for (let round = 1; round <= 3; round++) {
    const asset = { ...project.assets[0], id: `repair-image-${round}` }
    project.assets.push(asset)
    project.jobs.push({ ...project.jobs[0], id: `repair-job-${round}`, prompt: `返修样例 ${round}`, assetId: asset.id })
  }
  const second = { ...makeProjectFixture(), id: 'dubbing-isolation', title: '独立项目' }
  await page.evaluate(async projects => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wireless-canvas-v1')
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('projects', 'readwrite')
        for (const project of projects) tx.objectStore('projects').put(project)
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error)
      })
    } finally { db.close() }
  }, [project, second])
  return project
}
async function stored(page: Page): Promise<DubbingWorkspace> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wireless-canvas-dubbing-v1')
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<DubbingWorkspace>((resolve, reject) => {
        const request = db.transaction('workspaces').objectStore('workspaces').get('project-frost-river')
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
      })
    } finally { db.close() }
  })
}
async function sendNode(page: Page) {
  await page.goto('/project/project-frost-river')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await page.locator('.react-flow__node[data-id="shot-1"]').click({ button: 'right' })
  await page.getByRole('menuitem', { name: '送审到工作台' }).click()
  const dialog = page.getByRole('dialog', { name: '送审到工作台' })
  await dialog.getByLabel('原片终点（毫秒）').fill('2000')
  await dialog.getByLabel('原片资产引用').fill('original-episode-1')
  await dialog.getByLabel('台词原文').fill('我们在河岸等你。')
  await dialog.getByLabel('本地化台词').fill('We will wait for you by the river.')
  await dialog.getByLabel('景别', { exact: true }).fill('中景')
  await dialog.getByLabel('机位', { exact: true }).fill('固定平视')
  await dialog.getByRole('button', { name: '确认送审' }).click()
  await dialog.getByRole('link', { name: '打开工作台' }).click()
  await expect(page.getByRole('button', { name: '提交生成', exact: true })).toBeEnabled()
}

test('节点与历史送审贯通：三轮返修、第四次禁用、QA 自审交付与刷新恢复', async ({ page }) => {
  test.setTimeout(120_000)
  await seed(page)
  await sendNode(page)
  await page.getByRole('button', { name: '提交生成', exact: true }).click()
  await expect(page.getByRole('button', { name: '标记自审通过' })).toBeDisabled()
  for (let round = 1; round <= 3; round++) {
    await page.getByRole('button', { name: '请求返修', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '请求返修' })
    await dialog.getByLabel('返修意见').fill(`第 ${round} 轮：修正字幕位置`)
    await dialog.getByRole('checkbox', { name: /DB-QA-SUBTITLE-01/ }).check()
    await dialog.getByRole('button', { name: '保存返修意见' }).click()
    await expect(page.getByRole('button', { name: '提交生成', exact: true })).toBeDisabled()
    await expect.poll(async () => (await stored(page)).shots[0].record.revisionCount).toBe(round)
    await page.getByRole('link', { name: '返回画布补充结果' }).click()
    await page.getByRole('button', { name: '历史记录', exact: true }).click()
    const history = page.getByRole('complementary', { name: '历史', exact: true })
    await history.getByRole('article').filter({ hasText: `返修样例 ${round}` }).getByRole('button', { name: /送审到工作台/ }).click()
    const intake = page.getByRole('dialog', { name: '送审到工作台' })
    await intake.getByLabel('送审目标').selectOption({ label: 'EP001 镜头 1 · 待返修' })
    await intake.getByRole('button', { name: '确认送审' }).click()
    await intake.getByRole('link', { name: '打开工作台' }).click()
    await page.getByRole('button', { name: '提交生成', exact: true }).click()
    await expect(page.getByRole('button', { name: '标记自审通过' })).toBeDisabled()
  }
  await expect(page.getByRole('button', { name: '请求返修', exact: true })).toBeDisabled()
  await expect(page.getByText(/不能发起第 4 次返修/)).toBeVisible()
  await expect(page.getByRole('button', { name: '请求返修', exact: true })).toHaveAttribute('title', '已达修改上限，请走人工复核')
  await expect(page.getByRole('region', { name: '镜头详情与审核' })).toContainText('操作人：local-reviewer')
  await page.getByRole('button', { name: '编辑本地化方案' }).click()
  await page.getByLabel('目标语种').selectOption('en-US')
  await page.getByRole('button', { name: '保存本地化方案' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '填写检测数据' }).click()
  await page.getByRole('textbox', { name: '检测数据 JSON' }).fill(JSON.stringify(deliveryQaFixture()))
  await page.getByRole('button', { name: '保存检测数据' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const qa = page.getByRole('complementary', { name: '本地化方案与QA清单' })
  for (const rule of loadDubbingQaTemplate().rules) {
    const checkbox = qa.getByRole('checkbox', { name: new RegExp(rule.standardId) })
    await expect(checkbox).toBeEnabled()
    await checkbox.check()
    await expect.poll(async () => (await stored(page)).shots[0].qa.checkedIds.includes(rule.standardId)).toBe(true)
  }
  for (const category of DUBBING_QA_CATEGORIES) {
    await qa.getByRole('checkbox', { name: `${category === '修改' ? '修改底线' : category} · 逐集排查：已核对本集各镜头`, exact: true }).check()
    await expect.poll(async () => (await stored(page)).shots[0].qa.checkedCategories?.includes(category)).toBe(true)
  }
  await expect(page.getByRole('button', { name: '标记自审通过' })).toBeDisabled()
  await page.getByRole('button', { name: '生成自审确认表' }).click()
  await expect(page.getByRole('textbox', { name: '自审确认表文本' })).toContainText('《自审确认表》')
  await page.getByRole('button', { name: '标记自审通过' }).click()
  await page.getByRole('button', { name: '交付', exact: true }).click()
  const delivery = page.getByRole('dialog', { name: '交付包检查与导出' })
  await expect(delivery.getByRole('alert')).toContainText('外部检测报告缺失')
  await expect(delivery.getByRole('button', { name: '生成交付清单并记录交付' })).toBeDisabled()
  await delivery.getByText('镜头1 · 外部检测报告与人工核验', { exact: true }).click()
  const evidence = externalDeliveryFixture()
  await delivery.getByLabel('检测报告引用').fill(evidence.reportReference)
  await delivery.getByLabel('实际交付文件引用').fill(evidence.fileReference)
  await delivery.getByLabel('外部核验人').fill(evidence.reviewer)
  for (const check of DUBBING_EXTERNAL_CHECKS) await delivery.getByRole('checkbox', { name: check.label, exact: true }).check()
  await delivery.getByRole('button', { name: '保存外部检测记录' }).click()
  await expect(delivery.getByRole('alert')).toHaveCount(0)
  await delivery.getByLabel('交付包名称或引用').fill('EP001-v4')
  await delivery.getByLabel('交付范围').selectOption('episode')
  await delivery.getByRole('button', { name: '生成交付清单并记录交付' }).click()
  await expect.poll(async () => (await stored(page)).shots[0].record.status).toBe('已交付')
  await delivery.getByText(/EP001-v4 · .*镜头/).click()
  const download = page.waitForEvent('download')
  await delivery.getByRole('button', { name: '下载交付清单 JSON' }).click()
  expect((await download).suggestedFilename()).toMatch(/^dubbing-delivery-.+\.json$/)
  await mkdir('../docs/qa/evidence/dubbing-delivery', { recursive: true })
  await page.screenshot({ path: '../docs/qa/evidence/dubbing-delivery/archived.png' })
  await page.reload()
  await expect(page.getByRole('region', { name: '镜头详情与审核' })).toContainText('EP001-v4')
  const state = await stored(page)
  expect(state.shots).toHaveLength(1)
  expect(state.shots[0].record.generationVersions).toHaveLength(4)
  expect(state.shots[0].record.revisions).toHaveLength(3)
  expect(state.deliveryPackages?.[0].shots[0].versionId).toBe(state.shots[0].record.generationVersions.at(-1)?.id)
  await page.getByLabel('所属项目').selectOption('dubbing-isolation')
  await expect(page.getByText('暂无镜头。请从画布节点或生成历史选择“送审到工作台”。')).toBeVisible()
})

test('交付面板：整集阻塞、Esc焦点、三视口可达', async ({ page }) => {
  await seed(page)
  const state = approvedDeliveryFixture('project-frost-river')
  // Synthetic independent workspace, no account data or paid API involved.
  delete state.shots[0].deliveryEvidence
  await page.goto('/dubbing?projectId=project-frost-river')
  await expect(page.getByRole('button', { name: '刷新工作台' })).toBeVisible()
  await page.evaluate(async value => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('wireless-canvas-dubbing-v1'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('workspaces', 'readwrite'); tx.objectStore('workspaces').put(value); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }) } finally { db.close() }
  }, state)
  await page.reload()
  const trigger = page.getByRole('button', { name: '交付包检查与导出', exact: true })
  await trigger.click(); await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(trigger).toBeFocused()
  await mkdir('../docs/qa/evidence/dubbing-delivery', { recursive: true })
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 }); await trigger.click()
    const panel = page.getByRole('dialog', { name: '交付包检查与导出' })
    await panel.getByLabel('交付范围').selectOption('episode')
    await expect(panel.getByRole('alert')).toContainText('外部检测报告缺失')
    await expect(panel.getByRole('button', { name: '生成交付清单并记录交付' })).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: `../docs/qa/evidence/dubbing-delivery/${width}.png` })
    await page.keyboard.press('Escape')
  }
})

test('自审检查器：元数据失败阻断、九节全勾选、文本快照刷新恢复及Esc', async ({ page }) => {
  test.setTimeout(120_000)
  await seed(page); await sendNode(page)
  await page.getByRole('button', { name: '提交生成', exact: true }).click()
  const trigger = page.getByRole('button', { name: '填写检测数据' })
  await trigger.click(); await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(trigger).toBeFocused()
  const save = async (channels: number) => {
    await trigger.click()
    await page.getByRole('textbox', { name: '检测数据 JSON' }).fill(JSON.stringify({ channels }))
    await page.getByRole('button', { name: '保存检测数据' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await save(1)
  await expect(page.getByText('自动检查存在 FAIL，请修正后重新自审，不能用勾选代替修复。')).toBeVisible()
  await expect(page.getByRole('button', { name: '生成自审确认表' })).toBeDisabled()
  await save(2)
  const qa = page.getByRole('region', { name: '自审检查器' })
  for (const rule of loadDubbingQaTemplate().rules) {
    const box = qa.getByRole('checkbox', { name: new RegExp(rule.standardId) })
    await expect(box).toBeEnabled(); await box.check()
    await expect.poll(async () => (await stored(page)).shots[0].qa.checkedIds.includes(rule.standardId)).toBe(true)
  }
  await expect(page.getByRole('button', { name: '生成自审确认表' })).toBeDisabled()
  for (const category of DUBBING_QA_CATEGORIES) {
    const box = qa.getByRole('checkbox', { name: `${category === '修改' ? '修改底线' : category} · 逐集排查：已核对本集各镜头`, exact: true })
    await expect(box).toBeEnabled(); await box.check()
    await expect.poll(async () => (await stored(page)).shots[0].qa.checkedCategories?.includes(category)).toBe(true)
  }
  await page.getByRole('button', { name: '生成自审确认表' }).click()
  const snapshot = page.getByRole('textbox', { name: '自审确认表文本' })
  await expect(snapshot).toHaveValue(/待人工确认/)
  const text = await snapshot.inputValue()
  await page.reload(); await expect(snapshot).toHaveValue(text)
  await expect(page.getByRole('button', { name: '标记自审通过' })).toBeEnabled()
  await mkdir('../docs/qa/evidence/dubbing-qa', { recursive: true })
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    await snapshot.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: `../docs/qa/evidence/dubbing-qa/${width}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: '标记自审通过' }).click()
  await expect(page.getByRole('button', { name: '交付', exact: true })).toBeVisible()
  expect((await stored(page)).shots[0].qaHistory[0].confirmation?.text).toBe(text)
})

test('三栏主视口、本地化方案持久化、Esc 焦点回归与项目入口', async ({ page }) => {
  await seed(page)
  await page.reload()
  await page.getByRole('link', { name: '出海转绘', exact: true }).click()
  await expect(page.getByRole('heading', { name: '出海转绘', exact: true })).toBeVisible()
  await sendNode(page)
  const trigger = page.getByRole('button', { name: '编辑本地化方案' })
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '编辑本地化方案' })
  await dialog.getByLabel('目标语种').selectOption('en-US')
  await dialog.getByRole('button', { name: '添加姓名映射' }).click()
  await dialog.getByLabel('原名', { exact: true }).fill('林雨')
  await dialog.getByLabel('目标名', { exact: true }).fill('Amy')
  await dialog.getByLabel('姓氏', { exact: true }).fill('River')
  await dialog.getByRole('button', { name: '添加替换项' }).click()
  await dialog.getByRole('combobox', { name: '分类', exact: true }).selectOption('工具')
  await dialog.getByLabel('源元素').fill('黑板')
  await dialog.getByLabel('目标元素').fill('白板')
  await dialog.getByRole('button', { name: '保存本地化方案' }).click()
  await expect(page.getByText('林雨 → Amy River')).toBeVisible()
  await page.reload()
  await expect(page.getByText('林雨 → Amy River')).toBeVisible()
  await page.getByText('元素替换 · 十二类', { exact: true }).click()
  await expect(page.getByText('黑板 → 白板')).toBeVisible()
  await page.getByText('元素替换 · 十二类', { exact: true }).click()
  await mkdir('../docs/qa/evidence/dubbing-workbench', { recursive: true })
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    for (const label of ['剧集与镜头表', '镜头详情与审核']) await expect(page.getByRole('region', { name: label })).toBeVisible()
    await expect(page.getByRole('complementary', { name: '本地化方案与QA清单' })).toBeVisible()
    const row = page.getByRole('region', { name: '剧集与镜头表' }).getByRole('row').last()
    await expect(row.getByRole('button', { name: '查看 EP001 镜头 1' })).toBeInViewport()
    await expect(row.getByText('待生成', { exact: true })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: `../docs/qa/evidence/dubbing-workbench/${width}.png`, fullPage: true })
    await trigger.click()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
  }
})
