import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { CanvasToolbar } from './CanvasToolbar'

test('enables Connect, keeps Group unavailable, and blocks Connect behind a draft', () => {
  const onToolChange = vi.fn()
  const { rerender } = render(
    <CanvasToolbar
      activeTool="connect"
      draftOpen={false}
      onToolChange={onToolChange}
    />,
  )
  const connect = screen.getByRole('button', { name: '连线' })
  expect(connect).toBeEnabled()
  expect(connect).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '分组' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '分组' })).toHaveAttribute(
    'title',
    '分组将在后续版本提供',
  )

  rerender(
    <CanvasToolbar
      activeTool="text"
      draftOpen
      onToolChange={onToolChange}
    />,
  )
  expect(screen.getByRole('button', { name: '连线' })).toBeDisabled()
})
