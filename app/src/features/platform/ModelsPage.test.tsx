import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'

import { ModelsPage } from './ModelsPage'

test('filters local demonstration capabilities by kind', async () => {
  const user = userEvent.setup()
  render(<ModelsPage />)

  await user.click(screen.getByRole('radio', { name: '视频' }))

  expect(screen.getByText('演示视频草稿')).toBeVisible()
  expect(screen.queryByText('演示图像草稿')).not.toBeInTheDocument()
  expect(screen.getByText('本地演示适配器')).toBeVisible()
  expect(screen.getByText('真实提供方未配置')).toBeVisible()
})
