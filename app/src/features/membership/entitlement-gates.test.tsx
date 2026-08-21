import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject } from '../timeline/timeline-project'
import { TimelineExportPanel } from '../timeline/TimelineExportPanel'

test('keeps JSON free while creator-only export actions show an upgrade guide', async () => {
  const user = userEvent.setup()
  const onDownload = vi.fn()
  render(<MemoryRouter>
    <TimelineExportPanel
      timeline={createTimelineProject(makeProjectFixture())}
      recordingSupported
      membershipPlan="free"
      onDownload={onDownload}
      onStartRecording={vi.fn()}
    />
  </MemoryRouter>,
  )

  await user.click(screen.getByRole('button', { name: '下载时间线 JSON' }))
  expect(onDownload).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: '下载 EDL' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: '开始录制预览' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '升级到创作者版' })).toHaveAttribute('href', '/#membership')
})
