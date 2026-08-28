import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'

import type { LibraryAssetRecord } from '../assets/library-model'
import { makeProjectFixture } from '../../test/fixtures'
import { TimelineEditor } from './TimelineEditor'
import {
  addClip,
  createTimelineProject,
  libraryTimelineCandidate,
  type TimelineProject,
  type TimelineSourceCandidate,
} from './timeline-project'

function record(
  id: string,
  kind: LibraryAssetRecord['kind'],
  durationSeconds = 5,
): LibraryAssetRecord {
  return {
    id,
    name: `${id}素材`,
    kind,
    mimeType: `${kind}/${kind === 'image' ? 'png' : 'mp4'}`,
    url: `/${id}`,
    durationSeconds,
    createdAt: '2026-08-13T10:00:00.000Z',
    source: 'upload',
  }
}

function Harness({
  initial,
  candidates,
  onTimelineChange = vi.fn(),
}: {
  initial: TimelineProject
  candidates: TimelineSourceCandidate[]
  onTimelineChange?: (timeline: TimelineProject) => void
}) {
  const [timeline, setTimeline] = useState(initial)
  const [currentTime, setCurrentTime] = useState(0)
  const [selectedClipId, setSelectedClipId] = useState<string>()
  return (
    <TimelineEditor
      projectId={initial.projectId}
      timeline={timeline}
      candidates={candidates}
      currentTime={currentTime}
      selectedClipId={selectedClipId}
      onTimelineChange={(next) => {
        setTimeline(next)
        onTimelineChange(next)
      }}
      onCurrentTimeChange={setCurrentTime}
      onSelectedClipChange={setSelectedClipId}
    />
  )
}

