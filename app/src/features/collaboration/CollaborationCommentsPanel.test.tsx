import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { ChangeComment } from './collaboration-model'
import { CollaborationCommentsPanel } from './CollaborationCommentsPanel'

const comment: ChangeComment = {
  id: 'comment-1',
  projectId: 'project-1',
  targetType: 'node',
  targetId: 'shot-1',
  body: '调亮画面',
  authorName: '本机所有者',
  status: 'open',
  createdAt: '2026-08-13T08:00:00.000Z',
  updatedAt: '2026-08-13T08:00:00.000Z',
}

test('adds and resolves comments for the selected local target', async () => {
  const user = userEvent.setup()
  const repository = {
    listComments: vi.fn().mockResolvedValue([comment]),
    addComment: vi.fn().mockResolvedValue({ ...comment, id: 'comment-2', body: '缩短镜头' }),
    resolveComment: vi.fn().mockResolvedValue({ ...comment, status: 'resolved' }),
  }

  render(
    <CollaborationCommentsPanel
      projectId="project-1"
      targetType="node"
      targetId="shot-1"
      targetLabel="河岸寻人"
      repository={repository}
    />,
  )

  expect(await screen.findByText('1 条待处理')).toBeVisible()
  expect(screen.getByText('调亮画面')).toBeVisible()
  await user.type(screen.getByLabelText('评论内容'), '缩短镜头')
  await user.click(screen.getByRole('button', { name: '添加评论' }))
  expect(repository.addComment).toHaveBeenCalledWith('project-1', 'node', 'shot-1', '缩短镜头')
  expect(await screen.findByText('缩短镜头')).toBeVisible()
  await user.click(screen.getAllByRole('button', { name: '标记已解决' })[0])
  expect(repository.resolveComment).toHaveBeenCalledWith('comment-1')
})
