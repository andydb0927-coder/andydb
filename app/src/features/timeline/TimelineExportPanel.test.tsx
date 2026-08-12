import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject } from './timeline-project'
import { TimelineExportPanel } from './TimelineExportPanel'

describe('timeline export panel', () => {
  test('downloads JSON and EDL through the client-only boundary', async () => {
    const user = userEvent.setup()
    const onDownload = vi.fn()
    render(
      <TimelineExportPanel
        timeline={createTimelineProject(makeProjectFixture())}
        recordingSupported={false}
        onDownload={onDownload}
      />,
    )

    await user.click(screen.getByRole('button', { name: '下载时间线 JSON' }))
    await user.click(screen.getByRole('button', { name: '下载 EDL' }))

    expect(onDownload).toHaveBeenCalledTimes(2)
    expect(onDownload.mock.calls[0][1]).toBe('霜河渡剪辑.json')
    expect(onDownload.mock.calls[1][1]).toBe('霜河渡剪辑.edl')
    expect(screen.getByText('未调用云端合成或消耗积分。')).toBeVisible()
  })

  test('explains unsupported recording and toggles a supported recording session', async () => {
    const user = userEvent.setup()
    const onStartRecording = vi.fn()
    const { rerender } = render(
      <TimelineExportPanel
        timeline={createTimelineProject(makeProjectFixture())}
        recordingSupported={false}
        onStartRecording={onStartRecording}
      />,
    )

    expect(screen.getByText(/当前浏览器不支持预览流录制/)).toBeVisible()
    expect(screen.queryByRole('button', { name: '开始录制预览' })).not.toBeInTheDocument()

    const stop = vi.fn()
    onStartRecording.mockReturnValue({ stop })
    rerender(
      <TimelineExportPanel
        timeline={createTimelineProject(makeProjectFixture())}
        recordingSupported
        onStartRecording={onStartRecording}
      />,
    )
    await user.click(screen.getByRole('button', { name: '开始录制预览' }))
    expect(screen.getByRole('button', { name: '停止录制预览' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '停止录制预览' }))

    expect(stop).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('预览录制已完成')
  })

  test('does not submit or navigate when export controls are used', () => {
    const onDownload = vi.fn()
    render(
      <form onSubmit={vi.fn()}>
        <TimelineExportPanel
          timeline={createTimelineProject(makeProjectFixture())}
          recordingSupported={false}
          onDownload={onDownload}
        />
      </form>,
    )

    fireEvent.click(screen.getByRole('button', { name: '下载时间线 JSON' }))
    expect(onDownload).toHaveBeenCalledOnce()
  })
})

