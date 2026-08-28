import { afterEach, expect, test, vi } from 'vitest'
import { createProject, type CanvasNode, type Project } from '../project/model'
import { useProjectStore } from '../project/project-store'
import { ProjectRepository, WirelessCanvasDatabase } from '../project/project-repository'
import { createInternalDemoProvider, ProviderRegistry } from '../generation/model-provider-registry'
import type { GenerationAdapter, GenerationRequest, GenerationResult } from '../generation/generation-adapter'
import { createPipelineRun } from './pipeline-model'
import { PipelineRunner } from './pipeline-runner'
import { createPipelineExecutor, pipelineEstimate, pipelineRequest } from './pipeline-executor'

const databases: WirelessCanvasDatabase[] = []
function setup() {
  const project = createProject('串行管线', '')
  project.nodes = [0, 1, 2].map((i): CanvasNode => ({ id: `p${i}`, kind: i === 0 ? 'text' : 'image', title: `步骤${i}`, position: { x: i * 400, y: 0 }, modelProviderId: 'internal-demo', versions: [{ id: `v${i}`, createdAt: project.createdAt, prompt: `提示${i}` }], activeVersionId: `v${i}`, sourceChanged: false }))
  project.edges = [{ id: 'e1', sourceNodeId: 'p0', targetNodeId: 'p1' }, { id: 'e2', sourceNodeId: 'p1', targetNodeId: 'p2' }]
  useProjectStore.setState({ activeProject: project, activeProjectId: project.id, projectsById: { [project.id]: project }, past: [], future: [], saveStatus: 'saved' })
  const db = new WirelessCanvasDatabase(`pipeline-executor-${crypto.randomUUID()}`); databases.push(db)
  return { project, repository: new ProjectRepository(db), registry: new ProviderRegistry([createInternalDemoProvider()]) }
}
function result(request: GenerationRequest): GenerationResult {
  const asset = { id: crypto.randomUUID(), kind: request.targetKind === 'text' ? 'text' as const : 'image' as const, url: `data:${request.targetKind === 'text' ? 'text/plain' : 'image/png'};base64,QQ==`, mimeType: request.targetKind === 'text' ? 'text/plain' : 'image/png' }
  return { asset, persistence: 'ephemeral', version: { id: crypto.randomUUID(), assetId: asset.id, prompt: request.prompt, createdAt: new Date().toISOString(), ...(request.targetKind === 'text' ? { textContent: '上游新生成文本' } : {}) } }
}
afterEach(async () => {
  useProjectStore.setState({ activeProject: undefined, activeProjectId: undefined, projectsById: {}, past: [], future: [] })
  await Promise.all(databases.splice(0).map(db => db.delete()))
})

test('standard queue feeds fresh upstream outputs forward and persists versions, assets and history', async () => {
  const context = setup(), requests: GenerationRequest[] = []
  const adapter: GenerationAdapter = { start: async request => { requests.push(request); return result(request) } }
  const executor = createPipelineExecutor({ ...context, projectId: context.project.id, canvasId: context.project.activeCanvasId, adapter })
  const run = createPipelineRun(context.project, 'p0')
  await new PipelineRunner(run, { save: async () => undefined, execute: executor.execute }).start()
  expect(requests).toHaveLength(3)
  expect(requests[1].prompt).toContain('上游新生成文本')
  const saved = (await context.repository.load(context.project.id))!
  expect(saved.assets).toHaveLength(3)
  expect(saved.jobs.every(job => job.status === 'succeeded')).toBe(true)
  expect(saved.nodes.every(node => node.versions.length === 2)).toBe(true)
  expect(requests[2].referenceAssets[0].url).toBe(saved.assets[1].url)
  expect(saved.canvases![0].nodes[1].versions).toHaveLength(2)
  executor.dispose()
})

test('postprocessing consumes the upstream image, costs zero and produces a new persisted asset', async () => {
  const context = setup()
  context.project.nodes = context.project.nodes.slice(1)
  context.project.edges = context.project.edges.slice(1)
  context.project.nodes[1].pipelineConfig = { action: 'image-transform', mirrorHorizontal: true, rotationQuarterTurns: 1 }
  const transform = vi.fn(async (_asset, _config, signal: AbortSignal) => {
    signal.throwIfAborted()
    return { asset: { id: 'processed', kind: 'image' as const, url: 'data:image/png;base64,Qg==', mimeType: 'image/png', width: 720, height: 1280 }, version: { id: 'processed-v', assetId: 'processed', createdAt: new Date().toISOString(), prompt: '本地后处理' } }
  })
  const adapter: GenerationAdapter = { start: async request => result(request) }
  const executor = createPipelineExecutor({ ...context, projectId: context.project.id, canvasId: context.project.activeCanvasId, adapter, transform })
  const runner = new PipelineRunner(createPipelineRun(context.project, 'p1'), { save: async () => undefined, execute: executor.execute })
  await runner.start()
  expect(runner.snapshot.status).toBe('succeeded')
  expect(transform.mock.calls[0][1]).toMatchObject({ mirrorHorizontal: true, rotationQuarterTurns: 1 })
  const saved = (await context.repository.load(context.project.id))!
  expect(saved.assets.at(-1)).toMatchObject({ id: 'processed', width: 720, height: 1280 })
  expect(saved.jobs.at(-1)).toMatchObject({ providerId: 'pipeline-local-image', creditsSpent: 0 })
  executor.dispose()
})

