import { afterEach, expect, test, vi } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { useProjectStore } from '../project/project-store'
import { ProjectRepository, WirelessCanvasDatabase } from '../project/project-repository'
import { SubjectRepository } from '../subjects/subject-repository'
import { createDefaultProviderRegistry } from '../generation/model-provider-registry'
import { ScriptWorkflowRunner } from './script-workflow-runner'
import { parseScriptBreakdown, parseScriptShots } from './script-workflow'
import { scriptBreakdownFixture, scriptChatFixture, scriptShotsFixture, scriptV2ConfigFixture } from './fixtures/script-v2.fixture'

const databases: WirelessCanvasDatabase[] = []
afterEach(async () => {
  await Promise.all(databases.splice(0).map(db => db.delete()))
  useProjectStore.setState({ activeProject: undefined, activeProjectId: undefined, projectsById: {}, past: [], future: [], saveStatus: 'saved' })
})

function setup(fetchFn: typeof fetch) {
  const project = makeProjectFixture()
  const breakdown = parseScriptBreakdown(JSON.stringify(scriptBreakdownFixture))
  const node = { ...project.nodes[0], kind: 'script' as const, modelProviderId: 'ark-text-llm', details: { type: 'script' as const, ...breakdown, outline: '小舟在桥上与旧友道别', shots: parseScriptShots(JSON.stringify(scriptShotsFixture), breakdown) } }
  project.nodes = [node]
  project.jobs = []
  project.activeCanvasId = 'canvas-fixture'
  project.canvases = [{ id: project.activeCanvasId, title: '画布 1', nodes: project.nodes, edges: [], groups: [], viewport: { x: 0, y: 0, zoom: 1 }, createdAt: project.createdAt, updatedAt: project.updatedAt }]
  useProjectStore.setState({ activeProject: project, activeProjectId: project.id, projectsById: { [project.id]: project }, past: [], future: [], saveStatus: 'saved' })
  const db = new WirelessCanvasDatabase(`script-v2-${crypto.randomUUID()}`); databases.push(db)
  const repository = new ProjectRepository(db)
  const registry = createDefaultProviderRegistry({ arkText: { ...scriptV2ConfigFixture, fetchFn }, seedream: { ...scriptV2ConfigFixture, fetchFn } })
  const subjects = new SubjectRepository(db)
  const runner = new ScriptWorkflowRunner({ projectId: project.id, canvasId: project.activeCanvasId, registry, repository, subjects })
  return { runner, repository, registry, db, subjects, project, node }
}
function imageResponse(index: number) { return Response.json({ data: [{ url: `https://fixture.seedream.invalid/shot-${index}.png`, size: '2816x1584' }] }) }

test('serial batch preserves partial results in shots, versions, assets and history; retry skips success', async () => {
  let calls = 0, active = 0, maxActive = 0
  const fetchFn = vi.fn<typeof fetch>(async () => {
    calls += 1; active += 1; maxActive = Math.max(active, maxActive)
    await new Promise(resolve => setTimeout(resolve, 5)); active -= 1
    return calls === 2 ? new Response('server detail', { status: 500 }) : imageResponse(calls)
  })
  const { runner, repository, project, node, db } = setup(fetchFn)
  expect(runner.quote(node.id, 1, 2, { aspectRatio: '16:9', resolution: '2K' })).toMatchObject({ count: 2, cost: 36 })
  const pending = runner.generateShots(node.id, 1, 2, { aspectRatio: '16:9', resolution: '2K' })
  await expect(runner.generateShots(node.id, 1, 2, { aspectRatio: '16:9', resolution: '2K' })).rejects.toThrow('正在执行')
  expect(await pending).toMatchObject({ completed: 1, failed: 1 })
  expect(maxActive).toBe(1)
  let saved = (await repository.load(project.id))!
  expect(saved.nodes[0].modelProviderId).toBe('ark-text-llm')
  expect(saved.nodes[0].details).toMatchObject({ outline: node.details.outline, shots: [{ status: 'succeeded', assetId: expect.any(String) }, { status: 'failed', error: expect.any(String) }] })
  expect(saved.jobs.map(j => j.status)).toEqual(['succeeded', 'failed'])
  expect(await db.libraryAssets.count()).toBe(saved.assets.length)
  expect(runner.quote(node.id, 1, 2, { aspectRatio: '16:9', resolution: '2K' }).cost).toBe(18)
  await runner.generateShots(node.id, 1, 2, { aspectRatio: '16:9', resolution: '2K' })
  saved = (await repository.load(project.id))!
  expect(calls).toBe(3)
  expect(saved.nodes[0].details?.type === 'script' && saved.nodes[0].details.shots?.every(s => s.assetId)).toBe(true)
  const sent = runner.sendShot(node.id, 'shot-1')
  expect(runner.sendShot(node.id, 'shot-1')).toBe(sent)
  expect(useProjectStore.getState().activeProject!.nodes.filter(n => n.kind === 'image')).toHaveLength(1)
  await useProjectStore.getState().persistActive(repository)
  await useProjectStore.getState().hydrate(project.id, repository)
  expect(runner.sendShot(node.id, 'shot-1')).toBe(sent)
  runner.dispose()
})

