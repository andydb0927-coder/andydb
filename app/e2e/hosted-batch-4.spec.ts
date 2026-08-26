import { expect, test, type Page } from '@playwright/test'

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

  await prompt.fill('/九宫格')
  await page.getByRole('option', { name: /九宫格分镜预设/ }).click()
  const notice = page.getByRole('alertdialog', { name: '多机位九宫格生成功能待接入' })
  await expect(notice).toContainText('待接入多机位九宫格生成服务')
  await expect(notice).toContainText('预计成本 48 积分')
  await notice.getByRole('button', { name: '复制提示词到图片节点' }).click()
  await expect(prompt).toContainText('同一主体')
})

test('shows managed disabled reasons for smart edit and frame analysis', async ({ page }) => {
  await openRecipeProject(page)

  await page.getByRole('button', { name: '添加节点' }).click()
  await page.getByRole('menu', { name: '添加节点' }).getByRole('menuitem', { name: '智能剪辑 Beta' }).click()
  const smartEdit = page.getByRole('region', { name: '智能剪辑 01 智能剪辑参数' })
  await expect(smartEdit.getByRole('button', { name: '智能粗剪' })).toBeDisabled()
  await expect(smartEdit.getByRole('button', { name: '智能混剪' })).toBeDisabled()
  await expect(smartEdit).toContainText('待接入智能剪辑粗剪/混剪服务')

  await page.getByRole('button', { name: '添加节点' }).click()
  await page.getByRole('menu', { name: '添加节点' }).getByRole('menuitem', { name: '逐帧拉片 SD2.5' }).click()
  const frameAnalysis = page.getByRole('region', { name: '逐帧拉片 01 逐帧拉片参数' })
  await expect(frameAnalysis.getByRole('button', { name: '开始拉片' })).toBeDisabled()
  await expect(frameAnalysis).toContainText('待接入逐帧拉片分析服务')
})
