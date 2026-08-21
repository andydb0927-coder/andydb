import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { CanvasNodeTypePicker } from './CanvasNodeTypePicker'

test('renders the Liblib double-click menu with grouped nodes and resources', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  const onUpload = vi.fn()
  const onOpenGenerationHistory = vi.fn()
  render(
    <CanvasNodeTypePicker
      anchor={{ x: 420, y: 260 }}
      bounds={{ width: 960, height: 720 }}
      canUseGenerationHistory
      onClose={vi.fn()}
      onSelect={onSelect}
      onUpload={onUpload}
      onOpenGenerationHistory={onOpenGenerationHistory}
    />,
  )

  const picker = screen.getByRole('dialog', { name: '选择节点类型' })
  expect(picker).toBeVisible()
  expect(picker).toHaveTextContent('添加节点')
  expect(
    [...picker.querySelectorAll<HTMLButtonElement>(':scope > .canvas-node-type-picker__free-list > button')]
      .map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim()),
  ).toEqual([
    '文本',
    '图片',
    '视频',
    '智能剪辑 Beta',
    '导演台 NEW',
    '逐帧拉片 SD2.5',
    '音频',
    '脚本',
    '素材库',
    '上传',
    '从生成历史选择',
  ])
  expect(picker).toHaveTextContent('添加资源')
  expect(screen.getByRole('button', { name: '脚本' })).toHaveAttribute(
    'aria-haspopup',
    'menu',
  )
  expect(screen.getByRole('button', { name: '素材库' })).toHaveAttribute(
    'aria-haspopup',
    'menu',
  )

  await user.click(screen.getByRole('button', { name: '脚本' }))
  const scriptMenu = screen.getByRole('menu', { name: '脚本子菜单' })
  expect(
    Array.from(scriptMenu.querySelectorAll('[role="menuitem"]')).map((button) =>
      button.getAttribute('aria-label') ?? button.textContent?.trim(),
    ),
  ).toEqual(['故事脚本生成', '脚本节点', '世界观卡'])
  await user.click(screen.getByRole('menuitem', { name: '世界观卡' }))
  expect(onSelect).toHaveBeenCalledWith('worldview')

  await user.click(screen.getByRole('button', { name: '上传' }))
  await user.click(screen.getByRole('button', { name: '从生成历史选择' }))
  expect(onUpload).toHaveBeenCalledOnce()
  expect(onOpenGenerationHistory).toHaveBeenCalledOnce()
})

test('opens the material submenu without losing the recorded quick types', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  render(
    <CanvasNodeTypePicker
      anchor={{ x: 420, y: 260 }}
      bounds={{ width: 960, height: 720 }}
      onClose={vi.fn()}
      onSelect={onSelect}
    />,
  )

  await user.click(screen.getByRole('button', { name: '素材库' }))
  const materialMenu = screen.getByRole('menu', { name: '素材库子菜单' })
  expect(
    Array.from(materialMenu.querySelectorAll('[role="menuitem"]')).map((button) =>
      button.getAttribute('aria-label') ?? button.textContent?.trim(),
    ),
  ).toEqual([
    '角色三视图',
    '全能参考生视频 SD2.5',
    '音频生视频 SD2.5',
    '素材库节点',
  ])

  await user.click(screen.getByRole('menuitem', { name: '全能参考生视频 SD2.5' }))
  expect(onSelect).toHaveBeenCalledWith('reference-video')
})

test('keeps a submenu inside the picker when neither side fits', async () => {
  const user = userEvent.setup()
  render(
    <CanvasNodeTypePicker
      anchor={{ x: 360, y: 360 }}
      bounds={{ width: 721, height: 778 }}
      onClose={vi.fn()}
      onSelect={vi.fn()}
    />,
  )

  await user.click(screen.getByRole('button', { name: '素材库' }))
  expect(screen.getByRole('menu', { name: '素材库子菜单' })).toHaveClass(
    'canvas-node-type-picker__free-submenu--overlay',
  )
})

test('closes on Escape', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(
    <CanvasNodeTypePicker
      anchor={{ x: 240, y: 180 }}
      bounds={{ width: 640, height: 480 }}
      onClose={onClose}
      onSelect={vi.fn()}
    />,
  )

  await user.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledOnce()
})

test('renders the compact dock list and recorded downstream-reference list', () => {
  const { rerender } = render(
    <CanvasNodeTypePicker
      anchor={{ x: 420, y: 260 }}
      bounds={{ width: 960, height: 720 }}
      mode="add"
      canUseGenerationHistory={false}
      onClose={vi.fn()}
      onSelect={vi.fn()}
      onUpload={vi.fn()}
      onOpenGenerationHistory={vi.fn()}
    />,
  )

  const addMenu = screen.getByRole('menu', { name: '添加节点' })
  expect(
    screen.getAllByRole('menuitem', { hidden: true }).map((item) => item.textContent?.trim()),
  ).toEqual([
    '文本',
    '图片',
    '视频',
    '智能剪辑Beta',
    '导演台NEW',
    '逐帧拉片SD2.5',
    '音频',
    '脚本',
    '素材库',
    '上传',
    '从生成历史选择',
  ])
  expect(addMenu).toHaveTextContent('添加资源')

  rerender(
    <CanvasNodeTypePicker
      anchor={{ x: 420, y: 260 }}
      bounds={{ width: 960, height: 720 }}
      mode="reference"
      sourceTitle="图片节点 5"
      onClose={vi.fn()}
      onSelect={vi.fn()}
    />,
  )
  const referenceMenu = screen.getByRole('menu', { name: '引用该节点生成' })
  expect(referenceMenu).toHaveTextContent('图片节点 5')
  expect(screen.getByRole('menuitem', { name: '参考节点' })).toBeDisabled()
  expect(screen.queryByRole('menuitem', { name: '素材库' })).not.toBeInTheDocument()
})