test('breakdown and storyboard use normal persisted jobs without replacing source model or script text', async () => {
  const fetchFn = vi.fn<typeof fetch>(async (_url, init) => Response.json(scriptChatFixture(String(init?.body).includes('script-v2-breakdown') ? scriptBreakdownFixture : scriptShotsFixture)))
  const { runner, repository, project, node } = setup(fetchFn)
  await runner.analyze(node.id, 'breakdown', '小舟沿河寻找旧友')
  await runner.analyze(node.id, 'storyboard')
  const saved = (await repository.load(project.id))!
  expect(saved.nodes[0].details).toMatchObject({ outline: '小舟沿河寻找旧友', characters: [{ name: '小舟' }], shots: [{ title: '薄雾古桥' }, { title: '纸船远去' }] })
  expect(saved.nodes[0].modelProviderId).toBe('ark-text-llm')
  expect(saved.jobs).toHaveLength(2)
  runner.dispose()
})

test('stops after a persistence error without discarding generated memory result or making another paid request', async () => {
  const { runner, repository, node } = setup(vi.fn(async () => imageResponse(1)))
  vi.spyOn(repository, 'save').mockRejectedValue(new Error('disk unavailable'))
  await expect(runner.generateShots(node.id, 1, 2, { aspectRatio: '16:9', resolution: '2K' })).rejects.toThrow('保存失败')
  const details = useProjectStore.getState().activeProject!.nodes[0].details
  expect(details?.type === 'script' && details.shots![0].assetId).toBeTruthy()
  expect(useProjectStore.getState().activeProject!.jobs).toHaveLength(1)
  runner.dispose()
})

test('cancel aborts the current request and prevents subsequent shots', async () => {
  const fetchFn = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))))
  const { runner, node } = setup(fetchFn)
  const pending = runner.generateShots(node.id, 1, 2, { aspectRatio: '16:9', resolution: '2K' })
  await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1))
  runner.cancel()
  await expect(pending).rejects.toThrow('取消')
  expect(fetchFn).toHaveBeenCalledTimes(1)
  expect(useProjectStore.getState().activeProject!.jobs[0].status).toBe('cancelled')
  runner.dispose()
})

test('late responses cannot write into a different project', async () => {
  let release!: (response: Response) => void
  const fetchFn = vi.fn<typeof fetch>(() => new Promise(resolve => { release = resolve }))
  const { runner, node } = setup(fetchFn)
  const pending = runner.generateShots(node.id, 1, 2, { aspectRatio: '16:9', resolution: '2K' })
  await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1))
  const other = { ...makeProjectFixture(), id: 'another-project' }
  useProjectStore.setState({ activeProject: other, activeProjectId: other.id, projectsById: { [other.id]: other } })
  release(imageResponse(1))
  await expect(pending).rejects.toThrow('画布已切换')
  expect(useProjectStore.getState().activeProject).toEqual(other)
  runner.dispose()
})

