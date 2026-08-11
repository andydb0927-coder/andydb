import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { CanvasToolbar } from './CanvasToolbar'

test('enables Connect, keeps Group unavailable, and blocks Connect behind a draft', () => {
  const onToolChange = vi.fn()
  const { rerender } = render(
    <CanvasToolbar
      activeTool="connect"
      draftOpen={false}
      connectionsVisible
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
    '分组将在后续版本提供',
  )

  rerender(
    <CanvasToolbar
      activeTool="text"
      draftOpen
      connectionsVisible
      onToolChange={onToolChange}
      onToggleConnections={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: '连线' })).toBeDisabled()
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
