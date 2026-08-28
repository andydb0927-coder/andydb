import { afterEach, expect, test } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { useProjectStore } from './project-store'
import { ProjectRepository, WirelessCanvasDatabase } from './project-repository'
import { audioVersionHistory, audioVoiceSamples } from './audio-version-history'

afterEach(() => useProjectStore.setState({ projectsById: {}, activeProject: undefined, activeProjectId: undefined, past: [], future: [] }))

function setup() {
  const project = makeProjectFixture()
  const node = project.nodes[0]
  node.kind = 'text'
  node.details = { type: 'audio', durationSeconds: 2, voice: '温暖女声', speed: 1, volume: 75, pitch: 2, prompt: '新草稿' }
  project.assets = [1, 2].map(i => ({ id: `audio${i}`, kind: 'audio', url: `data:audio/wav;base64,${i}`, mimeType: 'audio/wav', sampleRate: 24000, durationSeconds: i }))
  node.versions = [1, 2].map(i => ({ id: `version${i}`, createdAt: project.createdAt, prompt: `被修改草稿${i}`, generatedPrompt: `生成提示${i}`, assetId: `audio${i}`, generationConfig: { targetKind: 'audio', providerId: 'ark-tts', parameters: { voice: 'zh_male_m191_uranus_bigtts', speed: i, volume: 80, pitch: -i, sampleRate: 24000, format: 'wav' }, referenceAssets: [] } }))
  node.activeVersionId = 'version2'
  project.jobs = [1, 2].map(i => ({ ...project.jobs[0], id: `job${i}`, nodeId: node.id, assetId: `audio${i}`, providerId: 'ark-tts', status: 'succeeded', creditsSpent: i, generationConfig: node.versions[i - 1].generationConfig }))
  useProjectStore.setState({ projectsById: { [project.id]: project }, activeProjectId: project.id, activeProject: project, past: [], future: [] })
  return { project, node }
}

test('restores audio media, immutable voice controls and prompt, undoable and refresh safe', async () => {
  const { project, node } = setup()
  expect(audioVersionHistory(project, node).map(v => v.job?.creditsSpent)).toEqual([1, 2])
  expect(useProjectStore.getState().restoreAudioVersion(node.id, 'version1')).toBe(true)
  const restored = useProjectStore.getState().activeProject!
  expect(restored.nodes[0]).toMatchObject({ activeVersionId: 'version1', details: { prompt: '生成提示1', voice: 'zh_male_m191_uranus_bigtts', speed: 1, volume: 80, pitch: -1, trimStartSeconds: 0, trimEndSeconds: 1 } })
  expect(restored.nodes[1].sourceChanged).toBe(true)
  expect(restored.assets).toHaveLength(2)
  expect(useProjectStore.getState().restoreAudioVersion(node.id, 'version1')).toBe(false)
  expect(useProjectStore.getState().past).toHaveLength(1)
  const db = new WirelessCanvasDatabase(`audio-history-${crypto.randomUUID()}`)
  try {
    const repository = new ProjectRepository(db)
    await useProjectStore.getState().persistActive(repository)
    expect((await repository.load(project.id))?.nodes[0]).toMatchObject({ details: { pitch: -1 }, activeVersionId: 'version1' })
    useProjectStore.getState().undo()
    expect(useProjectStore.getState().activeProject?.nodes[0].activeVersionId).toBe('version2')
  } finally { await db.delete() }
})

test('audition uses latest successful result with exact voice; no generated sample is invented', () => {
  const { project } = setup()
  expect(audioVoiceSamples(project)).toEqual([{ voiceId: 'zh_male_m191_uranus_bigtts', asset: project.assets[1] }])
  project.jobs = []
  expect(audioVoiceSamples(project)).toEqual([])
})

test('missing media and in-flight generation cannot restore or mutate audio state', () => {
  const { project, node } = setup()
  expect(useProjectStore.getState().restoreAudioVersion(node.id, 'missing')).toBe(false)
  project.jobs[1].status = 'running'
  expect(useProjectStore.getState().restoreAudioVersion(node.id, 'version1')).toBe(false)
  expect(useProjectStore.getState().past).toHaveLength(0)
})

test('generation captures submitted voice and pitch rather than a draft edited during the request', () => {
  const { project, node } = setup()
  const submitted = { ...project.jobs[1], projectId: project.id, status: 'running' as const, operation: 'regenerate' as const, attempt: 1, sequence: 2 }
  project.jobs = [submitted]
  node.versions[1].generationJobId = submitted.id
  node.details = { type: 'audio', durationSeconds: 99, voice: '温暖女声', speed: 0.5, volume: 5, pitch: 12, prompt: '在途草稿' }
  const asset = { ...project.assets[0], id: 'new-result' }
  useProjectStore.getState().applyGenerationSuccess(project.id, submitted, {
    asset, version: { id: 'v3', createdAt: project.createdAt, assetId: asset.id, generationJobId: submitted.id, prompt: '真正提交的提示词' },
  })
  const result = useProjectStore.getState().activeProject!.nodes[0]
  expect(result.versions.at(-1)?.audioDetails).toMatchObject({ prompt: '真正提交的提示词', voice: 'zh_male_m191_uranus_bigtts', speed: 2, volume: 80, pitch: -2 })
  expect(result.details).toEqual(result.versions.at(-1)?.audioDetails)
})
