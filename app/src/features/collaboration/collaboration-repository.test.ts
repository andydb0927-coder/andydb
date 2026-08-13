import Dexie from 'dexie'
import { afterEach, describe, expect, test } from 'vitest'

import { WirelessCanvasDatabase } from '../project/project-repository'
import { CollaborationRepository } from './collaboration-repository'

const names: string[] = []

function createRepository() {
  const name = `collaboration-${crypto.randomUUID()}`
  names.push(name)
  let sequence = 0
  return new CollaborationRepository(
    new WirelessCanvasDatabase(name),
    {
      now: () => '2026-08-13T08:00:00.000Z',
      randomId: () => `id-${++sequence}`,
    },
  )
}

function createVersionedRepository() {
  const name = `collaboration-versioned-${crypto.randomUUID()}`
  names.push(name)
  let sequence = 0
  const timestamps = [
    '2026-08-13T08:00:00.000Z',
    '2026-08-13T08:00:00.000Z',
    '2026-08-13T08:02:00.000Z',
  ]
  return new CollaborationRepository(
    new WirelessCanvasDatabase(name),
    {
      now: () => timestamps[Math.min(sequence++, timestamps.length - 1)],
      randomId: () => `versioned-${sequence}`,
    },
  )
}

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)))
})

describe('collaboration repository', () => {
  test('seeds one owner and manages editor/viewer roles without removing the owner', async () => {
    const repository = createRepository()
    const owner = await repository.ensureOwner('project-1')
    await repository.ensureOwner('project-1')
    const editor = await repository.addCollaborator('project-1', '小林', 'editor')

    expect(await repository.listCollaborators('project-1')).toHaveLength(2)
    expect((await repository.updateRole(editor.id, 'viewer')).role).toBe('viewer')
    await expect(repository.removeCollaborator(owner.id)).rejects.toThrow('不能移除所有者')
    await repository.removeCollaborator(editor.id)
    expect(await repository.listCollaborators('project-1')).toEqual([owner])
  })

  test('persists node and clip comments and resolves them without deleting history', async () => {
    const repository = createRepository()
    const node = await repository.addComment('project-1', 'node', 'shot-1', '调亮画面')
    await repository.addComment('project-1', 'clip', 'clip-1', '缩短片尾')

    expect(await repository.listComments('project-1', 'node', 'shot-1')).toEqual([node])
    expect((await repository.resolveComment(node.id)).status).toBe('resolved')
    expect(await repository.listComments('project-1')).toHaveLength(2)
  })

  test('edits and deletes comments with optimistic concurrency protection', async () => {
    const repository = createVersionedRepository()
    const comment = await repository.addComment('project-1', 'node', 'shot-1', '调亮画面')
    const updated = await repository.updateComment(comment.id, '增加雨雾', comment.updatedAt)

    expect(updated.body).toBe('增加雨雾')
    expect(updated.updatedAt).not.toBe(comment.updatedAt)
    await expect(
      repository.updateComment(comment.id, '过期覆盖', comment.updatedAt),
    ).rejects.toThrow('评论已被其他操作更新，请刷新后重试')
    await expect(
      repository.deleteComment(comment.id, comment.updatedAt),
    ).rejects.toThrow('评论已被其他操作更新，请刷新后重试')

    await repository.deleteComment(comment.id, updated.updatedAt)
    expect(await repository.listComments('project-1')).toEqual([])
  })
})
