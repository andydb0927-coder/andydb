import { describe, expect, test } from 'vitest'
import { createProject, type CanvasNode } from '../project/model'
import { createPipelineRun, pipelineSummary, recoverPipelineRun, pipelinePlan } from './pipeline-model'
import { createPipelineTemplate, instantiatePipelineTemplate } from './pipeline-template'

export function pipelineFixture() {
  const project = createProject('管线测试', '')
  project.nodes = ['text', 'image', 'image', 'image'].map((kind, index): CanvasNode => ({ id: `n${index}`, kind: kind as 'text' | 'image', title: `节点${index}`, position: { x: index * 400, y: 20 }, versions: [{ id: `v${index}`, createdAt: project.createdAt, prompt: `提示词${index}` }], activeVersionId: `v${index}`, sourceChanged: false }))
  project.edges = [{ id: 'e1', sourceNodeId: 'n0', targetNodeId: 'n1' }, { id: 'e2', sourceNodeId: 'n1', targetNodeId: 'n2' }]
  return project
}

describe('pipeline graph, recovery and templates', () => {
  test('only includes descendants in dependency order, not unrelated nodes', () => {
    const project = pipelineFixture()
    expect(pipelinePlan(project, 'n0')).toEqual(['n0', 'n1', 'n2'])
    expect(pipelinePlan(project, 'n1')).toEqual(['n1', 'n2'])
  })
  test('rejects absent starts, unsupported starts, cycles and dangling edges', () => {
    const project = pipelineFixture()
    expect(() => pipelinePlan(project, 'missing')).toThrow('起点')
    project.nodes[0].kind = 'video'
    expect(() => pipelinePlan(project, 'n0')).toThrow('起点')
    project.nodes[0].kind = 'text'
    project.edges.push({ id: 'loop', sourceNodeId: 'n2', targetNodeId: 'n0' })
    expect(() => pipelinePlan(project, 'n0')).toThrow('循环')
    project.edges.pop()
    project.edges.push({ id: 'bad', sourceNodeId: 'gone', targetNodeId: 'n0' })
    expect(() => pipelinePlan(project, 'n0')).toThrow('不存在')
  })
  test('refresh recovers completed jobs, pauses unfinished tasks, never automatically runs', () => {
    const run = createPipelineRun(pipelineFixture(), 'n0')
    run.status = 'running'; run.steps[0].status = 'running'; run.steps[0].jobId = 'job'
    const restored = recoverPipelineRun(run, [{ id: 'job', nodeId: 'n0', status: 'succeeded', prompt: '', createdAt: run.createdAt, updatedAt: run.createdAt }])
    expect(restored.steps[0].status).toBe('succeeded')
    expect(restored.pausedReason).toBe('interrupted')
    expect(pipelineSummary(restored)).toMatchObject({ succeeded: 1, total: 3 })
    expect(run.steps[0].status).toBe('running')
    // Disposal can change the in-flight step to queued after the project already committed its job.
    run.steps[0].status = 'queued'
    expect(recoverPipelineRun(run, [{ id: 'job', nodeId: 'n0', status: 'succeeded', prompt: '', createdAt: run.createdAt, updatedAt: run.createdAt }]).steps[0].status).toBe('succeeded')
  })
  test('templates remove all generated media, remap topology and keep input parameters', () => {
    const project = pipelineFixture()
    project.nodes[1].imageResults = [{ id: 'result', assetId: 'output' }]
    project.nodes[1].versions[0].assetId = 'output'
    project.nodes[1].versions[0].textContent = '模型生成的结果'
    project.nodes[1].appliedStyle = { id: 'style', name: '水墨', promptFragment: '水墨笔触', compatibility: { targetKinds: ['image'] } }
    project.nodes[1].generationConfig = { targetKind: 'image', providerId: 'seedream-5-pro-api', parameters: { count: 2, aspectRatio: '16:9' }, referenceAssets: [{ url: 'https://private.invalid/result.png', kind: 'image', mimeType: 'image/png' }] }
    const template = createPipelineTemplate(project, 'n0', '我的模板')
    const json = JSON.stringify(template)
    for (const text of ['private.invalid', 'imageResults', 'textContent', 'output']) expect(json).not.toContain(text)
    const created = instantiatePipelineTemplate(template, { x: 100, y: 200 })
    expect(created.nodes).toHaveLength(3)
    expect(created.edges).toHaveLength(2)
    expect(created.assets).toEqual([])
    expect(created.nodes[0].position).toEqual({ x: 100, y: 200 })
    expect(created.nodes[1].generationConfig?.parameters).toMatchObject({ count: 2 })
    expect(created.nodes[1].appliedStyle).toEqual(project.nodes[1].appliedStyle)
    const ids = new Set(created.nodes.map(node => node.id))
    expect(ids.has('n0')).toBe(false)
    expect(created.edges.every(edge => ids.has(edge.sourceNodeId) && ids.has(edge.targetNodeId))).toBe(true)
    expect(instantiatePipelineTemplate(template).nodes[0].id).not.toBe(created.nodes[0].id)
  })
})
