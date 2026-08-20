import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { CanvasNodeTypePicker } from './CanvasNodeTypePicker'

test('offers Liblib generation types plus existing media nodes', async () => {
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

  const picker = screen.getByRole('dialog', { name: '选择节点类型' })
  expect(picker).toBeVisible()
  for (const name of [
    '故事脚本生成',
    '角色三视图',
    '全能参考生视频 SD2.5',
    '音频生视频 SD2.5',
    '世界观卡',
    '文本',
    '图片',
    '分镜',
    '视频',
  ]) {
    expect(screen.getByRole('button', { name })).toBeVisible()
  }
  expect(screen.getAllByText('SD2.5')).toHaveLength(2)

  await user.click(screen.getByRole('button', { name: /全能参考生视频/ }))
  expect(onSelect).toHaveBeenCalledWith('reference-video')
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
