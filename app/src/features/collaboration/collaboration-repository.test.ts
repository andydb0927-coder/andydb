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
})
