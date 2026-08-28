import { afterEach, describe, expect, test, vi } from 'vitest'
import { WirelessCanvasDatabase, ProjectRepository } from '../project/project-repository'
import { StyleRepository } from './style-repository'
import { builtInStyles, styleSnapshot, styleCompatibilityReason, prepareStyledRequest, restoreTaskStyle } from './style-model'
import { ProviderRegistry } from '../generation/model-provider-registry'
import { createArkTextLlmProvider } from '../generation/ark-text-llm-provider'
import { arkTextConfigFixture, arkTextGenerationRequestFixture, arkTextSuccessFixture } from '../generation/fixtures/ark-text-llm.fixture'
import { GenerationQueue } from '../generation/generation-queue'
import { RegistryGenerationAdapter } from '../generation/registry-generation-adapter'
import type { GenerationRequest } from '../generation/generation-adapter'
import { createSeedreamLiveProvider } from '../generation/seedream-live-provider'
import { createSeedanceVideoProvider } from '../generation/seedance-video-provider'
import { createFixtureProviderRegistry } from '../../test/provider-fixtures'
import { makeProjectFixture } from '../../test/fixtures'
import { buildGenerationRequest } from '../canvas/canvas-generation-request'
import { useProjectStore } from '../project/project-store'
import { createWorkflowSnapshot, parseWorkflowImport } from '../canvas/canvas-workflow-export'

const databases: WirelessCanvasDatabase[] = []
afterEach(async () => {
  useProjectStore.setState({ projectsById: {}, activeProjectId: undefined, activeProject: undefined, past: [], future: [], saveStatus: 'saved' })
  for (const database of databases.splice(0)) await database.delete()
})
const style = () => styleSnapshot(builtInStyles[0])
const request = (targetKind: GenerationRequest['targetKind']): GenerationRequest => ({
  ...arkTextGenerationRequestFixture, targetKind, prompt: '清晨古桥', style: style(),
})

describe('style request contract', () => {
  test('each built-in declares prompt and compatible targets', () => {
    for (const card of builtInStyles) {
      expect(card.promptFragment.trim().length).toBeGreaterThan(0)
      expect(card.compatibility.targetKinds.length).toBeGreaterThan(0)
    }
  })
  test.each(['image', 'video'] as const)('%s prepends style without mutating the original request', kind => {
    const original = request(kind)
    const prepared = prepareStyledRequest(original)
    expect(prepared.prompt).toBe(`${style().promptFragment}\n\n清晨古桥`)
    expect(original.prompt).toBe('清晨古桥')
    expect(prepareStyledRequest(original).prompt).toBe(prepared.prompt)
  })
  test('text uses a separate system prefix and preserves the user prompt', () => {
    const prepared = prepareStyledRequest(request('text'))
    expect(prepared.prompt).toBe('清晨古桥')
    expect(prepared.systemPromptPrefix).toBe(style().promptFragment)
  })
  test('rejects incompatible targets/providers and invalid imported snapshots', () => {
    const restricted = { ...style(), compatibility: { targetKinds: ['image' as const], providerIds: ['only-image'] } }
    expect(styleCompatibilityReason(restricted, 'video', 'only-image')).toContain('不兼容')
    expect(styleCompatibilityReason(restricted, 'image', 'other')).toContain('不兼容')
    expect(() => prepareStyledRequest({ ...request('image'), style: restricted })).toThrow('不兼容')
    expect(() => prepareStyledRequest({ ...request('text'), style: { ...style(), promptFragment: '' } })).toThrow('风格')
  })
  test('unstyled requests keep their original identity and semantics', () => {
    const original = { ...request('image'), style: undefined }
    expect(prepareStyledRequest(original)).toBe(original)
  })
  test('retry restores the original style or no-style snapshot instead of new node selection', () => {
    const changed = request('image')
    changed.style = { ...style(), name: '新风格', promptFragment: '新片段' }
    expect(restoreTaskStyle(changed, style()).style).toEqual(style())
    expect(restoreTaskStyle(changed).style).toBeUndefined()
    expect(changed.style.name).toBe('新风格')
  })
  test('registry puts style in the actual chat system message, keeps JSON rules and stores job snapshot', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(Response.json(arkTextSuccessFixture))
    const registry = new ProviderRegistry().register(createArkTextLlmProvider({ ...arkTextConfigFixture, fetchFn }))
    const original = { ...request('text'), parameters: { outputKind: 'script', sceneCount: 2 } }
    const onSuccess = vi.fn()
    const queue = new GenerationQueue({ adapter: new RegistryGenerationAdapter(registry), onJobChange: vi.fn(), onSuccess })
    const job = queue.enqueue(original)
    expect(job.generationConfig?.style).toEqual(style())
    expect(job.generationConfig?.style).not.toBe(original.style)
    original.style!.promptFragment = '队列外修改不能改变已确认任务'
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    const body = JSON.parse(String(fetchFn.mock.calls[0][1]?.body))
    expect(body.messages[0].content.startsWith(style().promptFragment)).toBe(true)
    expect(body.messages[0].content).toContain('JSON')
    expect(body.messages[1].content).toBe('清晨古桥')
    expect(onSuccess.mock.calls[0][1].version.prompt).toBe('清晨古桥')
    queue.dispose()
  })
  test.each(['image', 'video'] as const)('%s wire request carries style once while versions keep raw input', async kind => {
    const bodies: Array<Record<string, unknown>> = []
    const fetchFn: typeof fetch = vi.fn(async (_input, init) => {
      if (init?.body) bodies.push(JSON.parse(String(init.body)))
      return Response.json(kind === 'image'
        ? { data: [{ url: 'https://media.fixture.invalid/image-style.png', size: '2048x2048' }] }
        : init?.method === 'POST' ? { id: 'style-task' }
          : { status: 'succeeded', content: { video_url: 'https://media.fixture.invalid/video-style.mp4' }, duration: 5 })
    })
    const options = { mode: 'seedream-direct-dev', apiKey: 'fixture-only', apiBase: 'https://fixture.ark.invalid/api/v3', fetchFn, pollIntervalMs: 0 }
    const provider = kind === 'image' ? createSeedreamLiveProvider(options) : createSeedanceVideoProvider(options)
    const registry = new ProviderRegistry().register(provider)
    const original = { ...request(kind), providerId: provider.id, parameters: {} }
    const result = await registry.generate(original, { signal: new AbortController().signal })
    const wire = kind === 'image' ? bodies[0].prompt : (bodies[0].content as Array<{ type: string; text: string }>).find(item => item.type === 'text')?.text
    expect(wire).toBe(`${style().promptFragment}\n\n清晨古桥`)
    expect(result.version.prompt).toBe('清晨古桥')
    expect(original.prompt).toBe('清晨古桥')
  })
})

