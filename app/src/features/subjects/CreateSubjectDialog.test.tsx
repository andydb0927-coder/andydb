import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { CreateSubjectDialog } from './CreateSubjectDialog'

test('collects local subject metadata while keeping AI extraction explicitly disabled', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(
    <CreateSubjectDialog
      sourceTitle="雨夜角色图"
      coverUrl="data:image/png;base64,cover"
      onCancel={vi.fn()}
      onSubmit={onSubmit}
    />,
  )

  expect(screen.getByRole('img', { name: '雨夜角色图主体封面' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'AI 身份提取' })).toBeDisabled()
  expect(screen.getByText('待接入 AI 身份提取')).toBeVisible()
  await user.clear(screen.getByLabelText('主体名称'))
  await user.type(screen.getByLabelText('主体名称'), '雨夜旅人')
  await user.type(screen.getByLabelText('主体描述'), '黑色风衣，冷色轮廓光')
  await user.type(screen.getByLabelText('主体标签'), '主角, 雨夜')
  await user.click(screen.getByRole('button', { name: '保存到主体库' }))

  expect(onSubmit).toHaveBeenCalledWith({
    name: '雨夜旅人',
    description: '黑色风衣，冷色轮廓光',
    tags: ['主角', '雨夜'],
  })
})
