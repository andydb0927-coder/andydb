import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { PreviewPlayer } from './PreviewPlayer'
import {
  addClip,
  createTimelineProject,
  libraryTimelineCandidate,
  resolveTimelineClips,
  updateClipLayout,
  updateClipPlaybackRate,
  addSubtitleClip,
} from './timeline-project'
import { addAudioTrack, setAudioEnvelope, setClipPlacement } from './timeline-editing'

describe('preview player speed and composition', () => {
  test('simultaneous audio layers apply separate interpolated volume without stealing subtitle selection', () => {
    const project = { ...makeProjectFixture(), timeline: [] }
    const source = { id: 'a', name: 'a', kind: 'audio' as const, durationSeconds: 4, source: { type: 'library-asset' as const, url: '/a.wav', mimeType: 'audio/wav' } }
    let timeline = addClip(addClip(createTimelineProject(project), source), { ...source, id: 'b', name: 'b' })
    const audio = timeline.tracks.find(t => t.kind === 'audio')!.clips
    timeline = addAudioTrack(timeline)
    timeline = setClipPlacement(timeline, audio[1].id, timeline.tracks.at(-1)!.id, 0)
    timeline = setAudioEnvelope(timeline, audio[0].id, [{ timeSeconds: 0, value: 0 }, { timeSeconds: 2, value: 1 }])
    timeline = addSubtitleClip(timeline, '字幕', 0, 3)
    const subtitle = timeline.tracks.find(t => t.kind === 'subtitle')!.clips[0]
    const select = vi.fn()
    render(<PreviewPlayer timeline={timeline} resolved={resolveTimelineClips(timeline, project)} currentTime={1} selectedClipId={subtitle.id} canvasRef={createRef()} onSelectedClipChange={select} onCurrentTimeChange={vi.fn()} />)
    expect(screen.getByLabelText('音轨播放 a')).toHaveProperty('volume', 0.5)
    expect(screen.getByLabelText('音轨播放 b')).toHaveProperty('volume', 1)
    expect(screen.getByTestId('timeline-subtitle')).toHaveTextContent('字幕')
    expect(select).not.toHaveBeenCalled()
  })
  test('applies persisted playback rate and picture-in-picture geometry to media', () => {
    const project = { ...makeProjectFixture(), timeline: [] }
    const candidate = libraryTimelineCandidate({
      id: 'video-source',
      name: '角色走进镜头',
      kind: 'video',
      mimeType: 'video/mp4',
      url: '/demo/video.mp4',
      durationSeconds: 8,
      createdAt: '2026-08-26T10:00:00.000Z',
      source: 'upload',
    })
    let timeline = addClip(createTimelineProject(project), candidate)
    const clip = timeline.tracks.flatMap((track) => track.clips)[0]
    timeline = updateClipPlaybackRate(timeline, clip.id, 2)
    timeline = updateClipLayout(timeline, clip.id, {
      mode: 'picture-in-picture',
      x: 0.65,
      y: 0.58,
      width: 0.3,
      height: 0.32,
      slot: 'overlay',
    })

    render(
      <PreviewPlayer
        timeline={timeline}
        resolved={resolveTimelineClips(timeline, project)}
        currentTime={1}
        selectedClipId={clip.id}
        canvasRef={createRef<HTMLCanvasElement>()}
        onCurrentTimeChange={vi.fn()}
        onSelectedClipChange={vi.fn()}
      />,
    )

    const video = screen.getByTestId('preview-video')
    expect(video).toHaveAttribute('data-playback-rate', '2')
    expect(video).toHaveAttribute('data-layout-mode', 'picture-in-picture')
    expect(video).toHaveStyle({ left: '65%', top: '57.99999999999999%', width: '30%', height: '32%' })
  })
})