describe('style IndexedDB persistence', () => {
  test('reopens custom styles, favorites and recent use without changing projects', async () => {
    const name = `style-${crypto.randomUUID()}`
    const db = new WirelessCanvasDatabase(name); databases.push(db)
    const repository = new StyleRepository(db)
    const card = await repository.create({ name: '水墨留白', promptFragment: '墨色留白，淡雅构图。' })
    await repository.setFavorite(card.id, true)
    await repository.markUsed(card.id)
    db.close()
    const reopened = new WirelessCanvasDatabase(name); databases.push(reopened)
    const state = await new StyleRepository(reopened).load()
    expect(state.cards).toEqual(expect.arrayContaining([expect.objectContaining({ id: card.id, name: '水墨留白' })]))
    expect(state.preferences.find(item => item.id === card.id)).toMatchObject({ favorite: true, lastUsedAt: expect.any(String) })
    await new StyleRepository(reopened).setFavorite(card.id, false)
    expect((await new StyleRepository(reopened).load()).preferences.find(item => item.id === card.id)?.favorite).toBe(false)
    expect(await new ProjectRepository(reopened).listAll()).toEqual([])
  })
  test('validates custom inputs and rejects unsafe covers', async () => {
    const db = new WirelessCanvasDatabase(`style-${crypto.randomUUID()}`); databases.push(db)
    const repository = new StyleRepository(db)
    await expect(repository.create({ name: ' ', promptFragment: 'abc' })).rejects.toThrow('名称')
    await expect(repository.create({ name: '有效', promptFragment: '' })).rejects.toThrow('片段')
    await expect(repository.create({ name: '有效', promptFragment: 'abc', cover: 'javascript:alert(1)' })).rejects.toThrow('封面')
  })
  test('node selection and task snapshot survive save, restore and workflow export; clearing never resurrects old style', async () => {
    const db = new WirelessCanvasDatabase(`style-${crypto.randomUUID()}`); databases.push(db)
    const repository = new ProjectRepository(db), project = makeProjectFixture()
    await useProjectStore.getState().hydrate(project.id, { load: async () => project })
    useProjectStore.getState().updateNode('shot-1', { appliedStyle: style() })
    const selected = useProjectStore.getState().activeProject!
    expect(selected.nodes[0].appliedStyle).toEqual(style())
    const built = buildGenerationRequest(selected, selected.nodes[0], 'regenerate', '古桥', createFixtureProviderRegistry())
    expect(built.style).toEqual(style())
    useProjectStore.getState().updateNode('shot-1', { generationConfig: { targetKind: 'image', referenceAssets: [], style: style() } })
    await useProjectStore.getState().persistActive(repository)
    await useProjectStore.getState().hydrate(project.id, repository)
    const restored = useProjectStore.getState().activeProject!
    expect(restored.nodes[0].appliedStyle).toEqual(style())
    const imported = parseWorkflowImport(JSON.stringify(createWorkflowSnapshot(restored)), restored)
    expect(imported.snapshot?.project.nodes[0].appliedStyle).toEqual(style())
    useProjectStore.getState().updateNode('shot-1', { appliedStyle: null })
    const cleared = useProjectStore.getState().activeProject!
    expect(buildGenerationRequest(cleared, cleared.nodes[0], 'regenerate', '古桥', createFixtureProviderRegistry()).style).toBeUndefined()
    useProjectStore.getState().undo()
    expect(useProjectStore.getState().activeProject!.nodes[0].appliedStyle).toEqual(style())
  })
  test('history node without explicit selection restores its saved style, invalid imported style is rejected', () => {
    const project = makeProjectFixture()
    project.nodes[0].generationConfig = { targetKind: 'image', referenceAssets: [], style: style() }
    expect(buildGenerationRequest(project, project.nodes[0], 'regenerate', '古桥', createFixtureProviderRegistry()).style).toEqual(style())
    const invalid = createWorkflowSnapshot(project)
    invalid.project.nodes[0].appliedStyle = { ...style(), promptFragment: '' }
    expect(parseWorkflowImport(JSON.stringify(invalid), project).errors).toEqual(expect.arrayContaining([expect.stringContaining('风格配置无效')]))
  })
})
