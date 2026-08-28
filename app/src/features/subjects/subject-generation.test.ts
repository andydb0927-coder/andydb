import { afterEach, expect, test, vi } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { ProjectRepository, WirelessCanvasDatabase } from '../project/project-repository'
import { useProjectStore } from '../project/project-store'
import { ProviderRegistry } from '../generation/model-provider-registry'
import { createSeedreamLiveProvider } from '../generation/seedream-live-provider'
import { createSeedanceVideoProvider } from '../generation/seedance-video-provider'
import { createArkTextLlmProvider } from '../generation/ark-text-llm-provider'
import { GenerationQueue } from '../generation/generation-queue'
import { RegistryGenerationAdapter } from '../generation/registry-generation-adapter'
import { builtInStyles, styleSnapshot } from '../styles/style-model'
import { createWorkflowSnapshot, parseWorkflowImport } from '../canvas/canvas-workflow-export'
import { SubjectRepository } from './subject-repository'
import { subjectSnapshot } from './subject-consistency'

const databases: WirelessCanvasDatabase[] = []
afterEach(async () => {
  useProjectStore.setState({ activeProject: undefined, activeProjectId: undefined, projectsById: {}, past: [], future: [], saveStatus: 'saved' })
  for (const database of databases.splice(0)) await database.delete()
})
const subject = { id: 'subject-1', name: '旅人', description: '蓝色围巾、黑色风衣', coverUrl: 'https://fixture.subject.invalid/source.png', mimeType: 'image/png' }
const style = styleSnapshot(builtInStyles[0])

test.each(['image', 'video', 'text'] as const)('%s dispatch uses confirmed identity alongside style, preserves raw text, and never mutates queued snapshots', async kind => {
  const bodies: Array<Record<string, unknown>> = []
  const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.body) bodies.push(JSON.parse(String(init.body)))
    return Response.json(kind === 'image' ? { data: [{ url: 'https://media.fixture.invalid/image-subject.png', size: '2048x2048' }] }
      : kind === 'text' ? { choices: [{ message: { content: '古桥旁，蓝围巾的旅人缓步走来。' } }] }
        : init?.method === 'POST' ? { id: 'subject-video' } : { status: 'succeeded', content: { video_url: 'https://media.fixture.invalid/video-subject.mp4' }, duration: 5 })
  })
  const options = { mode: 'seedream-direct-dev', apiKey: 'fixture-only', apiBase: 'https://fixture.subject.invalid/api/v3', fetchFn, pollIntervalMs: 0 }
  const provider = kind === 'image' ? createSeedreamLiveProvider(options) : kind === 'video' ? createSeedanceVideoProvider(options) : createArkTextLlmProvider(options)
  const registry = new ProviderRegistry().register(provider)
  const original = { projectId: 'p', nodeId: 'n', targetKind: kind, operation: 'regenerate' as const, prompt: '清晨古桥', providerId: provider.id, parameters: { generationMode: '全能参考' }, referenceAssets: [], subjects: [{ ...subject }], style }
  const success = vi.fn()
  const queue = new GenerationQueue({ adapter: new RegistryGenerationAdapter(registry), onJobChange: vi.fn(), onSuccess: success })
  try {
    const job = queue.enqueue(original)
    original.subjects[0].description = '队列之外的新描述'
    await vi.waitFor(() => expect(success).toHaveBeenCalledOnce())
    const expected = `保持参考主体一致（以以下特征为准）：\n旅人：蓝色围巾、黑色风衣`
    if (kind === 'image') {
      expect(bodies[0].image).toEqual([subject.coverUrl])
      expect(bodies[0].prompt).toBe(`${expected}\n\n${style.promptFragment}\n\n清晨古桥`)
    } else if (kind === 'video') {
      expect(bodies[0].content).toEqual(expect.arrayContaining([
        { type: 'text', text: `${expected}\n\n${style.promptFragment}\n\n清晨古桥` },
        { type: 'image_url', image_url: { url: subject.coverUrl }, role: 'reference_image' },
      ]))
    } else {
      const messages = bodies[0].messages as Array<{ role: string; content: string }>
      expect(messages[0].content).toContain(expected)
      expect(messages[0].content).toContain(style.promptFragment)
      expect(messages[1]).toEqual({ role: 'user', content: '清晨古桥' })
    }
    expect(job.generationConfig?.subjects).toEqual([subject])
    expect(success.mock.calls[0][1].version.prompt).toBe('清晨古桥')
    expect(original.prompt).toBe('清晨古桥')
  } finally { queue.dispose() }
})

test('subject snapshots survive project and workflow round trips; library deletion never deletes references or generated assets', async () => {
  const db = new WirelessCanvasDatabase(`subject-roundtrip-${crypto.randomUUID()}`); databases.push(db)
  const repository = new ProjectRepository(db), subjects = new SubjectRepository(db)
  const saved = await subjects.create({ ...subject, sampleImages: [subject.coverUrl], tags: ['人物'] })
  const project = makeProjectFixture()
  await useProjectStore.getState().hydrate(project.id, { load: async () => project })
  useProjectStore.getState().updateNode('shot-1', { subjectId: saved.id, subjectSnapshot: subjectSnapshot(saved), generationConfig: { targetKind: 'image', referenceAssets: [], subjects: [subjectSnapshot(saved)] } })
  await useProjectStore.getState().persistActive(repository)
  await subjects.delete(saved.id)
  await useProjectStore.getState().hydrate(project.id, repository)
  const restored = useProjectStore.getState().activeProject!
  expect(restored.nodes[0].subjectSnapshot).toEqual(subjectSnapshot(saved))
  expect(restored.nodes[0].generationConfig?.subjects).toEqual([subjectSnapshot(saved)])
  expect(restored.assets).toEqual(project.assets)
  const imported = parseWorkflowImport(JSON.stringify(createWorkflowSnapshot(restored)), restored)
  expect(imported.snapshot?.project.nodes[0].subjectSnapshot).toEqual(subjectSnapshot(saved))
  const invalid = createWorkflowSnapshot(restored)
  invalid.project.nodes[0].subjectSnapshot!.coverUrl = 'javascript:alert(1)'
  expect(parseWorkflowImport(JSON.stringify(invalid), restored).errors.some(error => error.includes('主体'))).toBe(true)
})

test('usage reads actual IndexedDB projects and replaces, not duplicates, an unsaved current project', async () => {
  const db = new WirelessCanvasDatabase(`subject-usage-${crypto.randomUUID()}`); databases.push(db)
  const repo = new SubjectRepository(db), project = makeProjectFixture()
  project.nodes[0].subjectId = subject.id
  await db.projects.put(project)
  expect((await repo.usage(subject.id)).nodeReferences).toBe(1)
  expect((await repo.usage(subject.id, [{ ...project, nodes: [] }])).nodeReferences).toBe(0)
  expect((await repo.usage(subject.id, [project])).nodeReferences).toBe(1)
})
