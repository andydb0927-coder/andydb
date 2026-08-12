import { expect, test } from 'vitest'

import type { Project } from '../project/model'
import { appendSkillResultNode } from './skill-result-node'

const project: Project = {
  id: 'project-1', title: '项目', intent: '意图',
  createdAt: '2026-08-13T08:00:00.000Z', updatedAt: '2026-08-13T08:00:00.000Z',
  assets: [], edges: [], timeline: [], jobs: [], exportJobs: [],
  nodes: [{
    id: 'existing', kind: 'text', title: '已有', position: { x: 120, y: 240 },
    versions: [{ id: 'existing-v', createdAt: '2026-08-13T08:00:00.000Z', prompt: '已有内容' }],
    activeVersionId: 'existing-v', sourceChanged: false,
  }],
}

test('appends a non-destructive text node to the right of existing canvas content', () => {
  const next = appendSkillResultNode(
    project,
    { title: '素材报告', summary: '摘要', content: '正文', format: 'markdown' },
    { now: () => '2026-08-13T10:00:00.000Z', randomId: () => 'skill-result' },
  )

  expect(project.nodes).toHaveLength(1)
  expect(next.nodes).toHaveLength(2)
  expect(next.nodes[1]).toEqual({
    id: 'skill-result',
    kind: 'text',
    title: '素材报告',
    position: { x: 460, y: 240 },
    versions: [{
      id: 'skill-result:version',
      createdAt: '2026-08-13T10:00:00.000Z',
      prompt: '摘要\n\n正文',
    }],
    activeVersionId: 'skill-result:version',
    sourceChanged: false,
  })
  expect(next.updatedAt).toBe('2026-08-13T10:00:00.000Z')
})
