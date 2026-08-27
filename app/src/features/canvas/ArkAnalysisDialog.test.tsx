import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ArkAnalysisDialog } from './ArkAnalysisDialog'
import { createFixtureProviderRegistry } from '../../test/provider-fixtures'
import type { Asset } from '../project/model'

const registry = createFixtureProviderRegistry()
const image: Asset = { id: 'image', kind: 'image', mimeType: 'image/png', url: 'https://media.fixture.invalid/image.png' }
const video: Asset = { id: 'video', kind: 'video', mimeType: 'video/mp4', url: 'https://media.fixture.invalid/video.mp4' }

test('shows full 25-request cost and template preview without dispatching until confirmed', async () => {
  const submit = vi.fn(), close = vi.fn(), user = userEvent.setup()
  render(<ArkAnalysisDialog provider={registry.require('storyboard-25-grid-api')} assets={[image]} initialSource={image} initialPrompt="古桥行人" onSubmit={submit} onClose={close} />)
  expect(screen.getByRole('dialog')).toHaveTextContent('串行 25 次')
  expect(screen.getByRole('dialog')).toHaveTextContent('450 积分')
  expect(screen.getByRole('dialog')).toHaveTextContent('¥7.50')
  await user.selectOptions(screen.getByLabelText('输出清晰度'), '2K')
  expect(screen.getByRole('dialog')).toHaveTextContent('¥15.00')
  expect(submit).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '确认生成' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ prompt: '古桥行人', source: image, parameters: expect.objectContaining({ resolution: '2K', count: 1 }) }))
})

test('blocks missing source for lighting and malformed optional box', async () => {
  const user = userEvent.setup()
  render(<ArkAnalysisDialog provider={registry.require('cinematic-lighting-api')} assets={[image]} initialPrompt="自然侧光" onSubmit={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByRole('button', { name: '确认生成' })).toBeDisabled()
  await user.selectOptions(screen.getByLabelText('源素材'), 'image')
  expect(screen.getByRole('button', { name: '确认生成' })).toBeEnabled()
  await user.click(screen.getByRole('checkbox', { name: '指定光影区域' }))
  fireEvent.change(screen.getByLabelText('右边界'), { target: { value: '0' } })
  expect(screen.getByRole('button', { name: '确认生成' })).toBeDisabled()
})

test('restores the saved analysis parameters before confirming a history resend', async () => {
  const submit = vi.fn(), user = userEvent.setup()
  render(<ArkAnalysisDialog provider={registry.require('cinematic-lighting-api')} assets={[image]} initialSource={image} initialPrompt="自然侧光" initialParameters={{ resolution: '2K', useBox: true, editX1: 100, editY1: 200, editX2: 800, editY2: 900 }} onSubmit={submit} onClose={vi.fn()} />)
  expect(screen.getByLabelText('输出清晰度')).toHaveValue('2K')
  expect(screen.getByRole('checkbox', { name: '指定光影区域' })).toBeChecked()
  expect(screen.getByLabelText('左边界')).toHaveValue(100)
  expect(submit).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '确认生成' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ parameters: expect.objectContaining({ resolution: '2K', editX1: 100, editY2: 900 }) }))
})

test('allows choosing a real video, validates fps, and keeps music honest', async () => {
  const user = userEvent.setup()
  render(<ArkAnalysisDialog provider={registry.require('frame-analysis-api')} assets={[video]} onSubmit={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByRole('button', { name: '确认分析' })).toBeDisabled()
  await user.selectOptions(screen.getByLabelText('源素材'), 'video')
  expect(screen.getByRole('button', { name: '确认分析' })).toBeEnabled()
  expect(screen.getByRole('checkbox', { name: '音乐维度' })).toBeDisabled()
  expect(screen.getByRole('dialog')).toHaveTextContent('不读取音轨')
  fireEvent.change(screen.getByLabelText('抽帧频率'), { target: { value: '6' } })
  expect(screen.getByRole('button', { name: '确认分析' })).toBeDisabled()
})

test('Escape and cancel close without side effects; mock mode explains disabled state', async () => {
  const close = vi.fn(), submit = vi.fn(), user = userEvent.setup()
  render(<ArkAnalysisDialog provider={{ ...registry.require('panorama-720-api'), disabledReason: '全景开发验证配置未完成' }} assets={[]} initialPrompt="古桥" onSubmit={submit} onClose={close} />)
  expect(screen.getByRole('dialog')).toHaveTextContent('不保证')
  expect(screen.getByRole('button', { name: '确认生成' })).toBeDisabled()
  await user.keyboard('{Escape}')
  expect(close).toHaveBeenCalledOnce()
  expect(submit).not.toHaveBeenCalled()
})
