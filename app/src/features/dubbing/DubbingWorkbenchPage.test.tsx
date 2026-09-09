import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { DubbingWorkbenchPage } from './DubbingWorkbenchPage'
import { DubbingWorkbenchDatabase, DubbingWorkbenchRepository } from './dubbing-workbench-repository'
import { resolveDubbingSource } from './dubbing-canvas-adapter'

const databases: DubbingWorkbenchDatabase[] = []
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.delete())) })
async function setup() {
  const project = makeProjectFixture(), db = new DubbingWorkbenchDatabase(`dubbing-page-${crypto.randomUUID()}`)
  databases.push(db)
  const repository = new DubbingWorkbenchRepository(db)
  await repository.intake(resolveDubbingSource(project, { type: 'node', id: 'shot-1' }), { sourceAssetId: 'original-episode-1', episodeNumber: 1, shotNumber: 1, startMs: 0, endMs: 2000, originalDialogue: '你好', localizedDialogue: 'Hello', framing: '中景', camera: '固定' })
  render(<MemoryRouter initialEntries={[`/dubbing?projectId=${project.id}`]}><DubbingWorkbenchPage repository={repository} projectRepository={{ listAll: async () => [project] }} /></MemoryRouter>)
  return { user: userEvent.setup(), repository, project }
}
test('三栏显示镜头资料，按钮由状态驱动，自审与返修意见实际保存', async () => {
  const { user, repository, project } = await setup()
  await screen.findByRole('button', { name: '查看 EP001 镜头 1' })
  expect(screen.getByRole('region', { name: '镜头详情与审核' })).toHaveTextContent('Hello')
  expect(screen.queryByRole('button', { name: '标记自审通过' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '提交生成' }))
  const approve = await screen.findByRole('button', { name: '标记自审通过' })
  expect(approve).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '请求返修' }))
  const dialog = screen.getByRole('dialog', { name: '请求返修' })
  await user.type(within(dialog).getByRole('textbox', { name: '返修意见' }), '修正字幕')
  await user.click(within(dialog).getByRole('checkbox', { name: /DB-QA-SUBTITLE-01/ }))
  await user.click(within(dialog).getByRole('button', { name: '保存返修意见' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '请求返修' })).not.toBeInTheDocument())
  await within(screen.getByRole('region', { name: '镜头详情与审核' })).findByText('修正字幕')
  expect((await repository.load(project.id)).shots[0].record.revisionCount).toBe(1)
  expect(await screen.findByRole('button', { name: '提交生成' })).toBeDisabled()
})
test('Esc 关闭本地化编辑面板并归还焦点，不保存未提交草稿', async () => {
  const { user, repository, project } = await setup()
  const trigger = await screen.findByRole('button', { name: '编辑本地化方案' })
  await user.click(trigger)
  expect(screen.getByRole('dialog', { name: '编辑本地化方案' })).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  expect((await repository.load(project.id)).plan).toBeNull()
})
test('无项目与读取失败展示中文状态，不伪造示例镜头', async () => {
  const listAll = vi.fn().mockRejectedValue(new Error('fixture-private-error'))
  render(<MemoryRouter><DubbingWorkbenchPage projectRepository={{ listAll }} /></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('无法读取项目')
  expect(screen.queryByText('fixture-private-error')).not.toBeInTheDocument()
  listAll.mockResolvedValue([])
  await userEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByText('还没有项目，请先创建画布项目。')).toBeVisible()
})
test('QA 点击立即可见，保存失败恢复勾选并显示原因', async () => {
  const { user, repository } = await setup()
  await user.click(await screen.findByRole('button', { name: '提交生成' }))
  let rejectSave: (reason: Error) => void = () => { throw new Error('保存尚未开始') }
  vi.spyOn(repository, 'checkQa').mockImplementation(() => new Promise((_resolve, reject) => { rejectSave = reject }))
  const checkbox = within(screen.getByRole('complementary', { name: '本地化方案与QA清单' })).getByRole('checkbox', { name: /DB-QA-ASSET-01/ })
  await waitFor(() => expect(checkbox).toBeEnabled())
  await user.click(checkbox)
  expect(checkbox).toBeChecked()
  expect(checkbox).toBeDisabled()
  await act(async () => rejectSave(new Error('工作台已在另一处更新，请刷新后重试。')))
  await waitFor(() => expect(checkbox).not.toBeChecked())
  expect(screen.getByRole('alert')).toHaveTextContent('另一处更新')
})
