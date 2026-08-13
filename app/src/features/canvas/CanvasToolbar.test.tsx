import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { CanvasToolbar } from './CanvasToolbar'

test('moves node creation out of the persistent mode toolbar', () => {
  const onToolChange = vi.fn()
  render(
    <CanvasToolbar
      activeTool="select"
      draftOpen={false}
      connectionsVisible
      onToolChange={onToolChange}
      onToggleConnections={vi.fn()}
    />,
  )

  expect(screen.getByRole('toolbar', { name: '画布模式工具' })).toBeVisible()
  expect(screen.getByText('双击画布 自由生成节点')).toBeVisible()
  for (const label of ['剧本卡', '角色卡', '世界观卡', '文本', '图片', '分镜', '视频']) {
    expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
  }
  expect(onToolChange).not.toHaveBeenCalled()
})

test('enables Connect and activates Group only for a valid selection', async () => {
  const user = userEvent.setup()
  const onToolChange = vi.fn()
  const onGroupAction = vi.fn()
  const { rerender } = render(
    <CanvasToolbar
      activeTool="connect"
      draftOpen={false}
      connectionsVisible
      groupAction="disabled"
      onGroupAction={onGroupAction}
      onToolChange={onToolChange}
      onToggleConnections={vi.fn()}
    />,
  )
  const connect = screen.getByRole('button', { name: '连线' })
  expect(connect).toBeEnabled()
  expect(connect).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '分组' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '分组' })).toHaveAttribute(
    'title',
    '请先选择至少两个节点',
  )

  rerender(
    <CanvasToolbar
      activeTool="text"
      draftOpen
      connectionsVisible
      groupAction="group"
      onGroupAction={onGroupAction}
      onToolChange={onToolChange}
      onToggleConnections={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: '连线' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '分组' })).toBeDisabled()

  rerender(
    <CanvasToolbar
      activeTool="select"
      draftOpen={false}
      connectionsVisible
      groupAction="group"
      onGroupAction={onGroupAction}
      onToolChange={onToolChange}
      onToggleConnections={vi.fn()}
    />,
  )
  await user.click(screen.getByRole('button', { name: '分组' }))
  expect(onGroupAction).toHaveBeenCalledOnce()

  rerender(
    <CanvasToolbar
      activeTool="select"
      draftOpen={false}
      connectionsVisible
      groupAction="ungroup"
      onGroupAction={onGroupAction}
      onToolChange={onToolChange}
      onToggleConnections={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: '取消分组' })).toBeEnabled()
})

test('exposes a pressed visibility toggle without changing the active tool', async () => {
  const user = userEvent.setup()
  const onToolChange = vi.fn()
  const onToggleConnections = vi.fn()
  render(
    <CanvasToolbar
      activeTool="select"
      draftOpen={false}
      connectionsVisible
      onToolChange={onToolChange}
      onToggleConnections={onToggleConnections}
    />,
  )

  const toggle = screen.getByRole('button', { name: '隐藏连线' })
  expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await user.click(toggle)
  expect(onToggleConnections).toHaveBeenCalledOnce()
  expect(onToolChange).not.toHaveBeenCalled()
})

test('disables the visibility toggle with the rest of the toolbar', async () => {
  const user = userEvent.setup()
  const onToggleConnections = vi.fn()
  const { rerender } = render(
    <CanvasToolbar
      activeTool="select"
      connectionsVisible
      disabled
      draftOpen={false}
      onToolChange={vi.fn()}
      onToggleConnections={onToggleConnections}
    />,
  )

  const disabledToggle = screen.getByRole('button', { name: '隐藏连线' })
  expect(disabledToggle).toBeDisabled()
  await user.click(disabledToggle)
  expect(onToggleConnections).not.toHaveBeenCalled()

  rerender(
    <CanvasToolbar
      activeTool="select"
      connectionsVisible
      draftOpen={false}
      onToolChange={vi.fn()}
      onToggleConnections={onToggleConnections}
    />,
  )

  expect(screen.getByRole('button', { name: '隐藏连线' })).toBeEnabled()
})
