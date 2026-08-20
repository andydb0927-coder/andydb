import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { CanvasContextMenu } from './CanvasContextMenu'

function renderMenu(overrides: Partial<Parameters<typeof CanvasContextMenu>[0]> = {}) {
  const props: Parameters<typeof CanvasContextMenu>[0] = {
    anchor: { x: 110, y: 90 },
    bounds: { width: 720, height: 640 },
    targetNodeTitle: undefined,
    canUseGenerationHistory: false,
    onUpload: vi.fn(),
    onOpenGenerationHistory: vi.fn(),
    onAddNode: vi.fn(),
    onDeleteNode: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<CanvasContextMenu {...props} />)
  return props
}

test('renders only the two Liblib top-level groups and exposes disabled history semantics', async () => {
  const user = userEvent.setup()
  renderMenu()

  const menu = screen.getByRole('menu', { name: '画布快捷菜单' })
  expect(menu).toBeVisible()
  expect(within(menu).getAllByRole('menuitem', { hidden: true })).toHaveLength(2)
  expect(screen.getByRole('menuitem', { name: '添加节点' })).toHaveAttribute(
    'aria-haspopup',
    'menu',
  )
  expect(screen.getByRole('menuitem', { name: '添加资源' })).toHaveAttribute(
    'aria-haspopup',
    'menu',
  )
  for (const removed of ['上传', '保存到我的资产', '撤销', '重做', '粘贴']) {
    expect(screen.queryByRole('menuitem', { name: removed })).not.toBeInTheDocument()
  }

  await user.click(screen.getByRole('menuitem', { name: '添加资源' }))
  const resourceMenu = screen.getByRole('menu', { name: '添加资源子菜单' })
  expect(within(resourceMenu).getByRole('menuitem', { name: '上传' })).toBeEnabled()
  expect(
    within(resourceMenu).getByRole('menuitem', { name: '从生成历史选择' }),
  ).toBeDisabled()
})

test('opens all nine node types by hover or click and dispatches the shared type', async () => {
  const user = userEvent.setup()
  const props = renderMenu({ canUseGenerationHistory: true })
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

  await user.click(screen.getByRole('menuitem', { name: '添加资源' }))
  expect(screen.queryByRole('menu', { name: '添加节点子菜单' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('menuitem', { name: '从生成历史选择' }))
  expect(props.onOpenGenerationHistory).toHaveBeenCalledOnce()
})

test('closes from Escape and outside pointer while preserving the caller-owned focus contract', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  renderMenu({ targetNodeTitle: '角色参考', onClose })

  expect(screen.getByText('角色参考')).toBeVisible()
  expect(screen.getByRole('menuitem', { name: '添加节点' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledOnce()

  fireEvent.pointerDown(document.body)
  expect(onClose).toHaveBeenCalledTimes(2)
})

test('offers deletion only for a node context menu and dispatches it', async () => {
  const user = userEvent.setup()
  const blank = renderMenu()
  expect(screen.queryByRole('menuitem', { name: '删除节点' })).not.toBeInTheDocument()
  expect(blank.onDeleteNode).not.toHaveBeenCalled()

  document.body.innerHTML = ''
  const node = renderMenu({ targetNodeTitle: '角色参考' })
  await user.click(screen.getByRole('menuitem', { name: '删除节点' }))
  expect(node.onDeleteNode).toHaveBeenCalledOnce()
})
