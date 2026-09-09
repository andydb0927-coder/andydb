import { afterEach, expect, test } from 'vitest'
import { checkDubbingDelivery, createDubbingDeliveryPackage, DUBBING_EXTERNAL_CHECKS, parseDubbingExternalEvidence } from './dubbing-delivery'
import { createDubbingQaConfirmation, dubbingQaSignature } from './dubbing-qa-checklist'
import { approvedDeliveryFixture, externalDeliveryFixture } from './__fixtures__/dubbing-delivery.fixture'
import { DubbingWorkbenchDatabase, DubbingWorkbenchRepository } from './dubbing-workbench-repository'

const scope = { type: 'episode' as const, episodeNumber: 1 }
const databases: DubbingWorkbenchDatabase[] = []
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.delete())) })
test('运行全部自动项并保留人工WARN，导出含版本、自审表、集号与外部证据的独立快照', () => {
  const state = approvedDeliveryFixture()
  const check = checkDubbingDelivery(state, scope, 1)
  expect(check.blockers).toEqual([])
  expect(check.shots[0].results.filter(r => !r.checkId.startsWith('rule:'))).toHaveLength(11)
  expect(check.shots[0].results.filter(r => r.checkId.startsWith('rule:')).every(r => r.result === 'WARN')).toBe(true)
  const result = createDubbingDeliveryPackage(state, scope, 1, '交付/EP001-v1', '2026-09-10T10:00:00.000Z', 'package-1')
  expect(result.episodeNames).toEqual(['EP001'])
  expect(result.shots[0]).toMatchObject({ versionId: 'version-1', selfReviewId: 'review-1', deliveryReference: '交付/EP001-v1' })
  expect(result.shots[0].confirmation.text).toContain('自审确认表')
  state.shots[0].deliveryEvidence!.reportReference = 'changed'
  expect(result.shots[0].externalEvidence.reportReference).not.toBe('changed')
})
test.each(['missing', 'fail', 'lip-warning', 'stale', 'external', 'pending'] as const)('阻止 %s，不能用人工勾选覆盖自动异常', reason => {
  const state = approvedDeliveryFixture(), shot = state.shots[0]
  if (reason === 'missing') delete shot.qa.evidence
  if (reason === 'fail') shot.qa.evidence!.channels = 1
  if (reason === 'lip-warning') shot.qa.evidence!.lipSyncOffsetsSeconds = [.4]
  if (reason === 'stale') shot.record = { ...shot.record, content: { ...shot.record.content, localizedDialogue: 'Changed' } }
  if (reason === 'external') delete shot.deliveryEvidence
  if (reason === 'pending') shot.record = { ...shot.record, status: '待自审', approval: null }
  expect(checkDubbingDelivery(state, scope, 1).blockers.length).toBeGreaterThan(0)
  expect(() => createDubbingDeliveryPackage(state, scope, 1, 'x', '2026-09-10T10:00:00.000Z', 'id')).toThrow(/交付检查未通过/)
})
test('从实际剧集计算连续性，伪造元数据集名、空范围、错误预期总集数均不能绕过', () => {
  const state = approvedDeliveryFixture()
  state.shots[0].record = { ...state.shots[0].record, episodeNumber: 2 }
  expect(checkDubbingDelivery(state, { type: 'shot', shotId: 'shot-1' }, 1).blockers.join()).toContain('连续')
  expect(checkDubbingDelivery(state, { type: 'episode', episodeNumber: 3 }, 2).blockers.join()).toContain('没有镜头')
  expect(checkDubbingDelivery(approvedDeliveryFixture(), scope, 2).blockers.join()).toContain('预期')
})
test('整集范围不能遗漏未通过镜头，镜头范围只包含所选镜头', () => {
  const state = approvedDeliveryFixture(), second = structuredClone(state.shots[0])
  second.record = { ...second.record, id: 'shot-2', shotNumber: 2, status: '待生成', approval: null }
  state.shots.push(second)
  expect(checkDubbingDelivery(state, scope, 1).shots).toHaveLength(2)
  expect(checkDubbingDelivery(state, scope, 1).blockers.join()).toContain('尚未自审通过')
  expect(checkDubbingDelivery(state, { type: 'shot', shotId: 'shot-1' }, 1).shots).toHaveLength(1)
})
test.each([null, {}, { ...externalDeliveryFixture(), reviewer: ' ' }, { ...externalDeliveryFixture(), checkedIds: ['file'] }, { ...externalDeliveryFixture(), checkedIds: ['file', 'file', 'file', 'file', 'file', 'file'] }])('外部记录拒绝缺项、重复勾选或空核验人 %j', input => {
  expect(() => parseDubbingExternalEvidence(input)).toThrow(/外部检测记录无效/)
})
test('多个镜头整集交付原子保存；任一镜头未通过时无部分写入', async () => {
  const db = new DubbingWorkbenchDatabase(`delivery-episode-${crypto.randomUUID()}`); databases.push(db)
  const repo = new DubbingWorkbenchRepository(db), state = approvedDeliveryFixture()
  const second = structuredClone(state.shots[0])
  second.record = { ...second.record, id: 'shot-2', shotNumber: 2 }
  state.shots.push(second)
  // Both reviews must bind the complete episode, not an earlier one-shot workspace.
  for (const shot of state.shots) {
    shot.qa.confirmation = createDubbingQaConfirmation(state, shot, '2026-09-10T10:00:00.000Z')
    shot.qaHistory[0].confirmation = structuredClone(shot.qa.confirmation)
    shot.deliveryEvidence!.signature = dubbingQaSignature(state, shot)
  }
  delete second.deliveryEvidence
  await db.workspaces.put(state)
  await expect(repo.exportDelivery(state.projectId, state.version, scope, 1, 'full-episode')).rejects.toThrow(/交付检查/)
  expect((await repo.load(state.projectId)).shots.every(s => s.record.status === '已通过')).toBe(true)
  expect((await repo.load(state.projectId)).deliveryPackages).toBeUndefined()
  const ready = await repo.saveDeliveryEvidence(state.projectId, state.version, 'shot-2', externalDeliveryFixture())
  const result = await repo.exportDelivery(state.projectId, ready.version, scope, 1, 'full-episode')
  expect(result.shots.every(s => s.record.status === '已交付')).toBe(true)
  expect(result.deliveryPackages![0].shots.map(s => s.shotId)).toEqual(['shot-1', 'shot-2'])
})
test('仓储也强制检查，外部证据保存与交付清单重开可恢复，重复点击不重复交付', async () => {
  const db = new DubbingWorkbenchDatabase(`delivery-${crypto.randomUUID()}`); databases.push(db)
  const repo = new DubbingWorkbenchRepository(db), state = approvedDeliveryFixture()
  delete state.shots[0].deliveryEvidence
  await db.workspaces.put(state)
  await expect(repo.deliver(state.projectId, state.version, 'shot-1', 'x')).rejects.toThrow(/交付检查/)
  await expect(repo.saveDeliveryEvidence(state.projectId, state.version, 'shot-1', { reportReference: 'x' })).rejects.toThrow(/外部检测/)
  const saved = await repo.saveDeliveryEvidence(state.projectId, state.version, 'shot-1', externalDeliveryFixture())
  expect(saved.shots[0].deliveryEvidence?.checkedIds).toHaveLength(DUBBING_EXTERNAL_CHECKS.length)
  const calls = await Promise.allSettled([1, 2].map(() => repo.exportDelivery(state.projectId, saved.version, scope, 1, 'EP001-package')))
  expect(calls.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  const restored = await new DubbingWorkbenchRepository(db).load(state.projectId)
  expect(restored.deliveryPackages).toHaveLength(1)
  expect(restored.shots[0].record.status).toBe('已交付')
  expect(restored.deliveryPackages![0].shots[0].selfReviewId).toBe('review-1')
  expect(restored.shots[0].record.revisions).toEqual(state.shots[0].record.revisions)
})
