import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { CanvasGroup } from '../project/model'
import { CanvasGroupOverlay } from './CanvasGroupOverlay'

const group: CanvasGroup = {
  id: 'group-1',
  title: '分组 01',
  nodeIds: ['a', 'b'],
  createdAt: '2026-08-13T08:00:00.000Z',
  updatedAt: '2026-08-13T08:00:00.000Z',
}

test('exposes a non-blocking visual group with keyboard-operable select and ungroup actions', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  const onUngroup = vi.fn()
  render(
    <CanvasGroupOverlay
      group={group}
      bounds={{ x: 20, y: 40, width: 600, height: 360 }}
      onSelect={onSelect}
      onUngroup={onUngroup}
    />,
  )

  const overlay = screen.getByRole('group', { name: '节点分组：分组 01' })
  expect(overlay).toHaveStyle({ left: '20px', top: '40px', width: '600px', height: '360px' })
  await user.click(screen.getByRole('button', { name: '选择分组：分组 01' }))
  await user.click(screen.getByRole('button', { name: '取消分组：分组 01' }))
  expect(onSelect).toHaveBeenCalledOnce()
  expect(onUngroup).toHaveBeenCalledOnce()
})

test('offers the recorded group toolbar and three arrangement modes', async () => {
  const user = userEvent.setup()
  const onArrange = vi.fn()
  const onDuplicate = vi.fn()
  render(
    <CanvasGroupOverlay
      group={group}
      bounds={{ x: 20, y: 40, width: 600, height: 360 }}
      selected
      onSelect={vi.fn()}
      onUngroup={vi.fn()}
      onArrange={onArrange}
      onDuplicate={onDuplicate}
      onFeedback={vi.fn()}
    />,
  )

  const toolbar = screen.getByRole('toolbar', { name: '分组 01 组合操作' })
  for (const action of ['排列', '保存到资产', '创建副本', '复制', '打组', '添加到 Chat']) {
    expect(within(toolbar).getByRole('button', { name: action })).toBeVisible()
  }
  await user.click(within(toolbar).getByRole('button', { name: '排列' }))
  await user.click(screen.getByRole('menuitem', { name: '水平排列' }))
  expect(onArrange).toHaveBeenCalledWith('horizontal')
  await user.click(within(toolbar).getByRole('button', { name: '创建副本' }))
  expect(onDuplicate).toHaveBeenCalledOnce()
})

test('treats a marquee selection as an unpersisted combination until the user groups it', async () => {
  const user = userEvent.setup()
  const onGroup = vi.fn()
  render(
    <CanvasGroupOverlay
      group={{ ...group, id: '__selection__', title: '已选 2 个节点' }}
      bounds={{ x: 20, y: 40, width: 600, height: 360 }}
      selected
      temporary
      onSelect={vi.fn()}
      onUngroup={vi.fn()}
      onGroup={onGroup}
    />,
  )

  expect(
    screen.getByRole('group', { name: '节点组合：已选 2 个节点' }),
  ).toBeVisible()
  expect(
    screen.queryByRole('button', { name: '选择分组：已选 2 个节点' }),
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '打组' }))
  expect(onGroup).toHaveBeenCalledOnce()
})
