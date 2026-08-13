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
    updateComment: vi.fn().mockResolvedValue({ ...comment, body: '增加雨雾', updatedAt: '2026-08-13T08:01:00.000Z' }),
    deleteComment: vi.fn().mockResolvedValue(undefined),
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

test('edits and confirms deletion with the visible comment version', async () => {
  const user = userEvent.setup()
  const updated = { ...comment, body: '增加雨雾', updatedAt: '2026-08-13T08:01:00.000Z' }
  const repository = {
    listComments: vi.fn().mockResolvedValue([comment]),
    addComment: vi.fn(),
    resolveComment: vi.fn(),
    updateComment: vi.fn().mockResolvedValue(updated),
    deleteComment: vi.fn().mockResolvedValue(undefined),
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

  await screen.findByText('调亮画面')
  await user.click(screen.getByRole('button', { name: '编辑评论' }))
  const editor = screen.getByRole('textbox', { name: '编辑评论内容' })
  await user.clear(editor)
  await user.type(editor, '增加雨雾')
  await user.click(screen.getByRole('button', { name: '保存修改' }))
  expect(repository.updateComment).toHaveBeenCalledWith(
    comment.id,
    '增加雨雾',
    comment.updatedAt,
  )
  expect(await screen.findByText('增加雨雾')).toBeVisible()

  await user.click(screen.getByRole('button', { name: '删除评论' }))
  expect(screen.getByText('删除后无法恢复。')).toBeVisible()
  await user.click(screen.getByRole('button', { name: '确认删除评论' }))
  expect(repository.deleteComment).toHaveBeenCalledWith(
    comment.id,
    updated.updatedAt,
  )
  expect(screen.queryByText('增加雨雾')).not.toBeInTheDocument()
})
