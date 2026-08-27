import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { createArkImageEditProvider } from '../generation/ark-image-edit-provider'
import { arkImageEditConfigFixture } from '../generation/fixtures/ark-image-edit.fixture'
import { ImageEditDialog, normalizeImageEditBox } from './ImageEditDialog'

const asset = { id: 'source', kind: 'image' as const, url: 'https://media.fixture.invalid/image-source.png', mimeType: 'image/png', width: 2816, height: 1584 }
const provider = createArkImageEditProvider(arkImageEditConfigFixture)

test('outpaint is a draft until explicit confirmation and shows size, real price and local credits', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  const onClose = vi.fn()
  render(<ImageEditDialog asset={asset} operation="outpaint" provider={provider} onSubmit={onSubmit} onClose={onClose} />)
  expect(screen.getByRole('button', { name: '确认编辑并生成' })).toBeDisabled()
  await user.type(screen.getByLabelText('编辑描述'), '延续山谷')
  await user.selectOptions(screen.getByLabelText('扩图方向'), '左侧')
  expect(screen.getByText(/2816 × 1584/)).toBeVisible()
  expect(screen.getByText(/¥0.60/)).toBeVisible()
  expect(screen.getByText(/18 积分/)).toBeVisible()
  expect(onSubmit).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '确认编辑并生成' }))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ operation: 'outpaint', prompt: '延续山谷', direction: '左侧', width: 2816, height: 1584 }))
})

test('erase requires valid coordinates; Escape closes without submitting or consuming credits', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  const onClose = vi.fn()
  render(<ImageEditDialog asset={asset} operation="erase" provider={provider} onSubmit={onSubmit} onClose={onClose} />)
  await user.type(screen.getByLabelText('编辑描述'), '路牌')
  expect(screen.getByRole('button', { name: '确认编辑并生成' })).toBeDisabled()
  for (const [name, value] of [['左边界', '100'], ['上边界', '200'], ['右边界', '600'], ['下边界', '800']]) {
    fireEvent.change(screen.getByLabelText(name!), { target: { value } })
  }
  expect(screen.getByRole('button', { name: '确认编辑并生成' })).toBeEnabled()
  fireEvent.change(screen.getByLabelText('输出宽度'), { target: { value: '99' } })
  expect(screen.getByRole('button', { name: '确认编辑并生成' })).toBeDisabled()
  await user.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledOnce()
  expect(onSubmit).not.toHaveBeenCalled()
})

test('offline configuration stays disabled and explains why', () => {
  render(<ImageEditDialog asset={asset} operation="outpaint" provider={createArkImageEditProvider({ mode: 'mock' })} onSubmit={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText('火山方舟图片编辑开发验证配置未完成')).toBeVisible()
  expect(screen.getByRole('button', { name: '确认编辑并生成' })).toBeDisabled()
})

test('normalizes reverse drags and clamps coordinates to the official 0–999 range', () => {
  expect(normalizeImageEditBox({ x: 1, y: 0.8 }, { x: 0.1, y: -0.1 })).toEqual({ x1: 100, y1: 0, x2: 999, y2: 800 })
})