test('does not execute following nodes after storage failure, without dropping in-memory results', async () => {
  const context = setup(), start = vi.fn(async (request: GenerationRequest) => result(request))
  const executor = createPipelineExecutor({ ...context, projectId: context.project.id, canvasId: context.project.activeCanvasId, repository: { save: async () => { throw new Error('磁盘已满') } }, adapter: { start } })
  const runner = new PipelineRunner(createPipelineRun(context.project, 'p0'), { save: async () => undefined, execute: executor.execute })
  await runner.start()
  expect(start).toHaveBeenCalledTimes(1)
  expect(runner.snapshot.steps[0].error).toContain('保存失败')
  expect(useProjectStore.getState().activeProject!.assets).toHaveLength(1)
  executor.dispose()
})

test('storage failures never consume automatic retry budget; manual retry saves the existing result only', async () => {
  const context = setup(), start = vi.fn(async (request: GenerationRequest) => result(request))
  let full = true
  const executor = createPipelineExecutor({ ...context, projectId: context.project.id, canvasId: context.project.activeCanvasId,
    repository: { save: async project => { if (full) throw new Error('磁盘已满'); await context.repository.save(project) } }, adapter: { start } })
  const runner = new PipelineRunner(createPipelineRun(context.project, 'p0', { mode: 'retry', retries: 2 }), { save: async () => undefined, execute: executor.execute })
  await runner.start()
  expect(start).toHaveBeenCalledTimes(1)
  expect(runner.snapshot.pausedReason).toBe('failure')
  full = false
  await runner.retry('p0')
  expect(runner.snapshot.status).toBe('succeeded')
  expect(start).toHaveBeenCalledTimes(3)
  expect((await context.repository.load(context.project.id))?.assets).toHaveLength(3)
  executor.dispose()
})

test('cancelled requests cannot write late results into another project', async () => {
  const context = setup()
  let finish!: (result: GenerationResult) => void
  let request!: GenerationRequest
  const executor = createPipelineExecutor({ ...context, projectId: context.project.id, canvasId: context.project.activeCanvasId, adapter: { start: input => { request = input; return new Promise(resolve => { finish = resolve }) } } })
  const runner = new PipelineRunner(createPipelineRun(context.project, 'p0'), { save: async () => undefined, execute: executor.execute })
  const running = runner.start(); await vi.waitFor(() => expect(request).toBeDefined())
  await runner.cancel(true)
  const other = createProject('另一项目', '')
  useProjectStore.setState(state => ({ activeProject: other, activeProjectId: other.id, projectsById: { ...state.projectsById, [other.id]: other } }))
  finish(result(request)); await running
  expect(useProjectStore.getState().activeProject).toEqual(other)
  expect(useProjectStore.getState().projectsById[context.project.id].assets).toEqual([])
  executor.dispose()
})

test('manifest costs include retry ceiling and an unavailable model is not silently replaced', () => {
  const context = setup(), provider = createInternalDemoProvider()
  const registry = new ProviderRegistry([{ ...provider, pricing: { amount: 8, unit: 'generation', currency: 'credits' } }])
  const run = createPipelineRun(context.project, 'p0', { mode: 'retry', retries: 2 })
  expect(pipelineEstimate(context.project, run, registry)).toMatchObject({ amount: 24, maximum: 72, issues: [] })
  const unavailable = new ProviderRegistry([{ ...provider, disabledReason: '配置未完成' }])
  expect(pipelineEstimate(context.project, run, unavailable).issues).toHaveLength(3)
})

test('live edit configurations retain tool identity but refresh their source image', () => {
  const { project, registry } = setup()
  registry.register({ ...createInternalDemoProvider(), id: 'ark-image-edit' })
  project.assets = [{ id: 'fresh', kind: 'image', url: 'data:image/png;base64,QQ==', mimeType: 'image/png' }]
  project.nodes[1].versions[0].assetId = 'fresh'
  project.nodes[2].generationConfig = { targetKind: 'image', providerId: 'ark-image-edit', parameters: { editOperation: 'lighting' }, referenceAssets: [{ url: 'https://stale.invalid/image', kind: 'image', mimeType: 'image/png' }] }
  const request = pipelineRequest(project as Project, project.nodes[2], registry)
  expect(request.providerId).toBe('ark-image-edit')
  expect(request.referenceAssets[0].url).toBe(project.assets[0].url)
})
