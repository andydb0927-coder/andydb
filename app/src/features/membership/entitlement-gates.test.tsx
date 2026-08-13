import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject } from '../timeline/timeline-project'
import { TimelineExportPanel } from '../timeline/TimelineExportPanel'
import { WorkflowRunPanel } from '../workflow/WorkflowRunPanel'

test('guides free members to upgrade instead of starting batch workflows', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  render(<MemoryRouter>
    <WorkflowRunPanel
      selectedCount={2}
      runs={[]}
      membershipPlan="free"
      onCreate={onCreate}
      onCancel={vi.fn()}
      onRetryNode={vi.fn()}
    />
  </MemoryRouter>,
  )

  expect(screen.getByRole('button', { name: '创建运行' })).toBeDisabled()
  expect(screen.getByRole('link', { name: '升级到专业版' })).toHaveAttribute('href', '/#membership')
  await user.click(screen.getByRole('button', { name: '创建运行' }))
  expect(onCreate).not.toHaveBeenCalled()
})

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
