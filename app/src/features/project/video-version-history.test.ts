import { afterEach, expect, test } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { useProjectStore } from './project-store'
import { ProjectRepository, WirelessCanvasDatabase } from './project-repository'
import { videoVersionHistory } from './video-version-history'

afterEach(() => useProjectStore.setState({ projectsById: {}, activeProject: undefined, activeProjectId: undefined, past: [], future: [] }))

test('video restore selects old media and inputs, preserves versions, is undoable/idempotent and persists', async () => {
  const project = makeProjectFixture()
  const node = project.nodes[0]
  node.kind = 'video'
  project.assets = [1, 2].map(index => ({ id: `v${index}`, kind: 'video', url: `https://fixture.invalid/${index}.mp4`, mimeType: 'video/mp4', framesPerSecond: 24 }))
  const config = { targetKind: 'video' as const, providerId: 'seedance-api', parameters: { duration: 5, negativePrompt: '闪烁' }, referenceAssets: [] }
  node.versions = [1, 2].map(index => ({ id: `version${index}`, createdAt: project.createdAt, prompt: `提示${index}`, assetId: `v${index}`, generationConfig: index === 1 ? config : { ...config, parameters: { duration: 8 } } }))
  node.activeVersionId = 'version2'
  node.versions[0].generatedPrompt = '原始提示1'
  node.versions[0].prompt = '之后的未生成草稿'
  project.jobs = []
  useProjectStore.setState({ projectsById: { [project.id]: project }, activeProjectId: project.id, activeProject: project, past: [], future: [] })
  expect(videoVersionHistory(project, node)).toHaveLength(2)
  expect(useProjectStore.getState().restoreVideoVersion(node.id, 'version1')).toBe(true)
  const restored = useProjectStore.getState().activeProject!
  expect(restored.nodes[0]).toMatchObject({ activeVersionId: 'version1', generationConfig: config, modelProviderId: 'seedance-api' })
  expect(restored.nodes[0].generationConfig).not.toBe(config)
  expect(restored.nodes[1].sourceChanged).toBe(true)
  expect(restored.nodes[0].versions).toHaveLength(2)
  expect(restored.nodes[0].versions[0].prompt).toBe('原始提示1')
  expect(useProjectStore.getState().restoreVideoVersion(node.id, 'version1')).toBe(false)
  expect(useProjectStore.getState().past).toHaveLength(1)
  const db = new WirelessCanvasDatabase(`video-restore-${crypto.randomUUID()}`)
  try {
    const repository = new ProjectRepository(db)
    await useProjectStore.getState().persistActive(repository)
    expect((await repository.load(project.id))?.nodes[0].activeVersionId).toBe('version1')
    useProjectStore.getState().undo()
    expect(useProjectStore.getState().activeProject?.nodes[0].activeVersionId).toBe('version2')
  } finally { await db.delete() }
})

test('rejects restoring missing media without mutations', () => {
  const project = makeProjectFixture()
  useProjectStore.setState({ projectsById: { [project.id]: project }, activeProjectId: project.id, activeProject: project, past: [], future: [] })
  expect(useProjectStore.getState().restoreVideoVersion(project.nodes[0].id, 'missing')).toBe(false)
  expect(useProjectStore.getState().past).toHaveLength(0)
})

test('does not restore versions during generation or misattribute the cost of a newer job', () => {
  const project = makeProjectFixture()
  const node = project.nodes[0]
  node.kind = 'video'
  project.assets[0].kind = 'video'
  const original = node.versions[0]
  node.versions.push({ ...original, id: 'new-version', generationJobId: 'new-job' })
  node.activeVersionId = 'new-version'
  project.jobs[0].creditsSpent = 135
  project.jobs.push({ ...project.jobs[0], id: 'new-job', status: 'running', assetId: undefined, creditsSpent: 216 })
  original.generationJobId = 'new-job'
  useProjectStore.setState({ activeProject: project, activeProjectId: project.id, projectsById: { [project.id]: project }, past: [], future: [] })
  expect(videoVersionHistory(project, node)[0].job?.creditsSpent).toBe(135)
  expect(useProjectStore.getState().restoreVideoVersion(node.id, original.id)).toBe(false)
  expect(useProjectStore.getState().activeProject).toBe(project)
  expect(useProjectStore.getState().past).toHaveLength(0)
})
