import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CreativeNodeData } from '../node-types'
import type { AudioNodeDetails } from '../../project/model'
import { AudioLocalControls } from './AudioLocalControls'
import { extractAudioToWav } from '../../media/browser-media-processing'
import { makeProjectFixture } from '../../../test/fixtures'

vi.mock('../../media/browser-media-processing', () => ({ extractAudioToWav: vi.fn() }))
afterEach(() => vi.restoreAllMocks())

function setup() {
  const details: AudioNodeDetails = { type: 'audio', durationSeconds: 99, voice: '温暖女声', speed: 1, volume: 75, fadeInSeconds: 0.25, fadeOutSeconds: 0.5, normalize: true }
  const data: CreativeNodeData = { node: makeProjectFixture().nodes[0],
    asset: { id: 'audio', kind: 'audio', url: 'fixture.wav', mimeType: 'audio/wav' },
    selected: true, actionsPlacement: 'after', contextual: true, connectionMode: false, connectionSource: false, focusOnMount: false, focusRequestVersion: 0,
    onSelect: vi.fn(), onAction: vi.fn(), onHandleActivate: vi.fn(), onFocusComplete: vi.fn(), onDelete: vi.fn(),
  }
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  return { data, details }
}

test('waits for actual decoded duration, never presenting requested duration as result metadata', async () => {
  const { data, details } = setup()
  let finish!: (result: Awaited<ReturnType<typeof extractAudioToWav>>) => void
  vi.mocked(extractAudioToWav).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  render(<AudioLocalControls data={data} details={details} onUpdate={vi.fn()} />)
  expect(screen.getByRole('group', { name: '音频结果信息' })).not.toHaveTextContent('99.00s')
  expect(screen.getByRole('button', { name: '试听选区' })).toBeDisabled()
  await act(async () => finish({ waveform: [0.5], durationSeconds: 2, dataUrl: 'wav', mimeType: 'audio/wav' }))
  expect(screen.getByRole('group', { name: '音频结果信息' })).toHaveTextContent('2.00s')
})

test('persists effect controls, forwards the full processing contract, and cancels without duplicate writes', async () => {
  const { data, details } = setup()
  const onUpdate = vi.fn()
  let finish!: () => void
  data.onProcessAudio = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  vi.mocked(extractAudioToWav).mockResolvedValue({ waveform: [0.5], durationSeconds: 2, dataUrl: 'wav', mimeType: 'audio/wav' })
  render(<AudioLocalControls data={data} details={details} onUpdate={onUpdate} />)
  await waitFor(() => expect(screen.getByRole('button', { name: '试听选区' })).toBeEnabled())
  fireEvent.change(screen.getByRole('slider', { name: '音频淡入' }), { target: { value: '0.3' } })
  expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ fadeInSeconds: 0.3 }))
  const save = screen.getByRole('button', { name: '截取并导出 WAV' })
  fireEvent.click(save)
  fireEvent.click(save)
  expect(data.onProcessAudio).toHaveBeenCalledOnce()
  const [options, signal] = vi.mocked(data.onProcessAudio).mock.calls[0]
  expect(options).toEqual({ startSeconds: 0, endSeconds: 2, playbackRate: 1, fadeInSeconds: 0.25, fadeOutSeconds: 0.5, normalize: true })
  fireEvent.click(screen.getByRole('button', { name: '取消音频处理' }))
  expect(signal?.aborted).toBe(true)
  await act(async () => finish())
  expect(screen.queryByText('WAV 已保存到资产库与画布。')).toBeNull()
})

test('processing failures remain visible and allow retry', async () => {
  const { data, details } = setup()
  data.onProcessAudio = vi.fn().mockRejectedValue(new Error('音频素材已切换，请重新操作。'))
  vi.mocked(extractAudioToWav).mockResolvedValue({ waveform: [0.5], durationSeconds: 2, dataUrl: 'wav', mimeType: 'audio/wav' })
  render(<AudioLocalControls data={data} details={details} onUpdate={vi.fn()} />)
  const save = screen.getByRole('button', { name: '截取并导出 WAV' })
  await waitFor(() => expect(save).toBeEnabled())
  fireEvent.click(save)
  await screen.findByText('音频素材已切换，请重新操作。')
  expect(save).toBeEnabled()
})
