import { expect, test, type Page } from './provider-fixture'

async function openRecipeProject(page: Page) {
  await page.goto('/projects/new?recipe=cinematic-story')
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  await page.getByRole('button', { name: '适配画布' }).click()
}

test('explains guarded AI presets and applies the local prompt optimizer', async ({ page }) => {
  await openRecipeProject(page)
  await page.getByRole('button', { name: '场景设定', exact: true }).click()
  const composer = page.getByRole('region', { name: '场景设定 生成参数' })
  const prompt = composer.getByRole('textbox', { name: '提示词' })

  await prompt.fill('清晨薄雾中的古桥')
  await composer.getByRole('button', { name: '本地优化提示词' }).click()
  await expect(prompt).toContainText('镜头：')
  await expect(composer.getByRole('status')).toContainText('本地规则优化完成')

  await prompt.fill('/设定图')
  await page.getByRole('option', { name: /角色与场景设定图预设/ }).click()
  const notice = page.getByRole('alertdialog', { name: '设定图生成功能待接入' })
  await expect(notice).toContainText('待接入设定图生成服务')
  await expect(notice).toContainText('预计成本 24 积分')
  await notice.getByRole('button', { name: '复制提示词到图片节点' }).click()
  await expect(prompt).toContainText('角色设定图')
})

test('keeps smart edit unavailable and gates real frame analysis behind video selection', async ({ page }) => {
  await openRecipeProject(page)

  await page.getByRole('button', { name: '添加节点' }).click()
  await page.getByRole('menu', { name: '添加节点' }).getByRole('menuitem', { name: '智能剪辑 Beta' }).click()
  const smartEdit = page.getByRole('region', { name: '智能剪辑 01 智能剪辑参数' })
  await expect(smartEdit.getByRole('button', { name: '智能粗剪' })).toBeDisabled()
  await expect(smartEdit.getByRole('button', { name: '智能混剪' })).toBeDisabled()
  await expect(smartEdit).toContainText('待接入智能剪辑粗剪/混剪服务')

  await page.getByRole('button', { name: '添加节点' }).click()
  await page.getByRole('menu', { name: '添加节点' }).getByRole('menuitem', { name: '逐帧拉片 本地分析' }).click()
  const frameAnalysis = page.getByRole('region', { name: '逐帧拉片 01 逐帧拉片参数' })
  await frameAnalysis.getByRole('button', { name: '开始拉片' }).click()
  const dialog = page.getByRole('dialog', { name: '逐帧拉片分析' })
  await expect(dialog.getByRole('button', { name: '确认分析' })).toBeDisabled()
  await expect(dialog).toContainText('不读取音轨')
  await dialog.getByRole('button', { name: '取消' }).click()
})
