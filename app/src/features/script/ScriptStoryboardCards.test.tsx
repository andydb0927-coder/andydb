import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ScriptStoryboardCards } from './ScriptStoryboardCards'
import { parseScriptBreakdown, parseScriptShots } from './script-workflow'
import { scriptBreakdownFixture, scriptShotsFixture } from './fixtures/script-v2.fixture'

test('renders editable shot fields, references, failure reasons and existing result actions', () => {
  const breakdown = parseScriptBreakdown(JSON.stringify(scriptBreakdownFixture))
  const shots = parseScriptShots(JSON.stringify(scriptShotsFixture), breakdown)
  shots[0].assetId = 'image'; shots[0].status = 'succeeded'
  shots[1].status = 'failed'; shots[1].error = '请求过于频繁'
  const onEdit = vi.fn(), onSend = vi.fn()
  render(<ScriptStoryboardCards details={{ type: 'script', ...breakdown, shots }} assets={[{ id: 'image', kind: 'image', url: 'https://fixture.invalid/image.png', mimeType: 'image/png' }]} onEdit={onEdit} onSend={onSend} />)
  expect(screen.getByRole('img', { name: '分镜 1 薄雾古桥' })).toBeInTheDocument()
  expect(screen.getByText('请求过于频繁')).toBeInTheDocument()
  fireEvent.click(screen.getAllByText('编辑分镜')[0])
  fireEvent.change(screen.getByRole('textbox', { name: '分镜 1 机位' }), { target: { value: '低机位' } })
  expect(onEdit).toHaveBeenCalledWith(shots[0].id, { cameraAngle: '低机位' })
  fireEvent.click(screen.getByRole('button', { name: '发送分镜 1 到画布' }))
  expect(onSend).toHaveBeenCalledWith(shots[0].id)
  expect(screen.getByRole('button', { name: '发送分镜 2 到画布' })).toBeDisabled()
})

test('busy cards prevent edits and expose the reason without hiding controls', () => {
  const breakdown = parseScriptBreakdown(JSON.stringify(scriptBreakdownFixture))
  const shots = parseScriptShots(JSON.stringify(scriptShotsFixture), breakdown)
  render(<ScriptStoryboardCards details={{ type: 'script', ...breakdown, shots }} assets={[]} busy onEdit={vi.fn()} onSend={vi.fn()} />)
  fireEvent.click(screen.getAllByText('编辑分镜')[0])
  expect(screen.getByRole('textbox', { name: '分镜 1 提示词' })).toBeDisabled()
  expect(screen.getByText('任务执行期间分镜编辑暂时锁定。')).toBeInTheDocument()
})
