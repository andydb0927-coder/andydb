import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject } from '../timeline/timeline-project'
import { createPublishedWork } from './community-model'
import { WorkShareActions } from './WorkShareActions'
import { exportWorkPoster } from './work-sharing-export'
import { copyPublishedWorkShareLink } from './publication'
import { downloadBlob } from '../../shared/browser-download'

vi.mock('./work-sharing-export', async (load) => ({ ...await load<typeof import('./work-sharing-export')>(), exportWorkPoster: vi.fn() }))
vi.mock('./publication', () => ({ copyPublishedWorkShareLink: vi.fn() }))
vi.mock('../../shared/browser-download', async (load) => ({ ...await load<typeof import('../../shared/browser-download')>(), downloadBlob: vi.fn() }))
afterEach(() => vi.clearAllMocks())
const makeWork = () => {
  const project = makeProjectFixture()
  return createPublishedWork(project, createTimelineProject(project), { author: '小安', tags: [] })
}

test('exports an importable single-file JSON package via the download boundary', async () => {
  const user = userEvent.setup()
  render(<WorkShareActions work={makeWork()} />)
  await user.click(screen.getByRole('button', { name: '导出项目包 JSON' }))
  const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0]
  expect(filename).toMatch(/-项目包-.*\.json$/)
  const data = JSON.parse(await blob.text())
  expect(data.format).toBe('wireless-canvas-workflow')
  expect(data.assetIds).toHaveLength(2)
  expect(data.project.nodes).toHaveLength(2)
})

test('copy failure is visible and never claims success', async () => {
  vi.mocked(copyPublishedWorkShareLink).mockRejectedValue(new Error('denied'))
  const user = userEvent.setup()
  render(<WorkShareActions work={makeWork()} />)
  await user.click(screen.getByRole('button', { name: '复制分享链接' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('分享链接复制失败')
  expect(screen.queryByText(/分享链接已复制/)).not.toBeInTheDocument()
})

test('prevents duplicate PNG export and does not trigger a late download after leaving the page', async () => {
  let finish!: (blob: Blob) => void
  vi.mocked(exportWorkPoster).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const user = userEvent.setup()
  const view = render(<WorkShareActions work={makeWork()} />)
  await user.dblClick(screen.getByRole('button', { name: '导出 PNG 长图' }))
  expect(exportWorkPoster).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '导出项目包 JSON' })).toBeDisabled()
  view.unmount()
  await act(async () => finish(new Blob(['png'])))
  expect(downloadBlob).not.toHaveBeenCalled()
})