describe('professional timeline editor', () => {
  test('edits transitions, subtitle style and multi-track envelope through accessible controls', async () => {
    const user = userEvent.setup()
    let initial = createTimelineProject({ ...makeProjectFixture(), timeline: [] })
    initial = addClip(addClip(initial, libraryTimelineCandidate(record('one', 'image', 4))), libraryTimelineCandidate(record('two', 'image', 4)))
    const onTimelineChange = vi.fn()
    render(<Harness initial={initial} candidates={[libraryTimelineCandidate(record('music', 'audio', 4))]} onTimelineChange={onTimelineChange} />)
    await user.click(screen.getByRole('button', { name: '选择图片 02' }))
    await user.selectOptions(screen.getByLabelText('入场转场'), 'dissolve')
    fireEvent.change(screen.getByLabelText('转场时长（秒）'), { target: { value: '1.5' } })
    await user.type(screen.getByLabelText('字幕文本'), '字幕验收')
    await user.click(screen.getByRole('button', { name: '在播放头添加字幕' }))
    fireEvent.change(screen.getByLabelText('字幕颜色'), { target: { value: '#ffcc00' } })
    await user.selectOptions(screen.getByLabelText('字幕位置'), 'top')
    await user.click(screen.getByRole('button', { name: '新增音频轨道' }))
    await user.click(screen.getByRole('button', { name: '将music素材加入音频轨道' }))
    const trackOption = screen.getByRole('option', { name: '音频轨道 2' }) as HTMLOptionElement
    await user.selectOptions(screen.getByLabelText('所在音频轨'), trackOption.value)
    fireEvent.change(screen.getByLabelText('关键帧时间（秒）'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('关键帧音量'), { target: { value: '0.4' } })
    await user.click(screen.getByRole('button', { name: '添加音量关键帧' }))
    const latest: TimelineProject = onTimelineChange.mock.calls.at(-1)![0]
    expect(latest.tracks.find(t => t.kind === 'image')!.clips[1].transitionIn).toEqual({ kind: 'dissolve', durationSeconds: 1.5 })
    expect(latest.tracks.find(t => t.kind === 'subtitle')!.clips[0].subtitleStyle).toMatchObject({ position: 'top', color: '#ffcc00' })
    expect(latest.tracks.find(t => t.id === trackOption.value)!.clips[0].volumeKeyframes).toEqual([{ timeSeconds: 2, value: 0.4 }])
  })
  test('renders four tracks and adds draggable sources by drop or keyboard-equivalent button', async () => {
    const user = userEvent.setup()
    const initial = createTimelineProject({ ...makeProjectFixture(), timeline: [] })
    const image = libraryTimelineCandidate(record('海报', 'image'))
    const audio = libraryTimelineCandidate(record('雨声', 'audio', 12))
    render(<Harness initial={initial} candidates={[image, audio]} />)

    expect(screen.getByRole('row', { name: '视频轨道' })).toBeVisible()
    expect(screen.getByRole('row', { name: '音频轨道' })).toBeVisible()
    expect(screen.getByRole('row', { name: '图片轨道' })).toBeVisible()
    expect(screen.getByRole('row', { name: '字幕轨道' })).toBeVisible()
    expect(screen.getByRole('article', { name: '海报素材' })).toHaveAttribute(
      'draggable',
      'true',
    )

    const data = new Map<string, string>()
    fireEvent.dragStart(screen.getByRole('article', { name: '海报素材' }), {
      dataTransfer: { setData: (type: string, value: string) => data.set(type, value) },
    })
    fireEvent.drop(screen.getByLabelText('图片轨道投放区'), {
      dataTransfer: { getData: (type: string) => data.get(type) ?? '' },
    })
    expect(screen.getByRole('button', { name: '选择图片 01' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '将雨声素材加入音频轨道' }))
    expect(screen.getByRole('button', { name: '选择音频 01' })).toBeVisible()
  })

  test('reorders, trims, splits at the playhead, and deletes selected clips', async () => {
    const user = userEvent.setup()
    const empty = createTimelineProject({ ...makeProjectFixture(), timeline: [] })
    const one = libraryTimelineCandidate(record('one', 'video', 6))
    const two = libraryTimelineCandidate(record('two', 'video', 4))
    const initial = addClip(addClip(empty, one), two)
    render(<Harness initial={initial} candidates={[]} />)

    await user.click(screen.getByRole('button', { name: '将视频 02 前移' }))
    const videoTrack = screen.getByRole('list', { name: '主视频轨' })
    expect(within(videoTrack).getAllByRole('button', { name: /选择视频/ })[0]).toHaveTextContent('two素材')

    await user.click(screen.getByRole('button', { name: '选择视频 01' }))
    fireEvent.change(screen.getByLabelText('片段入点'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('片段出点'), { target: { value: '3' } })
    expect(screen.getByLabelText('片段时长')).toHaveTextContent('2.00 秒')

    fireEvent.change(screen.getByLabelText('时间线播放头'), { target: { value: '1.5' } })
    await user.click(screen.getByRole('button', { name: '在播放头处分割' }))
    expect(within(videoTrack).getAllByRole('button', { name: /选择视频/ })).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: '删除当前片段' }))
    expect(within(videoTrack).getAllByRole('button', { name: /选择视频/ })).toHaveLength(2)
  })

  test('adds subtitles at the playhead and seeks from the ruler', async () => {
    const user = userEvent.setup()
    const initial = createTimelineProject(makeProjectFixture())
    render(<Harness initial={initial} candidates={[]} />)

    fireEvent.change(screen.getByLabelText('时间线播放头'), { target: { value: '2' } })
    await user.type(screen.getByLabelText('字幕文本'), '他还没有回来')
    await user.click(screen.getByRole('button', { name: '在播放头添加字幕' }))

    expect(screen.getByRole('button', { name: '选择字幕 01' })).toHaveTextContent(
      '他还没有回来',
    )
    expect(screen.getByLabelText('当前剪辑时间')).toHaveTextContent('2.000 秒')
  })

  test('selecting a canvas clip seeks it and exposes a focused return link', async () => {
    const user = userEvent.setup()
    const initial = createTimelineProject(makeProjectFixture())
    render(<Harness initial={initial} candidates={[]} />)

    await user.click(screen.getByRole('button', { name: '选择图片 01' }))

    expect(screen.getByLabelText('时间线播放头')).toHaveValue('0')
    expect(screen.getByRole('link', { name: '返回来源节点' })).toHaveAttribute(
      'href',
      '/project/project-frost-river?focus=shot-1',
    )
  })

  test('persists playback speed and picture-in-picture geometry from the inspector', async () => {
    const user = userEvent.setup()
    const empty = createTimelineProject({ ...makeProjectFixture(), timeline: [] })
    const initial = addClip(empty, libraryTimelineCandidate(record('slow-motion', 'video', 8)))
    const onTimelineChange = vi.fn()
    render(<Harness initial={initial} candidates={[]} onTimelineChange={onTimelineChange} />)

    await user.click(screen.getByRole('button', { name: '选择视频 01' }))
    fireEvent.change(screen.getByLabelText('片段变速'), { target: { value: '2' } })
    expect(screen.getByLabelText('变速后时长')).toHaveTextContent('4.00 秒')

    await user.selectOptions(screen.getByLabelText('布局模式'), 'picture-in-picture')
    fireEvent.change(screen.getByLabelText('画中画水平位置'), { target: { value: '0.12' } })

    const latest = onTimelineChange.mock.calls.at(-1)?.[0] as TimelineProject
    const clip = latest.tracks.flatMap((track) => track.clips).find(({ id }) => id === initial.tracks[0].clips[0]?.id)
    expect(clip?.playbackRate).toBe(2)
    expect(clip?.layout).toMatchObject({
      mode: 'picture-in-picture',
      x: 0.12,
      slot: 'overlay',
    })
  })
})
