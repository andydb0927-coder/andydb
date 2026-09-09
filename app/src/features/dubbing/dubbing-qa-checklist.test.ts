import { afterEach, expect, test } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { DubbingWorkbenchDatabase, DubbingWorkbenchRepository } from './dubbing-workbench-repository'
import { resolveDubbingSource } from './dubbing-canvas-adapter'
import { DUBBING_QA_CATEGORIES, loadDubbingQaTemplate } from './dubbing-qa-standard'
import { parseDubbingQaEvidence } from './dubbing-qa-checklist'

const databases: DubbingWorkbenchDatabase[] = []
test.each([null, [], { result: 'PASS' }, { localizedText: 'override' }, { volumeDeltaDb: Infinity }, { channels: '2' }, { subtitles: [{}] }, { file: {} }, { numberContext: 'ignore' }])('拒绝非法测量结构或伪造结果 %j', value => {
  expect(() => parseDubbingQaEvidence(value)).toThrow(/数据格式/)
})
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.delete())) })
async function setup() {
  const db = new DubbingWorkbenchDatabase(`qa-checklist-${crypto.randomUUID()}`); databases.push(db)
  const repository = new DubbingWorkbenchRepository(db), project = makeProjectFixture()
  const intake = await repository.intake(resolveDubbingSource(project, { type: 'node', id: 'shot-1' }), { sourceAssetId: 'original', episodeNumber: 1, shotNumber: 1, startMs: 0, endMs: 1000, originalDialogue: '你好', localizedDialogue: 'Hello', framing: '', camera: '' })
  return { repository, project, shotId: intake.shotId, state: await repository.submit(project.id, intake.workspace.version, intake.shotId) }
}
test('P0不再足够；全项和逐集确认后才生成快照，持久化且批准保留依据', async () => {
  let { repository, project, state, shotId } = await setup()
  const rules = loadDubbingQaTemplate().rules
  state = await repository.checkQa(project.id, state.version, shotId, rules.filter(r => r.level === 'P0').map(r => r.standardId))
  await expect(repository.approve(project.id, state.version, shotId)).rejects.toThrow(/自审确认表/)
  await expect(repository.confirmChecklist(project.id, state.version, shotId)).rejects.toThrow(/全部子项/)
  state = await repository.checkQa(project.id, state.version, shotId, rules.map(r => r.standardId))
  await expect(repository.confirmChecklist(project.id, state.version, shotId)).rejects.toThrow(/逐集排查/)
  state = await repository.checkQaCategories(project.id, state.version, shotId, [...DUBBING_QA_CATEGORIES])
  state = await repository.confirmChecklist(project.id, state.version, shotId)
  expect(state.shots[0].qa.confirmation?.text).toContain('自审确认表')
  expect(state.shots[0].qa.confirmation?.text).toContain('待人工确认')
  expect((await repository.load(project.id)).shots[0].qa.confirmation).toEqual(state.shots[0].qa.confirmation)
  state = await repository.approve(project.id, state.version, shotId)
  expect(state.shots[0].qaHistory[0].confirmation?.text).toContain('字幕')
})
test('自动FAIL不能靠全勾选绕过，修改数据和方案使旧确认失效，拒绝非法元数据', async () => {
  let { repository, project, state, shotId } = await setup()
  state = await repository.checkQa(project.id, state.version, shotId, loadDubbingQaTemplate().rules.map(r => r.standardId))
  state = await repository.checkQaCategories(project.id, state.version, shotId, [...DUBBING_QA_CATEGORIES])
  state = await repository.saveQaEvidence(project.id, state.version, shotId, { channels: 1 })
  state = await repository.checkQa(project.id, state.version, shotId, loadDubbingQaTemplate().rules.map(r => r.standardId))
  state = await repository.checkQaCategories(project.id, state.version, shotId, [...DUBBING_QA_CATEGORIES])
  await expect(repository.confirmChecklist(project.id, state.version, shotId)).rejects.toThrow(/FAIL/)
  state = await repository.saveQaEvidence(project.id, state.version, shotId, { channels: 2 })
  state = await repository.checkQa(project.id, state.version, shotId, loadDubbingQaTemplate().rules.map(r => r.standardId))
  state = await repository.checkQaCategories(project.id, state.version, shotId, [...DUBBING_QA_CATEGORIES])
  state = await repository.confirmChecklist(project.id, state.version, shotId)
  await expect(repository.saveQaEvidence(project.id, state.version, shotId, { subtitles: [{ startMs: 0 }] })).rejects.toThrow(/数据格式/)
  state = await repository.savePlan(project.id, state.version, { id: 'p', dramaId: project.id, targetLanguage: 'es', names: [], replacements: [], textReplacements: [] })
  expect(state.shots[0].qa.checkedIds).toEqual([])
  await expect(repository.approve(project.id, state.version, shotId)).rejects.toThrow(/自审确认表/)
})
