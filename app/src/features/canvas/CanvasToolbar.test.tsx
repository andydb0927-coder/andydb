import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { CanvasToolbar } from './CanvasToolbar'

test('exposes the nine-item Liblib creation dock', async () => {
  const user = userEvent.setup()
  const onToolChange = vi.fn()
  const onAddNode = vi.fn()
  const onOpenPanel = vi.fn()
  render(
    <CanvasToolbar
      activeTool="select"
      draftOpen={false}
      connectionsVisible
      onAddNode={onAddNode}
      onOpenPanel={onOpenPanel}
      onToolChange={onToolChange}
      onToggleConnections={vi.fn()}
    />,
  )

  expect(screen.getByRole('toolbar', { name: '画布模式工具' })).toBeVisible()
  const primaryDock = screen.getByRole('group', { name: 'Liblib 画布工具坞' })
  expect(
    Array.from(primaryDock.querySelectorAll('button')).map((button) =>
      button.getAttribute('aria-label'),
    ),
  ).toEqual([
    '添加节点',
    '移动',
    '连线',
    '打开工具箱',
    '素材库',
    '角色库',
    '历史记录',
    '快捷键',
    '教程',
  ])

  await user.click(screen.getByRole('button', { name: '添加节点' }))
  expect(onAddNode).toHaveBeenCalledOnce()
  await user.click(screen.getByRole('button', { name: '角色库' }))
  expect(onOpenPanel).toHaveBeenCalledWith('characters')
  await user.click(screen.getByRole('button', { name: '移动' }))
  expect(onToolChange).toHaveBeenCalledWith('select', expect.any(HTMLButtonElement))
  for (const label of ['剧本卡', '角色卡', '世界观卡', '文本', '图片', '分镜', '视频']) {
    expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
  }
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
