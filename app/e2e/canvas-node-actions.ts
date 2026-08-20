import { expect, type Page } from '@playwright/test'

export type NodeManagementAction =
  | '重生成'
  | '扩展镜头'
  | '生成视频'

export async function runSelectedNodeManagementAction(
  page: Page,
  action: NodeManagementAction,
) {
  const selectedNode = page.locator(
    '.react-flow__node.selected [data-canvas-node-id]',
  )
  await expect(selectedNode).toHaveCount(1)
  const title = await selectedNode.getAttribute('aria-label')
  if (!title) throw new Error('Selected canvas node has no accessible title')

  await page.getByRole('button', { name: '节点列表' }).click()
  const dialog = page.getByRole('dialog', { name: '节点列表' })
  await dialog
    .getByRole('button', { name: `${action} ${title}`, exact: true })
    .click()
  await expect(dialog).toBeHidden()
  return selectedNode
}
