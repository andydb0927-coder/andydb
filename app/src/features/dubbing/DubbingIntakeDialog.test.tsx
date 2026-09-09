import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { DubbingIntakeDialog } from './DubbingIntakeDialog'
import { DubbingWorkbenchDatabase, DubbingWorkbenchRepository } from './dubbing-workbench-repository'

const databases: DubbingWorkbenchDatabase[] = []
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.delete())) })
function setup() {
  const project = makeProjectFixture(), db = new DubbingWorkbenchDatabase(`dubbing-intake-${crypto.randomUUID()}`)
  databases.push(db)
  const repository = new DubbingWorkbenchRepository(db), close = vi.fn()
  render(<MemoryRouter><DubbingIntakeDialog project={project} selection={{ type: 'node', id: 'shot-1' }} repository={repository} onClose={close} /></MemoryRouter>)
  return { project, repository, close, user: userEvent.setup() }
}
test('送审表单保存双语资料与人工时间码，提供可打开的工作台链接', async () => {
  const { project, repository, user } = setup()
  await waitFor(() => expect(screen.getByRole('button', { name: '确认送审' })).toBeEnabled())
  await user.type(screen.getByLabelText('原片终点（毫秒）'), '2000')
  await user.type(screen.getByLabelText('原片资产引用'), 'original-episode-1')
  await user.type(screen.getByLabelText('台词原文'), '你好')
  await user.type(screen.getByLabelText('本地化台词'), 'Hello')
  await user.click(screen.getByRole('button', { name: '确认送审' }))
  const link = await screen.findByRole('link', { name: '打开工作台' })
  const state = await repository.load(project.id)
  expect(link).toHaveAttribute('href', `/dubbing?projectId=${project.id}&shotId=${state.shots[0].record.id}`)
  expect(state.shots[0].record.content.localizedDialogue).toBe('Hello')
  expect(state.shots[0].record.sourceTimecode.endMs).toBe(2000)
})
test('取消不创建镜头；保存失败留在弹层并显示中文可重试错误', async () => {
  const { repository, project, user, close } = setup()
  await waitFor(() => expect(screen.getByRole('button', { name: '确认送审' })).toBeEnabled())
  vi.spyOn(repository, 'intake').mockRejectedValue(new Error('private-storage-error'))
  await user.type(screen.getByLabelText('原片资产引用'), 'original-episode-1')
  await user.type(screen.getByLabelText('原片终点（毫秒）'), '2000')
  await user.click(screen.getByRole('button', { name: '确认送审' }))
  expect(await screen.findByRole('alert')).not.toHaveTextContent('private-storage-error')
  expect(screen.getByRole('button', { name: '确认送审' })).toBeEnabled()
  await user.keyboard('{Escape}')
  expect(close).toHaveBeenCalledOnce()
  expect((await repository.load(project.id)).shots).toEqual([])
})
