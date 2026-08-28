import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { SubjectDetailsContent, SubjectDeleteDialog } from './SubjectDetails'
import type { SubjectAsset } from './subject-model'

const subject: SubjectAsset = { id: 's', name: '旅人', description: '短发黑衣', tags: [], coverUrl: '/demo/character-lin-yuan.png', sampleImages: ['/demo/character-lin-yuan.png'], sourceProjectId: 'origin', createdAt: '', updatedAt: '' }
const usage = { nodeReferences: 2, characterReferences: 1, shotReferences: 3, generationCount: 4, projects: [{ projectId: 'project-1', title: '古桥', nodeReferences: 2, characterReferences: 1, shotReferences: 3, generationCount: 4 }] }
test('details show images and real usage, save description without changing the stored value before success', async () => {
  const user = userEvent.setup(), updated = vi.fn()
  const repository = { usage: vi.fn().mockResolvedValue(usage), update: vi.fn(async (_id: string, changes: Pick<SubjectAsset, 'name' | 'description' | 'tags'>) => ({ ...subject, ...changes })) }
  render(<SubjectDetailsContent subject={subject} repository={repository} onUpdated={updated} />)
  expect(await screen.findByText('生成使用次数：4')).toBeVisible()
  expect(screen.getByRole('link', { name: '古桥' })).toHaveAttribute('href', expect.stringContaining('/project/project-1'))
  expect(screen.getByAltText('旅人来源图 1')).toBeVisible()
  await user.clear(screen.getByLabelText('主体特征描述')); await user.type(screen.getByLabelText('主体特征描述'), '白色外套')
  expect(repository.update).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '保存特征描述' }))
  await waitFor(() => expect(updated).toHaveBeenCalledWith(expect.objectContaining({ description: '白色外套' })))
})
test('deletion displays character/storyboard impact and requires explicit confirmation', async () => {
  const user = userEvent.setup(), deleted = vi.fn(), cancel = vi.fn()
  const repository = { usage: vi.fn().mockResolvedValue(usage), delete: vi.fn().mockResolvedValue(true) }
  render(<SubjectDeleteDialog subject={subject} repository={repository} onCancel={cancel} onDeleted={deleted} />)
  expect(await screen.findByText(/角色引用：1.*分镜引用：3/)).toBeVisible()
  expect(repository.delete).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '确认删除主体' }))
  await waitFor(() => expect(deleted).toHaveBeenCalled())
})
test('failed usage lookup blocks destructive confirmation and shows retry', async () => {
  const user = userEvent.setup()
  const repository = { usage: vi.fn().mockRejectedValue(new Error('database failed')), delete: vi.fn() }
  render(<SubjectDeleteDialog subject={subject} repository={repository} onCancel={vi.fn()} onDeleted={vi.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('引用统计读取失败')
  expect(screen.getByRole('button', { name: '确认删除主体' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '重试引用统计' }))
  expect(repository.usage).toHaveBeenCalledTimes(2)
  expect(repository.delete).not.toHaveBeenCalled()
})
