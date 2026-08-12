import { describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject } from './timeline-project'
import {
  createPreviewRecording,
  downloadBlob,
  serializeTimelineEdl,
  serializeTimelineJson,
  supportsPreviewRecording,
  type PreviewMediaRecorder,
  type PreviewRecorderFactory,
} from './timeline-export'

describe('timeline browser exports', () => {
  test('serializes a versioned JSON editing decision payload', () => {
    const timeline = createTimelineProject(makeProjectFixture())
    const payload = JSON.parse(serializeTimelineJson(timeline))

    expect(payload).toMatchObject({
      format: 'wireless-canvas-timeline',
      version: 1,
      project: {
        id: timeline.id,
        frameRate: 24,
        tracks: expect.arrayContaining([
          expect.objectContaining({ kind: 'video' }),
          expect.objectContaining({ kind: 'subtitle' }),
        ]),
      },
    })
  })

  test('serializes visual decisions to deterministic 24fps EDL timecode', () => {
    const timeline = createTimelineProject(makeProjectFixture())
    const edl = serializeTimelineEdl(timeline)

    expect(edl).toContain('TITLE: 霜河渡剪辑')
    expect(edl).toContain('FCM: NON-DROP FRAME')
    expect(edl).toContain(
      '001  ASSET_SH  V     C        00:00:00:00 00:00:08:00 00:00:00:00 00:00:08:00',
    )
    expect(edl).toContain('* FROM CLIP NAME: 河岸寻人')
    expect(edl).not.toContain('雨声音轨')
  })

  test('downloads a blob with a sanitized filename and revokes object URLs', () => {
    const click = vi.fn()
    const remove = vi.fn()
    const anchor = { href: '', download: '', click, remove }
    const createObjectURL = vi.fn(() => 'blob:timeline')
    const revokeObjectURL = vi.fn()

    downloadBlob(new Blob(['{}']), '雨夜 / 终版?.json', {
      createAnchor: () => anchor,
      createObjectURL,
      revokeObjectURL,
    })

    expect(anchor.download).toBe('雨夜-终版.json')
    expect(anchor.href).toBe('blob:timeline')
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:timeline')
  })

  test('detects unsupported recording without constructing a recorder', () => {
    expect(supportsPreviewRecording({ captureStream: undefined }, undefined)).toBe(false)
    expect(
      supportsPreviewRecording({ captureStream: () => ({}) as MediaStream }, undefined),
    ).toBe(false)
  })

  test('records canvas chunks and exposes an idempotent stop session', async () => {
    const listeners = new Map<string, (event: Event) => void>()
    const recorder: PreviewMediaRecorder = {
      state: 'inactive',
      start: vi.fn(() => {
        recorder.state = 'recording'
      }),
      stop: vi.fn(() => {
        recorder.state = 'inactive'
        listeners.get('dataavailable')?.(
          { data: new Blob(['frame']) } as unknown as Event,
        )
        listeners.get('stop')?.(new Event('stop'))
      }),
      addEventListener: vi.fn((type, listener) => {
        listeners.set(type, listener)
      }),
    }
    const factory: PreviewRecorderFactory = {
      mimeType: 'video/webm',
      create: vi.fn(() => recorder),
    }
    const captureStream = vi.fn(() => ({}) as MediaStream)
    const completed = vi.fn()

    const session = createPreviewRecording(
      { captureStream },
      factory,
      completed,
      24,
    )
    session.stop()
    session.stop()

    expect(captureStream).toHaveBeenCalledWith(24)
    expect(recorder.start).toHaveBeenCalledOnce()
    expect(recorder.stop).toHaveBeenCalledOnce()
    expect(completed).toHaveBeenCalledOnce()
    const blob = completed.mock.calls[0][0] as Blob
    expect(blob.type).toBe('video/webm')
    await expect(blob.text()).resolves.toBe('frame')
  })
})

