import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { DirectorInput } from './DirectorInput'
import { DirectorComposer } from './DirectorComposer'
import { describeCommand, parseDirectorCommand } from './director-command'

test('controlled input forwards events and focus without owning generation or proposal state', async () => {
  const inputRef = createRef<HTMLTextAreaElement>()
  const onChange = vi.fn(), onSubmit = vi.fn(event => event.preventDefault()), onFiles = vi.fn()
  render(<DirectorInput input="草稿" inputRef={inputRef} referenceMenuOpen={false} assetLibraryOpen={false}
    onChange={onChange} onSubmit={onSubmit} onFiles={onFiles} onToggleReference={vi.fn()} onToggleAssets={vi.fn()} />)
  expect(inputRef.current).toBe(screen.getByRole('textbox'))
  fireEvent.change(inputRef.current!, { target: { value: '新草稿' } })
  expect(onChange).toHaveBeenCalledWith('新草稿')
  await userEvent.click(screen.getByRole('button', { name: '提交给 AI 导演' }))
  expect(onSubmit).toHaveBeenCalledOnce()
  expect(screen.getByRole('textbox')).toHaveValue('草稿')
})

test('proposal remains gated by explicit execution and edits invalidate an old proposal', async () => {
  const user = userEvent.setup(), onExecute = vi.fn()
  render(<MemoryRouter><DirectorComposer selectedNodeId="node-1" onExecute={onExecute} storage={{ getItem: () => null, setItem: vi.fn() }} /></MemoryRouter>)
  const input = screen.getByRole('textbox', { name: '告诉我下一步要做什么' })
  await user.type(input, '把这个片段加入时间线')
  await user.click(screen.getByRole('button', { name: '提交给 AI 导演' }))
  expect(onExecute).not.toHaveBeenCalled()
  expect(screen.getByText(describeCommand(parseDirectorCommand('把这个片段加入时间线', { selectedNodeId: 'node-1' })))).toBeVisible()
  await user.click(screen.getByRole('button', { name: '执行' }))
  expect(onExecute).toHaveBeenCalledWith({ type: 'add-to-timeline', nodeId: 'node-1' }, input)
  expect(input).toHaveValue('')
  await user.type(input, '删除这个节点')
  await user.click(screen.getByRole('button', { name: '提交给 AI 导演' }))
  await user.type(input, '先不要')
  expect(screen.queryByRole('button', { name: '执行' })).not.toBeInTheDocument()
})
