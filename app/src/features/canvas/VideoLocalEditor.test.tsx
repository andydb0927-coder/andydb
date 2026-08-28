import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { VideoLocalEditor } from './VideoLocalEditor'
import * as mediaProcessing from '../media/browser-media-processing'

beforeEach(() => {
  vi.spyOn(mediaProcessing, 'readVideoMetadata').mockResolvedValue({ width: 1280, height: 720, duration: 8 })
})
afterEach(() => vi.restoreAllMocks())

const asset = { id: 'video', kind: 'video' as const, url: '/fixture.mp4', mimeType: 'video/mp4', width: 1280, height: 720, durationSeconds: 8 }
test('local video editor submits real transform options once, validates secondary sources and is cancel-safe', async () => {
  const submit = vi.fn().mockResolvedValue(undefined)
  const close = vi.fn()
  render(<VideoLocalEditor asset={asset} candidates={[{ asset, title: '原视频' }]} onClose={close} onSubmit={submit} />)
  await waitFor(() => expect(screen.getByRole('button', { name: '导出处理视频' })).toBeEnabled())
  fireEvent.change(screen.getByLabelText('旋转'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('播放速度'), { target: { value: '2' } })
  fireEvent.click(screen.getByLabelText('水平镜像'))
  fireEvent.change(screen.getByLabelText('合成布局'), { target: { value: 'pip' } })
  expect(screen.getByRole('button', { name: '导出处理视频' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('副视频 1'), { target: { value: asset.url } })
  await waitFor(() => expect(screen.getByRole('button', { name: '导出处理视频' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '导出处理视频' }))
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ playbackRate: 2, rotationQuarterTurns: 1, mirrorHorizontal: true, layout: 'pip', secondaryUrls: [asset.url] }))
  expect(screen.getByText(/不含音轨/)).toBeVisible()
})
test('Escape closes draft without processing and processing errors remain visible', async () => {
  const submit = vi.fn().mockRejectedValue(new Error('媒体解码失败。'))
  const close = vi.fn()
  render(<VideoLocalEditor asset={asset} candidates={[]} onClose={close} onSubmit={submit} />)
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(close).toHaveBeenCalled()
  expect(submit).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByRole('button', { name: '导出处理视频' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '导出处理视频' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('媒体解码失败')
})

test('does not export guessed durations when source metadata cannot be decoded', async () => {
  vi.mocked(mediaProcessing.readVideoMetadata).mockRejectedValue(new Error('无法读取视频时长。'))
  const submit = vi.fn()
  render(<VideoLocalEditor asset={asset} candidates={[]} onClose={vi.fn()} onSubmit={submit} />)
  expect(await screen.findByText('无法读取视频时长。')).toBeVisible()
  expect(screen.getByRole('button', { name: '导出处理视频' })).toBeDisabled()
  expect(submit).not.toHaveBeenCalled()
})
