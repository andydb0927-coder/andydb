import { expect, test } from 'vitest'
import { createProject } from '../project/model'
import { WirelessCanvasDatabase } from '../project/project-repository'
import { PipelineRepository } from './pipeline-repository'
import type { PipelineRun } from './pipeline-model'

test('runs and templates persist idempotently, scope by project/canvas and keep user projects', async () => {
  const db = new WirelessCanvasDatabase(`pipeline-test-${crypto.randomUUID()}`)
  try {
    const repository = new PipelineRepository(db), project = createProject('不删除原项目', '')
    await db.projects.put(project)
    const run: PipelineRun = { id: 'r', projectId: project.id, canvasId: 'c1', title: '管线', startNodeId: 'n', createdAt: project.createdAt, updatedAt: project.updatedAt, status: 'running', policy: { mode: 'stop', retries: 0 }, steps: [], edges: [] }
    await repository.save(run); await repository.save(run)
    expect(await repository.list(project.id, 'c1')).toEqual([run])
    expect(await repository.list(project.id, 'c2')).toEqual([])
    expect(await repository.list('other', 'c1')).toEqual([])
    const template = { id: 't', name: '模板', createdAt: project.createdAt, updatedAt: project.updatedAt, nodes: [], edges: [] }
    await repository.saveTemplate(template); await repository.saveTemplate({ ...template, name: '重命名' })
    expect((await repository.templates()).map(item => item.name)).toEqual(['重命名'])
    await repository.deleteTemplate('t'); expect(await repository.templates()).toEqual([])
    expect(await db.projects.get(project.id)).toEqual(project)
  } finally { await db.delete() }
})
