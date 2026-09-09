import { afterEach, describe, expect, it } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { DubbingWorkbenchDatabase, DubbingWorkbenchRepository } from './dubbing-workbench-repository'
import { resolveDubbingSource } from './dubbing-canvas-adapter'
import { DUBBING_QA_CATEGORIES, loadDubbingQaTemplate } from './dubbing-qa-standard'

const databases: DubbingWorkbenchDatabase[] = []
function setup() {
  const db = new DubbingWorkbenchDatabase(`dubbing-ui-${crypto.randomUUID()}`)
  databases.push(db)
  return { db, repository: new DubbingWorkbenchRepository(db), project: makeProjectFixture() }
}
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.delete())) })
const intake = { sourceAssetId: 'original-episode-1', episodeNumber: 1, shotNumber: 1, startMs: 0, endMs: 2000, originalDialogue: '你好', localizedDialogue: 'Hello', framing: '中景', camera: '固定' }

describe('转绘工作台独立持久化', () => {
  it('节点与历史送审解析相同资产，去重且不写回画布，重开和跨项目隔离', async () => {
    const { repository, db, project } = setup(), original = structuredClone(project)
    const nodeSource = resolveDubbingSource(project, { type: 'node', id: 'shot-1' })
    const jobSource = resolveDubbingSource(project, { type: 'history', id: 'generation-job-shot-1' })
    const first = await repository.intake(nodeSource, intake)
    const repeated = await repository.intake(jobSource, intake)
    expect(repeated.shotId).toBe(first.shotId)
    const restored = await new DubbingWorkbenchRepository(db).load(project.id)
    expect(restored.shots).toHaveLength(1)
    expect(restored.shots[0].record.status).toBe('待生成')
    expect(restored.shots[0].record.sourceAssetId).toBe('original-episode-1')
    expect(restored.shots[0].assets[0].id).toBe('asset-shot-river-v1')
    expect((await repository.load('other')).shots).toEqual([])
    expect(project).toEqual(original)
  })

  it('自审勾选绑定版本；三轮返修保留意见，新版本清空勾选，第四轮拒绝', async () => {
    const { repository, project } = setup()
    let { workspace: state, shotId } = await repository.intake(resolveDubbingSource(project, { type: 'node', id: 'shot-1' }), intake)
    const p0 = loadDubbingQaTemplate().rules.map(rule => rule.standardId)
    for (let round = 0; round <= 3; round++) {
      state = await repository.submit(project.id, state.version, shotId)
      expect(state.shots[0].qa.checkedIds).toEqual([])
      expect(state.shots[0].qa.confirmation).toBeUndefined()
      expect(state.shots[0].qa.checkedCategories).toBeUndefined()
      await expect(repository.approve(project.id, state.version, shotId)).rejects.toThrow(/P0/)
      state = await repository.checkQa(project.id, state.version, shotId, p0)
      state = await repository.checkQaCategories(project.id, state.version, shotId, [...DUBBING_QA_CATEGORIES])
      state = await repository.confirmChecklist(project.id, state.version, shotId)
      state = await repository.approve(project.id, state.version, shotId)
      if (round === 3) break
      state = await repository.revise(project.id, state.version, shotId, `意见 ${round}`, [p0[0]])
      const asset = { ...project.assets[0], id: `repair-${round}` }
      const source = { ...resolveDubbingSource(project, { type: 'node', id: 'shot-1' }), asset }
      state = (await repository.intake(source, intake, shotId)).workspace
    }
    await expect(repository.revise(project.id, state.version, shotId, '第四次', [p0[0]])).rejects.toThrow(/3 次/)
    expect(state.shots[0].record.revisions).toHaveLength(3)
    expect(state.shots[0].record.generationVersions).toHaveLength(4)
    expect(state.shots[0].qaHistory).toHaveLength(4)
    expect(state.shots[0].qaHistory.every(entry => entry.confirmation?.text.includes('自审确认表'))).toBe(true)
    state = await repository.deliver(project.id, state.version, shotId, '交付包 EP001')
    expect((await repository.load(project.id)).shots[0].record.status).toBe('已交付')
  })

  it('版本乐观锁避免连续点击重复提交，非法意见与标准不污染记录', async () => {
    const { repository, project } = setup()
    const { workspace, shotId } = await repository.intake(resolveDubbingSource(project, { type: 'node', id: 'shot-1' }), intake)
    const results = await Promise.allSettled([repository.submit(project.id, workspace.version, shotId), repository.submit(project.id, workspace.version, shotId)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const current = await repository.load(project.id)
    expect(current.shots[0].record.generationVersions).toHaveLength(1)
    await expect(repository.revise(project.id, current.version, shotId, ' ', ['DB-QA-SOUND-01'])).rejects.toThrow(/意见/)
    await expect(repository.revise(project.id, current.version, shotId, '修口型', ['unknown'])).rejects.toThrow(/标准/)
    expect((await repository.load(project.id)).version).toBe(current.version)
  })

  it('姓名冲突不保存；方案独立保存，时间码错误与未成功历史禁止送审', async () => {
    const { repository, project } = setup()
    const plan = { id: 'plan', dramaId: project.id, targetLanguage: 'en-US', names: [], replacements: [], textReplacements: [] }
    const saved = await repository.savePlan(project.id, 0, plan)
    expect(saved.plan?.targetLanguage).toBe('en-US')
    const person = { characterId: 'r', originalName: '甲', givenName: 'Amy', familyName: 'Smith' }
    await expect(repository.savePlan(project.id, saved.version, { ...plan, names: [person, person] })).rejects.toThrow(/唯一/)
    await expect(repository.intake(resolveDubbingSource(project, { type: 'node', id: 'shot-1' }), { ...intake, endMs: 0 })).rejects.toThrow(/时间码/)
    project.jobs[0].status = 'failed'
    expect(() => resolveDubbingSource(project, { type: 'history', id: project.jobs[0].id })).toThrow(/成功/)
    expect(() => resolveDubbingSource(project, { type: 'node', id: 'missing' })).toThrow(/节点/)
  })
})
