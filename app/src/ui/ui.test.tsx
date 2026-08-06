import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Button } from './Button'
import { StatusText } from './StatusText'

test('Button exposes its accessible name', () => {
  render(<Button>打开项目</Button>)

  expect(screen.getByRole('button', { name: '打开项目' })).toBeVisible()
})

test('Button exposes its focus-visible hook when focused by keyboard', async () => {
  const user = userEvent.setup()
  render(<Button>打开项目</Button>)

  const button = screen.getByRole('button', { name: '打开项目' })
  await user.tab()

  expect(button).toHaveFocus()
  expect(button).toHaveClass('focus-visible')
})

test('StatusText keeps its icon decorative and its copy visible', () => {
  render(<StatusText status="failed">生成失败</StatusText>)

  expect(screen.getByText('生成失败')).toBeVisible()
  expect(screen.getByTestId('status-icon')).toHaveAttribute(
    'aria-hidden',
    'true',
  )
})
