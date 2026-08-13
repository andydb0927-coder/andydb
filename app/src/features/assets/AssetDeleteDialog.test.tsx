import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { AssetDeleteDialog } from './AssetDeleteDialog'

afterEach(() => {
  document.body.replaceChildren()
})

describe('AssetDeleteDialog', () => {
  test('focuses Cancel and Escape restores the exact trigger focus', () => {
    const trigger = document.createElement('button')
    trigger.textContent = '删除素材'
    document.body.append(trigger)
    trigger.focus()
    const onCancel = vi.fn()

    render(
      <AssetDeleteDialog
        assetName="雨夜参考"
        busy={false}
        returnFocusTo={trigger}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    return Promise.resolve().then(() => expect(trigger).toHaveFocus())
  })

  test('submits at most once while busy', async () => {
    const user = userEvent.setup()
    const trigger = document.createElement('button')
    document.body.append(trigger)
    const onConfirm = vi.fn()

    const view = render(
      <AssetDeleteDialog
        assetName="雨夜参考"
        busy={false}
        returnFocusTo={trigger}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )
    await user.click(screen.getByRole('button', { name: '确认删除' }))
    await user.click(screen.getByRole('button', { name: '确认删除' }))
    view.rerender(
      <AssetDeleteDialog
        assetName="雨夜参考"
        busy
        returnFocusTo={trigger}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '确认删除' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
  })
})
