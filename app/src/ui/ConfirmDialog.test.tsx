import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

test('keeps the caller DOM, accessible name and description without executing actions', () => {
  const close = vi.fn(), submit = vi.fn()
  const { container } = render(<ConfirmDialog label="付费确认" describedBy="cost" overlayClassName="existing-overlay" className="existing-dialog" onClose={close}>
    <p id="cost">总成本18积分</p><button onClick={submit}>确认生成</button>
  </ConfirmDialog>)
  const dialog = screen.getByRole('dialog', { name: '付费确认' })
  expect(dialog).toHaveAccessibleDescription('总成本18积分')
  expect(dialog).toHaveClass('existing-dialog')
  expect(container.firstElementChild).toHaveClass('existing-overlay')
  expect(submit).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
})

test('focus, tab boundaries, Escape and restore are shared without calling submit', async () => {
  const user = userEvent.setup(), close = vi.fn(), submit = vi.fn()
  const trigger = document.createElement('button')
  document.body.append(trigger); trigger.focus()
  const view = render(<ConfirmDialog label="编辑确认" portal initialFocus="textarea" focusableSelector="button:not(:disabled),textarea" restoreFocus onClose={close}>
    <button>关闭</button><textarea aria-label="编辑描述" /><button disabled>不可用</button><button onClick={submit}>确认</button>
  </ConfirmDialog>)
  expect(screen.getByRole('textbox')).toHaveFocus()
  screen.getByRole('button', { name: '确认' }).focus()
  await user.tab()
  expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus()
  await user.tab({ shift: true })
  expect(screen.getByRole('button', { name: '确认' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(close).toHaveBeenCalledOnce()
  expect(submit).not.toHaveBeenCalled()
  view.unmount()
  expect(trigger).toHaveFocus()
  trigger.remove()
})

test('only a configured backdrop dismisses and all dialog keys stay out of canvas shortcuts', () => {
  const parent = vi.fn(), close = vi.fn()
  const view = render(<div onKeyDown={parent}><ConfirmDialog label="继续" role="alertdialog" dismissOnBackdrop onClose={close}><button>确认</button></ConfirmDialog></div>)
  const dialog = screen.getByRole('alertdialog')
  fireEvent.pointerDown(dialog)
  expect(close).not.toHaveBeenCalled()
  fireEvent.keyDown(dialog, { key: 'Delete' })
  expect(parent).not.toHaveBeenCalled()
  fireEvent.pointerDown(dialog.parentElement!)
  expect(close).toHaveBeenCalledOnce()
  view.unmount()
})
