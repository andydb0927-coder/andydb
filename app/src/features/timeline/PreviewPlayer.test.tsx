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
} from './timeline-project'

describe('preview player speed and composition', () => {
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
