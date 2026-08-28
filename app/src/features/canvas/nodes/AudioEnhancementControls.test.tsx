import { afterEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { AudioVoicePicker, AudioParameterSliders, AudioResultInfo, AudioVersionHistory, AudioVersionPreview } from './AudioEnhancementControls'
import * as audioProcessing from '../../media/browser-media-processing'
import { createArkTtsProvider } from '../../generation/ark-tts-provider'
import type { CreativeNodeData } from '../node-types'
import { makeProjectFixture } from '../../../test/fixtures'

afterEach(() => vi.restoreAllMocks())

test('version waveform thumbnails decode the actual asset only when expanded and cancel on close', async () => {
  const decode = vi.spyOn(audioProcessing, 'extractAudioToWav').mockResolvedValue({ waveform: [0.2, 0.8, 0.4], durationSeconds: 2, dataUrl: 'wav', mimeType: 'audio/wav' })
  const asset = { id: 'version-audio', kind: 'audio' as const, url: 'stored.wav', mimeType: 'audio/wav' }
  const view = render(<AudioVersionPreview asset={asset} index={0} enabled={false} />)
  expect(decode).not.toHaveBeenCalled()
  view.rerender(<AudioVersionPreview asset={asset} index={0} enabled />)
  const waveform = await screen.findByRole('img', { name: '音频版本 1 波形' })
  expect(waveform.querySelectorAll('span')).toHaveLength(3)
  expect(waveform.querySelectorAll('span')[1]).toHaveStyle({ height: '80%' })
  expect(decode).toHaveBeenCalledWith(asset.url, undefined, expect.any(AbortSignal))
  const signal = decode.mock.calls[0][2]!
  view.rerender(<AudioVersionPreview asset={asset} index={0} enabled={false} />)
  expect(signal.aborted).toBe(true)
})

test('waveform decode failure shows a reason without drawing invented samples', async () => {
  vi.spyOn(audioProcessing, 'extractAudioToWav').mockRejectedValue(new Error('decode failed'))
  render(<AudioVersionPreview asset={{ id: 'bad', kind: 'audio', url: 'bad.wav', mimeType: 'audio/wav' }} index={0} enabled />)
  await screen.findByText('波形无法读取，可使用下方播放器检查音频。')
  expect(screen.queryByRole('img', { name: '音频版本 1 波形' })).toBeNull()
})

test('official voice IDs are selectable and audition only plays stored successful audio', async () => {
  const onChange = vi.fn()
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const asset = { id: 'sample', kind: 'audio' as const, url: 'data:audio/wav;base64,UklGRg==', mimeType: 'audio/wav' }
  const view = render(<AudioVoicePicker value="温暖女声" onChange={onChange} samples={[{ voiceId: 'zh_male_m191_uranus_bigtts', asset }]} />)
  expect(screen.getByRole('combobox', { name: '音色' })).toHaveValue('zh_female_vv_uranus_bigtts')
  fireEvent.change(screen.getByRole('combobox', { name: '音色' }), { target: { value: 'zh_male_m191_uranus_bigtts' } })
  expect(onChange).toHaveBeenCalledWith('zh_male_m191_uranus_bigtts')
  fireEvent.click(screen.getByText('音色样音（4）'))
  expect(screen.getByRole('button', { name: '试听 Vivi 2.0' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '试听 Vivi 2.0' })).toHaveAccessibleDescription(expect.stringContaining('尚无'))
  fireEvent.click(screen.getByRole('button', { name: '试听 云舟 2.0' }))
  expect(play).toHaveBeenCalledOnce()
  expect(document.querySelector('audio')).toHaveAttribute('src', asset.url)
  view.unmount()
  expect(pause).toHaveBeenCalled()
})

test('speed volume pitch sliders follow manifest and dispatch persisted values', () => {
  const onUpdate = vi.fn()
  render(<AudioParameterSliders provider={createArkTtsProvider({ mode: 'mock' })} details={{ type: 'audio', durationSeconds: 0, voice: '温暖女声', speed: 1, volume: 75 }} onUpdate={onUpdate} />)
  const pitch = screen.getByRole('slider', { name: '音调' })
  expect(pitch).toHaveAttribute('min', '-12')
  expect(pitch).toHaveAttribute('max', '12')
  fireEvent.change(pitch, { target: { value: '3' } })
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 3 }))
  expect(screen.getByRole('slider', { name: '语速' })).toHaveValue('1')
  expect(screen.getByRole('slider', { name: '音量' })).toHaveValue('75')
})

test('result metadata uses the exact version cost and does not invent missing values', () => {
  const view = render(<AudioResultInfo asset={{ id: 'a', kind: 'audio', url: 'fixture.wav', mimeType: 'audio/wav', durationSeconds: 1.5, sampleRate: 24000 }} />)
  expect(screen.getByRole('group', { name: '音频结果信息' })).toHaveTextContent('1.50s')
  expect(screen.getByText('24000 Hz')).toBeVisible()
  expect(screen.getByText('WAV')).toBeVisible()
  expect(screen.getByText('未提供')).toBeVisible()
  view.rerender(<AudioResultInfo asset={{ id: 'a', kind: 'audio', url: 'fixture.mp3', mimeType: 'audio/mpeg' }} />)
  expect(screen.getAllByText('未读取')).toHaveLength(2)
})

test('history previews are separate from restore buttons and busy tasks block restore', async () => {
  vi.spyOn(audioProcessing, 'extractAudioToWav').mockResolvedValue({ waveform: [0.3, 0.6], durationSeconds: 2, dataUrl: 'wav', mimeType: 'audio/wav' })
  const project = makeProjectFixture()
  const node = project.nodes[0]
  node.activeVersionId = 'b'
  const onRestoreAudioVersion = vi.fn()
  const versions = ['a', 'b'].map(id => ({ version: { id, prompt: id, createdAt: project.createdAt }, asset: { id, kind: 'audio' as const, url: `${id}.wav`, mimeType: 'audio/wav' } }))
  const data: CreativeNodeData = { node, audioVersions: versions, onRestoreAudioVersion,
    selected: true, actionsPlacement: 'after', contextual: true, connectionMode: false, connectionSource: false, focusOnMount: false, focusRequestVersion: 0,
    onSelect: vi.fn(), onAction: vi.fn(), onHandleActivate: vi.fn(), onFocusComplete: vi.fn(), onDelete: vi.fn(),
  }
  const view = render(<AudioVersionHistory data={data} />)
  fireEvent.click(screen.getByText('音频版本（2）'))
  await screen.findByRole('img', { name: '音频版本 1 波形' })
  expect(document.querySelectorAll('audio')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: '恢复音频版本 1' }))
  expect(onRestoreAudioVersion).toHaveBeenCalledWith('a')
  expect(within(screen.getByRole('button', { name: '恢复音频版本 1' })).queryByRole('audio')).toBeNull()
  view.rerender(<AudioVersionHistory data={{ ...data, job: { ...project.jobs[0], status: 'running' } }} />)
  expect(screen.getByRole('button', { name: '恢复音频版本 1' })).toBeDisabled()
})
