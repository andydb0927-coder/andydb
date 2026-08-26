import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { CanvasContextMenu } from './CanvasContextMenu'

function renderMenu(overrides: Partial<Parameters<typeof CanvasContextMenu>[0]> = {}) {
  const props: Parameters<typeof CanvasContextMenu>[0] = {
    anchor: { x: 110, y: 90 },
    bounds: { width: 720, height: 640 },
    targetNodeTitle: undefined,
    onUpload: vi.fn(),
    onAddNode: vi.fn(),
    canUndo: true,
    canRedo: false,
    canPaste: false,
    canSaveToAssets: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onPaste: vi.fn(),
    onSaveToAssets: vi.fn(),
    onExecuteGroup: vi.fn(),
    canExecuteGroup: true,
    onComplianceCheck: vi.fn(),
    onCreateSubject: vi.fn(),
    onCopyNode: vi.fn(),
    onDuplicateNode: vi.fn(),
    onCopyToClipboard: vi.fn(),
    onDeleteNode: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<CanvasContextMenu {...props} />)
  return props
}

test('matches the recorded blank-canvas command order and disabled semantics', () => {
  renderMenu()

  const menu = screen.getByRole('menu', { name: '画布快捷菜单' })
  expect(menu).toBeVisible()
  expect(
    within(menu)
      .getAllByRole('menuitem', { hidden: true })
      .map((item) => item.textContent?.trim()),
  ).toEqual(['上传', '保存到我的资产', '添加节点', '整组执行', '撤销 ⌘Z', '重做 ⇧⌘Z', '粘贴 ⌘V'])
  expect(within(menu).getByRole('menuitem', { name: '上传' })).toBeEnabled()
  expect(within(menu).getByRole('menuitem', { name: '保存到我的资产' })).toBeDisabled()
  expect(screen.getByRole('menuitem', { name: '添加节点' })).toHaveAttribute(
    'aria-haspopup',
    'menu',
  )
  expect(within(menu).getByRole('menuitem', { name: '撤销' })).toBeEnabled()
  expect(within(menu).getByRole('menuitem', { name: '重做' })).toBeDisabled()
  expect(within(menu).getByRole('menuitem', { name: '粘贴' })).toBeDisabled()
  expect(within(menu).getByRole('menuitem', { name: '整组执行' })).toBeEnabled()
})

test('dispatches the whole-canvas or selected-group execution command', async () => {
  const user = userEvent.setup()
  const props = renderMenu()
  await user.click(screen.getByRole('menuitem', { name: '整组执行' }))
  expect(props.onExecuteGroup).toHaveBeenCalledOnce()
})

test('opens all nine node types by hover or click and dispatches the shared type', async () => {
  const user = userEvent.setup()
  const props = renderMenu()
  const addNode = screen.getByRole('menuitem', { name: '添加节点' })

  fireEvent.pointerEnter(addNode)
  const nodeMenu = screen.getByRole('menu', { name: '添加节点子菜单' })
  for (const name of [
    '文本',
    '图片',
    '视频',
    '智能剪辑 Beta',
    '导演台 NEW',
    '逐帧拉片 SD2.5',
    '音频',
    '脚本',
    '素材库',
  ]) {
    expect(within(nodeMenu).getByRole('menuitem', { name })).toBeVisible()
  }

  await user.click(within(nodeMenu).getByRole('menuitem', { name: '逐帧拉片 SD2.5' }))
  expect(props.onAddNode).toHaveBeenCalledWith('frame-analysis')

})

test('closes from Escape and outside pointer while preserving the caller-owned focus contract', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  renderMenu({ targetNodeTitle: '角色参考', onClose })

  expect(screen.getByText('角色参考')).toBeVisible()
  expect(screen.getByRole('menuitem', { name: '合规校验' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledOnce()

  fireEvent.pointerDown(document.body)
  expect(onClose).toHaveBeenCalledTimes(2)
})

test('shows the exact node menu operations and dispatches each command', async () => {
  const user = userEvent.setup()
  const blank = renderMenu()
  expect(screen.queryByRole('menuitem', { name: '删除节点' })).not.toBeInTheDocument()
  expect(blank.onDeleteNode).not.toHaveBeenCalled()

  document.body.innerHTML = ''
  const node = renderMenu({ targetNodeTitle: '角色参考' })
  const menu = screen.getByRole('menu', { name: '画布快捷菜单' })
  expect(
    within(menu).getAllByRole('menuitem').map((item) => item.textContent?.trim()),
  ).toEqual([
    '合规校验',
    '保存到我的资产',
    '创建主体',
    '复制',
    '创建副本',
    '粘贴',
    '删除 ⌘⌫',
    '复制到剪贴板',
  ])
  expect(within(menu).queryByRole('menuitem', { name: '上传' })).not.toBeInTheDocument()
  await user.click(within(menu).getByRole('menuitem', { name: '合规校验' }))
  expect(node.onComplianceCheck).toHaveBeenCalledOnce()

  document.body.innerHTML = ''
  const deleteNode = renderMenu({ targetNodeTitle: '角色参考' })
  await user.click(screen.getByRole('menuitem', { name: '删除节点' }))
  expect(deleteNode.onDeleteNode).toHaveBeenCalledOnce()
})
