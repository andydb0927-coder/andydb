import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { StoryboardGroupDialog } from './StoryboardGroupDialog'

test('chooses presets, validates custom capacity and applies the layout', async () => {
  const user = userEvent.setup()
  const onApply = vi.fn()
  render(
    <StoryboardGroupDialog
      title="分镜组 01"
      nodeCount={5}
      onApply={onApply}
      onClose={vi.fn()}
    />,
  )

  expect(screen.getByRole('button', { name: '2x2' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '自定义' }))
  await user.clear(screen.getByLabelText('自定义列数'))
  await user.type(screen.getByLabelText('自定义列数'), '2')
  await user.clear(screen.getByLabelText('自定义行数'))
  await user.type(screen.getByLabelText('自定义行数'), '2')
  expect(screen.getByRole('alert')).toHaveTextContent('当前格数不足')
  expect(screen.getByRole('button', { name: '转换并自动排版' })).toBeDisabled()

  await user.clear(screen.getByLabelText('自定义行数'))
  await user.type(screen.getByLabelText('自定义行数'), '3')
  await user.click(screen.getByRole('button', { name: '转换并自动排版' }))
  expect(onApply).toHaveBeenCalledWith({ preset: 'custom', columns: 2, rows: 3 })
})
