import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import type { Project } from '../project/model'
import { useProjectStore } from '../project/project-store'
import { PreviewPage } from './PreviewPage'

function makePreviewProject(): Project {
  const createdAt = '2026-08-06T08:00:00.000Z'
  return {
    id: 'project-preview',
    title: '雨夜追寻',
    intent: '在暴雨中追寻失踪的同伴',
    createdAt,
    updatedAt: createdAt,
    assets: [
      {
        id: 'asset-video-1',
        kind: 'video',
        url: '/demo/video-1.mp4',
        mimeType: 'video/mp4',
        width: 1920,
        height: 1080,
        durationSeconds: 1,
      },
      {
        id: 'asset-video-2',
        kind: 'video',
        url: '/demo/video-2.mp4',
        mimeType: 'video/mp4',
        width: 1080,
        height: 1920,
        durationSeconds: 1,
      },
      {
        id: 'asset-audio',
        kind: 'audio',
        url: '/demo/rain.mp3',
        mimeType: 'audio/mpeg',
        durationSeconds: 2,
      },
    ],
    nodes: [
      {
        id: 'video-1',
        kind: 'video',
        title: '视频 01',
        position: { x: 0, y: 0 },
        versions: [
          {
            id: 'version-video-1',
            createdAt,
            prompt: '河岸远景',
            assetId: 'asset-video-1',
          },
        ],
        activeVersionId: 'version-video-1',
        sourceChanged: false,
      },
      {
        id: 'video-2',
        kind: 'video',
        title: '视频 02',
        position: { x: 300, y: 0 },
        versions: [
          {
            id: 'version-video-2',
            createdAt,
            prompt: '屋顶近景',
            assetId: 'asset-video-2',
          },
        ],
        activeVersionId: 'version-video-2',
        sourceChanged: true,
      },
      {
        id: 'audio-1',
        kind: 'preview',
        title: '雨声',
        position: { x: 0, y: 300 },
        versions: [
          {
            id: 'version-audio',
            createdAt,
            prompt: '持续雨声',
            assetId: 'asset-audio',
          },
        ],
        activeVersionId: 'version-audio',
        sourceChanged: false,
      },
    ],
    edges: [],
    timeline: [
      {
        id: 'timeline-video-1',
        nodeId: 'video-1',
        order: 0,
        durationSeconds: 1,
        track: 'video',
      },
      {
        id: 'timeline-video-2',
        nodeId: 'video-2',
        order: 1,
        durationSeconds: 1,
        track: 'video',
      },
      {
        id: 'timeline-missing',
        nodeId: 'video-missing',
        order: 2,
        durationSeconds: 2,
        track: 'video',
      },
      {
        id: 'timeline-audio',
        nodeId: 'audio-1',
        order: 3,
        durationSeconds: 2,
        track: 'audio',
      },
    ],
    jobs: [],
    exportJobs: [],
  }
}

function activate(project = makePreviewProject()) {
  useProjectStore.setState({
    projectsById: { [project.id]: project },
    activeProjectId: project.id,
    activeProject: project,
    saveStatus: 'saved',
    past: [],
    future: [],
  })
}

