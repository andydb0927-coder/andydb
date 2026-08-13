import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { CanvasContextMenu } from './CanvasContextMenu'

function renderMenu(overrides: Partial<Parameters<typeof CanvasContextMenu>[0]> = {}) {
  const props: Parameters<typeof CanvasContextMenu>[0] = {
    anchor: { x: 110, y: 90 },
    bounds: { width: 720, height: 640 },
    targetNodeTitle: undefined,
    canSaveAsset: false,
    canUndo: false,
    canRedo: true,
    clipboardText: '',
    onUpload: vi.fn(),
    onSaveAsset: vi.fn(),
    onAddNode: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onPaste: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<CanvasContextMenu {...props} />)
  return props
}

test('renders the six Liblib canvas actions with unavailable operations disabled', () => {
  renderMenu()

  const menu = screen.getByRole('menu', { name: '画布快捷菜单' })
  expect(menu).toBeVisible()
  expect(screen.getByRole('menuitem', { name: '上传' })).toBeEnabled()
  expect(screen.getByRole('menuitem', { name: '保存到我的资产' })).toBeDisabled()
  expect(screen.getByRole('menuitem', { name: '添加节点' })).toBeEnabled()
  expect(screen.getByRole('menuitem', { name: '撤销' })).toBeDisabled()
  expect(screen.getByRole('menuitem', { name: '重做' })).toBeEnabled()
  expect(screen.getByRole('menuitem', { name: '粘贴' })).toBeDisabled()
})

test('opens node types from Add node and closes with Escape', async () => {
  const user = userEvent.setup()
  const props = renderMenu({
    targetNodeTitle: '角色参考',
    canSaveAsset: true,
    clipboardText: '雨夜站台',
  })

  expect(screen.getByText('角色参考')).toBeVisible()
  expect(screen.getByRole('menuitem', { name: '保存到我的资产' })).toBeEnabled()
  expect(screen.getByRole('menuitem', { name: '粘贴' })).toBeEnabled()

  await user.click(screen.getByRole('menuitem', { name: '添加节点' }))
  for (const name of ['剧本卡', '角色卡', '世界观卡', '文本', '图片', '分镜', '视频']) {
    expect(screen.getByRole('menuitem', { name })).toBeVisible()
  }
  await user.click(screen.getByRole('menuitem', { name: '分镜' }))
  expect(props.onAddNode).toHaveBeenCalledWith('storyboard')

  await user.keyboard('{Escape}')
  expect(props.onClose).toHaveBeenCalled()
})