test('character extraction reuses the image AI provider and subject repository; repeat is idempotent', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(scriptChatFixture({ name: '旅人', appearance: '短发', clothing: '蓝色外套', tags: ['旅人'] })))
  const { runner, subjects, node } = setup(fetchFn)
  const source = { id: 'reference', kind: 'image' as const, url: 'https://fixture.seedream.invalid/ref.png', mimeType: 'image/png' }
  const current = useProjectStore.getState().activeProject!
  useProjectStore.setState({ activeProject: { ...current, assets: [...current.assets, source] }, projectsById: { [current.id]: { ...current, assets: [...current.assets, source] } } })
  await expect(runner.extractCharacter(node.id, 'character-1', '')).rejects.toThrow('参考图')
  const subject = await runner.extractCharacter(node.id, 'character-1', source.id)
  expect(subject.name).toBe('小舟')
  expect(subject.aiExtraction?.appearance).toBe('短发')
  expect((await subjects.list())[0].coverUrl).toBe(source.url)
  await runner.extractCharacter(node.id, 'character-1', source.id)
  expect(fetchFn).toHaveBeenCalledTimes(1)
  runner.dispose()
})

test('resume recovers only interrupted script jobs and permits an explicit retry without automatic requests', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => imageResponse(1))
  const { runner, node, project } = setup(fetchFn)
  useProjectStore.getState().updateGenerationJob(project.id, {
    id: 'interrupted', projectId: project.id, nodeId: node.id, operation: 'regenerate', sequence: 1,
    status: 'running', prompt: '古桥', createdAt: project.createdAt, updatedAt: project.updatedAt,
    generationConfig: { targetKind: 'image', parameters: { scriptV2Action: 'shot', scriptV2ShotId: 'shot-1' }, referenceAssets: [] },
  })
  useProjectStore.getState().updateGenerationJob(project.id, {
    id: 'other-task', projectId: project.id, nodeId: 'other-node', status: 'running', prompt: '其他任务', createdAt: project.createdAt, updatedAt: project.updatedAt,
  })
  runner.resume()
  expect(useProjectStore.getState().activeProject!.jobs.find(j => j.id === 'interrupted')).toMatchObject({ status: 'cancelled', error: expect.stringContaining('中断') })
  expect(useProjectStore.getState().activeProject!.jobs.find(j => j.id === 'other-task')!.status).toBe('running')
  expect(fetchFn).not.toHaveBeenCalled()
  await runner.generateShots(node.id, 1, 1, { aspectRatio: '16:9', resolution: '2K' })
  expect(fetchFn).toHaveBeenCalledTimes(1)
  runner.dispose()
})

test('character reference selection persists independently of AI extraction and reaches image requests', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => imageResponse(1))
  const { runner, repository, node, project } = setup(fetchFn)
  const image = project.assets.find(a => a.kind === 'image')!
  runner.setCharacterReference(node.id, 'character-1', image.id)
  await useProjectStore.getState().persistActive(repository)
  await useProjectStore.getState().hydrate(project.id, repository)
  expect(runner.quote(node.id, 1, 1, { aspectRatio: '16:9', resolution: '2K' }).requests[0].referenceAssets).toContainEqual({ kind: 'image', url: image.url, mimeType: image.mimeType })
  expect(fetchFn).not.toHaveBeenCalled()
  runner.dispose()
})

test('empty breakdown and missing storyboard scenes fail before a network request', async () => {
  const fetchFn = vi.fn<typeof fetch>()
  const { runner, node } = setup(fetchFn)
  useProjectStore.getState().updateNode(node.id, { details: { type: 'script', chapters: [], outline: '' } })
  await expect(runner.analyze(node.id, 'breakdown', '')).rejects.toThrow('剧本原文')
  await expect(runner.analyze(node.id, 'storyboard')).rejects.toThrow('拆解')
  expect(fetchFn).not.toHaveBeenCalled()
  runner.dispose()
})