function renderPreview() {
  return render(
    <MemoryRouter initialEntries={['/project/project-preview/preview']}>
      <Routes>
        <Route
          path="/project/:projectId/preview"
          element={<PreviewPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => act(() => activate()))

afterEach(() => {
  act(() => {
    useProjectStore.setState({
      projectsById: {},
      activeProjectId: undefined,
      activeProject: undefined,
      saveStatus: 'saved',
      past: [],
      future: [],
    })
  })
})

describe('preview journey', () => {
  test('catches frame controls moving by anything other than exactly 1/24 second', async () => {
    const user = userEvent.setup()
    renderPreview()
    const position = screen.getByLabelText('当前播放时间')

    await user.click(screen.getByRole('button', { name: '下一帧' }))
    expect(position).toHaveAttribute('data-seconds', String(1 / 24))
    expect(screen.getByTestId('preview-video')).toHaveProperty(
      'currentTime',
      1 / 24,
    )

    await user.click(screen.getByRole('button', { name: '上一帧' }))
    expect(position).toHaveAttribute('data-seconds', '0')
  })

  test('catches loop mode allowing playback to escape the active clip', async () => {
    const user = userEvent.setup()
    renderPreview()

    await user.click(screen.getByRole('button', { name: '选择视频 02' }))
    await user.click(
      screen.getByRole('button', { name: '循环当前片段' }),
    )
    for (let frame = 0; frame < 24; frame += 1) {
      await user.click(screen.getByRole('button', { name: '下一帧' }))
    }

    expect(screen.getByLabelText('当前播放时间')).toHaveAttribute(
      'data-seconds',
      '1',
    )
    expect(screen.getByRole('button', { name: '选择视频 02' })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  test('catches comparison on the first clip or a comparison missing either adjacent shot', async () => {
    const user = userEvent.setup()
    renderPreview()
    const comparison = screen.getByRole('button', {
      name: '对比上一镜头',
    })

    expect(comparison).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '选择视频 02' }))
    expect(comparison).toBeEnabled()
    await user.click(comparison)

    const region = screen.getByRole('region', { name: '相邻镜头对比' })
    expect(within(region).getByText('视频 01')).toBeVisible()
    expect(within(region).getByText('视频 02')).toBeVisible()
    expect(within(region).getAllByTestId('preview-video')).toHaveLength(2)
  })

  test('catches missing gaps, aspect warnings, inspector omissions, and a return link that loses origin focus', async () => {
    const user = userEvent.setup()
    renderPreview()

    expect(screen.getByRole('list', { name: '视频轨道' })).toBeVisible()
    expect(screen.getByRole('row', { name: '音频轨道' })).toBeVisible()
    expect(screen.getByText('缺少片段')).toBeVisible()
    expect(screen.getByRole('link', { name: '返回画布' })).toHaveAttribute(
      'href',
      '/project/project-preview?focus=video-1',
    )
    const inspector = screen.getByRole('complementary', {
      name: '当前片段检查器',
    })
    expect(within(inspector).getByText('时长')).toBeVisible()
    expect(within(inspector).getByText('1.00 秒')).toBeVisible()
    expect(within(inspector).getByText('画幅比')).toBeVisible()
    expect(within(inspector).getByText('16:9')).toBeVisible()
    expect(within(inspector).getByText('来源节点')).toBeVisible()
    expect(within(inspector).getByText('视频 01', { selector: 'dd' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '选择视频 02' }))
    expect(screen.getByText('连续性警告：上游内容已变更')).toBeVisible()
    expect(screen.getByRole('button', { name: '统一裁切' })).toBeVisible()
    expect(screen.getByRole('button', { name: '逐镜确认' })).toBeVisible()
  })

  test('catches video reorder controls losing immutable store history', async () => {
    const user = userEvent.setup()
    const interleaved = makePreviewProject()
    interleaved.timeline = [
      { ...interleaved.timeline[0], order: 0 },
      { ...interleaved.timeline[3], order: 1 },
      { ...interleaved.timeline[1], order: 2 },
      { ...interleaved.timeline[2], order: 3 },
    ]
    act(() => activate(interleaved))
    const originalTimeline = useProjectStore.getState().activeProject!.timeline
    renderPreview()

    expect(screen.getByRole('button', { name: '将视频 01 前移' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '将视频 02 前移' }))

    expect(
      useProjectStore
        .getState()
        .activeProject!.timeline.filter((item) => item.track === 'video')
        .map((item) => item.nodeId),
    ).toEqual(['video-2', 'video-1', 'video-missing'])
    expect(
      useProjectStore.getState().activeProject!.timeline.map((item) => item.nodeId),
    ).toEqual(['video-2', 'audio-1', 'video-1', 'video-missing'])
    expect(originalTimeline.map((item) => item.nodeId)).toEqual([
      'video-1',
      'audio-1',
      'video-2',
      'video-missing',
    ])
    expect(useProjectStore.getState().past).toHaveLength(1)
  })
})
