import { describe, expect, test } from 'vitest'

import {
  buildChangeComment,
  buildCollaborator,
  createLocalOwner,
} from './collaboration-model'

const environment = {
  now: () => '2026-08-13T08:00:00.000Z',
  randomId: () => 'local-id',
}

describe('collaboration model', () => {
  test('creates the fixed local owner and trims simulated collaborator names', () => {
    expect(createLocalOwner('project-1', environment)).toMatchObject({
      id: 'project-1:local-owner',
      name: '本机所有者',
      role: 'owner',
    })
    expect(buildCollaborator('project-1', '  小林  ', 'editor', environment)).toMatchObject({
      name: '小林',
      role: 'editor',
    })
    expect(() => buildCollaborator('project-1', ' ', 'viewer', environment)).toThrow(
      '请输入协作者名称',
    )
  })

  test('builds comments for node or clip targets and rejects empty text', () => {
    expect(buildChangeComment('project-1', 'node', 'shot-1', '  调亮一点  ', environment))
      .toMatchObject({ targetType: 'node', targetId: 'shot-1', body: '调亮一点', status: 'open' })
    expect(() => buildChangeComment('project-1', 'clip', 'clip-1', ' ', environment))
      .toThrow('请输入评论内容')
  })
})
