import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { PublishWorkDialog } from './PublishWorkDialog'

test('collects title, description, a node-result cover and normalized tags', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(
    <PublishWorkDialog
      projectTitle="未命名工作区"
      coverOptions={[
        { id: 'result-1', nodeId: 'image-1', label: '图片节点 1 · 结果 1', url: '/cover-1.png' },
        { id: 'result-2', nodeId: 'image-2', label: '图片节点 2 · 结果 1', url: '/cover-2.png' },
      ]}
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />,
  )

  const dialog = screen.getByRole('dialog', { name: '发布作品' })
  await user.clear(within(dialog).getByRole('textbox', { name: '作品标题' }))
  await user.type(within(dialog).getByRole('textbox', { name: '作品标题' }), '雨夜重逢')
  await user.type(within(dialog).getByRole('textbox', { name: '作品简介' }), '本地画布的第一版。')
  await user.click(within(dialog).getByRole('radio', { name: '图片节点 2 · 结果 1' }))
  await user.type(within(dialog).getByRole('textbox', { name: '作品标签' }), '雨夜, 电影, 氛围')
  await user.click(within(dialog).getByRole('button', { name: '发布到本地作品' }))

  expect(onSubmit).toHaveBeenCalledWith({
    title: '雨夜重逢',
    description: '本地画布的第一版。',
    coverUrl: '/cover-2.png',
    coverNodeId: 'image-2',
    tags: ['雨夜', '电影', '氛围'],
  })
})

test('disables publishing when the canvas has no node result cover', () => {
  render(
    <PublishWorkDialog
      projectTitle="空画布"
      coverOptions={[]}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
    />,
  )

  expect(screen.getByRole('alert')).toHaveTextContent('请先在画布生成或导入一张图片结果')
  expect(screen.getByRole('button', { name: '发布到本地作品' })).toBeDisabled()
})
