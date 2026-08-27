import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { createArkVideoContinueProvider } from '../generation/ark-video-continue-provider'
import { arkVideoContinueConfigFixture } from '../generation/fixtures/ark-video-continue.fixture'
import type { Asset } from '../project/model'
import { VideoContinueDialog } from './VideoContinueDialog'

const asset: Asset = { id: 'source', kind: 'video', url: 'https://media.fixture.invalid/source.mp4', mimeType: 'video/mp4', durationSeconds: 5, width: 1280, height: 720 }
const provider = createArkVideoContinueProvider(arkVideoContinueConfigFixture)

test('shows real cost and source boundaries, closes without side effects and returns focus', async () => {
  const user = userEvent.setup()
  const submit = vi.fn(), close = vi.fn()
  const trigger = document.createElement('button')
  document.body.append(trigger); trigger.focus()
  const { unmount } = render(<VideoContinueDialog asset={asset} provider={provider} onSubmit={submit} onClose={close} />)
  expect(screen.getByRole('dialog', { name: '智能续写' })).toHaveTextContent('28 元/百万输出 token')
  expect(screen.getByRole('button', { name: '确认续写并生成' })).toBeDisabled()
  await user.type(screen.getByRole('textbox', { name: '续写描述' }), '古桥向晨雾中延伸')
  expect(submit).not.toHaveBeenCalled()
  await user.keyboard('{Escape}')
  expect(close).toHaveBeenCalledOnce()
  expect(submit).not.toHaveBeenCalled()
  unmount(); expect(trigger).toHaveFocus(); trigger.remove()
})

test('confirms a valid draft exactly once, with selected output parameters and source metadata', async () => {
  const user = userEvent.setup(), submit = vi.fn()
  render(<VideoContinueDialog asset={asset} provider={provider} onSubmit={submit} onClose={vi.fn()} />)
  await user.type(screen.getByRole('textbox', { name: '续写描述' }), '镜头推向古桥')
  await user.selectOptions(screen.getByRole('combobox', { name: '输出时长' }), '10')
  await user.selectOptions(screen.getByRole('combobox', { name: '输出清晰度' }), '1080P')
  await user.click(screen.getByRole('checkbox', { name: '生成声音' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('31 元/百万输出 token')
  await user.dblClick(screen.getByRole('button', { name: '确认续写并生成' }))
  expect(submit).toHaveBeenCalledOnce()
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ prompt: '镜头推向古桥', duration: 10, quality: '1080P', sound: false, sourceDuration: 5 }))
})

test('disabled configuration, invalid local source and busy jobs cannot submit', () => {
  const onSubmit = vi.fn(), onClose = vi.fn()
  const { rerender } = render(<VideoContinueDialog asset={asset} provider={createArkVideoContinueProvider({ mode: 'mock', apiKey: '' })} onSubmit={onSubmit} onClose={onClose} />)
  expect(screen.getByRole('status')).toHaveTextContent('配置未完成')
  expect(screen.getByRole('button', { name: '确认续写并生成' })).toBeDisabled()
  rerender(<VideoContinueDialog asset={{ ...asset, url: 'blob:local' }} provider={provider} onSubmit={onSubmit} onClose={onClose} />)
  expect(screen.getByRole('status')).toHaveTextContent('HTTPS')
  rerender(<VideoContinueDialog asset={asset} provider={provider} busy onSubmit={onSubmit} onClose={onClose} />)
  expect(screen.getByRole('status')).toHaveTextContent('已有生成任务')
  expect(onSubmit).not.toHaveBeenCalled()
})

test('loads missing duration from the source player but blocks unreadable video', () => {
  render(<VideoContinueDialog asset={{ ...asset, durationSeconds: undefined }} provider={provider} onSubmit={vi.fn()} onClose={vi.fn()} />)
  const video = screen.getByLabelText('续写源视频')
  Object.defineProperties(video, {
    duration: { configurable: true, value: 7 },
    videoWidth: { configurable: true, value: 1280 },
    videoHeight: { configurable: true, value: 720 },
  })
  fireEvent.loadedMetadata(video)
  expect(screen.getByText(/源视频 7/)).toBeVisible()
  fireEvent.error(video)
  expect(screen.getByRole('status')).toHaveTextContent('源视频无法读取')
})
