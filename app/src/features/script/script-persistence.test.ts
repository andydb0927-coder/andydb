import { expect, test } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { collectAssetReferenceImpact } from '../assets/domain/asset-library-policy'
import { detachLibraryAssetFromProject } from '../assets/library-model'
import { createWorkflowSnapshot, parseWorkflowImport, prepareWorkflowMerge } from '../canvas/canvas-workflow-export'
import { parseScriptBreakdown, parseScriptShots } from './script-workflow'
import { scriptBreakdownFixture, scriptShotsFixture } from './fixtures/script-v2.fixture'

function fixture() {
  const project = makeProjectFixture()
  const breakdown = parseScriptBreakdown(JSON.stringify(scriptBreakdownFixture))
  const assetId = project.assets[0].id
  project.nodes[0] = { ...project.nodes[0], details: {
    type: 'script', ...breakdown,
    characters: breakdown.characters.map(c => ({ ...c, referenceAssetId: assetId, subjectId: 'local-subject' })),
    shots: parseScriptShots(JSON.stringify(scriptShotsFixture), breakdown).map(s => ({ ...s, assetId, canvasNodeId: project.nodes[1].id, generationJobId: 'old-job', status: 'succeeded' })),
  } }
  return { project, assetId }
}

test('asset deletion impact includes script-only references and clears results for regeneration', () => {
  const { project, assetId } = fixture()
  project.assets = []; project.jobs = []; project.exportJobs = []
  project.nodes = [{ ...project.nodes[0], versions: project.nodes[0].versions.map(v => ({ ...v, assetId: undefined })) }]
  expect(collectAssetReferenceImpact([project], assetId).nodeTitles).toEqual([project.nodes[0].title])
  const detached = detachLibraryAssetFromProject(project, assetId)
  const details = detached.nodes[0].details
  expect(details?.type).toBe('script')
  if (details?.type !== 'script') throw new Error('fixture')
  expect(details.characters![0].referenceAssetId).toBeUndefined()
  expect(details.characters![0].subjectId).toBeUndefined()
  expect(details.shots![0]).toMatchObject({ assetId: undefined, status: 'cancelled', canvasNodeId: undefined, error: expect.stringContaining('删除') })
})

test('workflow JSON preserves editable script fields and remaps shot/character/canvas references', () => {
  const { project, assetId } = fixture()
  const parsed = parseWorkflowImport(JSON.stringify(createWorkflowSnapshot(project)), makeProjectFixture())
  expect(parsed.valid).toBe(true)
  let id = 0
  const merged = prepareWorkflowMerge(parsed.snapshot!, () => `new-${++id}`)
  const newAssetId = merged.assets[project.assets.findIndex(a => a.id === assetId)].id
  const details = merged.nodes[0].details
  if (details?.type !== 'script') throw new Error('fixture')
  expect(details.characters![0]).toMatchObject({ name: '小舟', referenceAssetId: newAssetId, subjectId: undefined })
  expect(details.shots![0]).toMatchObject({ assetId: newAssetId, canvasNodeId: merged.nodes[1].id, generationJobId: undefined, prompt: expect.any(String) })
})

test('import rejects missing and malformed script result references without throwing', () => {
  const { project } = fixture()
  const details = project.nodes[0].details
  if (details?.type !== 'script') throw new Error('fixture')
  details.shots![0].assetId = 'missing-shot'
  expect(parseWorkflowImport(JSON.stringify(createWorkflowSnapshot(project)), makeProjectFixture()).missingReferences.join()).toContain('missing-shot')
  const broken = createWorkflowSnapshot(project)
  const raw = { ...broken, project: { ...project, nodes: project.nodes.map((node, index) => index === 0 ? { ...node, details: { ...details, shots: [null] } } : node) } }
  expect(() => parseWorkflowImport(JSON.stringify(raw), makeProjectFixture())).not.toThrow()
  expect(parseWorkflowImport(JSON.stringify(raw), makeProjectFixture()).valid).toBe(false)
  const wrongStatus = { ...broken, project: { ...project, nodes: project.nodes.map((node, index) => index === 0 ? { ...node, details: { ...details, shots: [{ ...details.shots![0], assetId: project.assets[0].id, status: 'unrecognized' }] } } : node) } }
  expect(parseWorkflowImport(JSON.stringify(wrongStatus), makeProjectFixture()).valid).toBe(false)
})
