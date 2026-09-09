import { describe, expect, it } from 'vitest'
import { createDubbingShotRecord, transitionDubbingShot, type DubbingShotEvent } from './dubbing-shot-record'

const at = (second: number) => new Date(Date.UTC(2026, 8, 5, 0, 0, second)).toISOString()
const content = () => ({ originalDialogue: '你终于回来了。', localizedDialogue: 'You finally came back.',
  framing: '中景', camera: '侧面固定机位', referenceAssetIds: ['character-1', 'scene-1'] })
const shot = () => createDubbingShotRecord({ id: 'shot-1', dramaId: 'drama-1', episodeId: 'episode-1',
  episodeNumber: 1, shotNumber: 3, sourceAssetId: 'original-video', sourceTimecode: { startMs: 1250, endMs: 5500 },
  content: content(), createdAt: at(0) })
const submit = (n: number): Extract<DubbingShotEvent, { type: 'submit-generation' }> => ({ type: 'submit-generation', id: `submit-${n}`, actorId: 'operator', at: at(n * 3 + 1),
  version: { id: `version-${n}`, assetIds: [`result-${n}`], providerId: 'fixture-provider', requestId: `request-${n}` } })
const revision = (n: number): Extract<DubbingShotEvent, { type: 'request-revision' }> => ({ type: 'request-revision', id: `revision-${n}`, actorId: 'reviewer', at: at(n * 3 + 2),
  feedback: `第${n + 1}次反馈：修正口型并全片复查`, standardIds: ['DB-QA-SOUND-01'] })
const approve = (n = 0): Extract<DubbingShotEvent, { type: 'approve' }> => ({ type: 'approve', id: 'approval-1', actorId: 'reviewer', at: at(20),
  versionId: `version-${n}`, selfReviewId: 'self-review-1' })
const deliver: DubbingShotEvent = { type: 'deliver', id: 'delivery-1', actorId: 'operator', at: at(21), deliveryReference: 'delivery-package-1' }

describe('出海镜头审核领域', () => {
  it('保存剧集、原片毫秒时间码、双语台词、机位和资产引用，不附加画布主类型', () => {
    expect(shot()).toMatchObject({ namespace: 'dubbing.shot', schemaVersion: 1, dramaId: 'drama-1',
      episodeId: 'episode-1', episodeNumber: 1, shotNumber: 3, status: '待生成', revisionCount: 0,
      sourceTimecode: { startMs: 1250, endMs: 5500 }, content: content(), generationVersions: [], revisions: [] })
    expect(shot()).not.toHaveProperty('kind')
  })

  it('生成只进入待自审，显式审核通过后才能交付', () => {
    const generated = transitionDubbingShot(shot(), submit(0))
    expect(generated.status).toBe('待自审')
    const approved = transitionDubbingShot(generated, approve())
    expect(approved.status).toBe('已通过')
    const delivered = transitionDubbingShot(approved, deliver)
    expect(delivered.status).toBe('已交付')
    expect(delivered.approval).toMatchObject({ versionId: 'version-0', selfReviewId: 'self-review-1', actorId: 'reviewer' })
    expect(delivered.delivery).toMatchObject({ versionId: 'version-0', reference: 'delivery-package-1' })
  })

  it('三轮返修均保留原版本和意见，第三轮修复后仍能通过与交付，第四次退回被阻止', () => {
    let current = transitionDubbingShot(shot(), submit(0))
    for (let n = 0; n < 3; n += 1) {
      current = transitionDubbingShot(current, revision(n))
      expect(current.status).toBe('待返修')
      expect(current.revisionCount).toBe(n + 1)
      current = transitionDubbingShot(current, submit(n + 1))
    }
    const before = structuredClone(current)
    expect(() => transitionDubbingShot(current, revision(3))).toThrow(/最多返修 3 次/)
    expect(current).toEqual(before)
    expect(current.generationVersions.map(v => v.id)).toEqual(['version-0', 'version-1', 'version-2', 'version-3'])
    expect(current.revisions.map(r => [r.id, r.round, r.baseVersionId])).toEqual([
      ['revision-0', 1, 'version-0'], ['revision-1', 2, 'version-1'], ['revision-2', 3, 'version-2'],
    ])
    expect(current.generationVersions[3].revisionId).toBe('revision-2')
    expect(transitionDubbingShot(transitionDubbingShot(current, approve(3)), deliver).status).toBe('已交付')
  })

  it('编辑返修草稿不消耗额外轮次，版本冻结其台词与引用快照', () => {
    const original = shot()
    const generated = transitionDubbingShot(original, submit(0))
    const rejected = transitionDubbingShot(generated, revision(0))
    const nextContent = { ...content(), localizedDialogue: 'Welcome back.', referenceAssetIds: ['character-2'] }
    const edited = transitionDubbingShot(rejected, { type: 'edit-content', id: 'edit-1', actorId: 'editor', at: at(3), content: nextContent })
    nextContent.referenceAssetIds.push('should-not-leak')
    const resubmitted = transitionDubbingShot(edited, submit(1))
    expect(resubmitted.revisionCount).toBe(1)
    expect(resubmitted.generationVersions[0].contentSnapshot).toEqual(content())
    expect(resubmitted.generationVersions[1].contentSnapshot.referenceAssetIds).toEqual(['character-2'])
    expect(resubmitted.revisions).toEqual(rejected.revisions)
    expect(original.status).toBe('待生成')
    expect(generated.generationVersions).toHaveLength(1)
  })

  it('已通过后再返修会撤销当前批准，但保留历史批准事件', () => {
    const approved = transitionDubbingShot(transitionDubbingShot(shot(), submit(0)), approve())
    const reopened = transitionDubbingShot(approved, { ...revision(0), at: at(21) })
    expect(reopened.approval).toBeNull()
    expect(reopened.events.some(e => e.type === 'approve')).toBe(true)
    expect(() => transitionDubbingShot(reopened, { ...deliver, at: at(22) })).toThrow(/状态/)
  })

  it.each(['approve', 'deliver', 'request-revision'] as const)('未生成不得执行 %s', type => {
    const event = type === 'approve' ? approve() : type === 'deliver' ? deliver : revision(0)
    expect(() => transitionDubbingShot(shot(), event)).toThrow(/状态/)
  })

  it('返修必须提交新版本再自审，不可直接通过；交付记录为终态', () => {
    const generated = transitionDubbingShot(shot(), submit(0))
    expect(() => transitionDubbingShot(transitionDubbingShot(generated, revision(0)), approve())).toThrow(/状态/)
    const delivered = transitionDubbingShot(transitionDubbingShot(generated, approve()), deliver)
    expect(() => transitionDubbingShot(delivered, { ...revision(1), at: at(22) })).toThrow(/状态/)
  })

  it('拒绝重复事件、覆盖版本、过期批准及缺失自审凭据', () => {
    const generated = transitionDubbingShot(shot(), submit(0))
    expect(() => transitionDubbingShot(generated, submit(0))).toThrow(/重复/)
    const rejected = transitionDubbingShot(generated, revision(0))
    const sameVersion = { ...submit(1), version: { id: 'version-0', assetIds: ['other'], providerId: 'fixture-provider', requestId: 'r2' } }
    expect(() => transitionDubbingShot(rejected, sameVersion)).toThrow(/版本/)
    const next = transitionDubbingShot(rejected, submit(1))
    expect(() => transitionDubbingShot(next, approve())).toThrow(/最新版本/)
    expect(() => transitionDubbingShot(next, { ...approve(1), selfReviewId: '' } as DubbingShotEvent)).toThrow(/自审/)
  })

  it.each([[-1, 10], [10, 10], [11, 10], [0.5, 10], [0, Infinity], [NaN, 10]])('拒绝非法原片时间码 %s-%s', (startMs, endMs) => {
    expect(() => createDubbingShotRecord({ ...shot(), sourceTimecode: { startMs, endMs } })).toThrow(/时间码/)
  })

  it('拒绝空生成资产、重复引用和倒序事件时间；静默镜头允许空台词', () => {
    const silent = createDubbingShotRecord({ ...shot(), content: { ...content(), originalDialogue: '', localizedDialogue: '' } })
    expect(silent.content.originalDialogue).toBe('')
    expect(() => createDubbingShotRecord({ ...shot(), content: { ...content(), referenceAssetIds: ['x', 'x'] } })).toThrow(/重复/)
    expect(() => transitionDubbingShot(shot(), { ...submit(0), version: { id: 'v', assetIds: [], providerId: 'fixture', requestId: 'r' } })).toThrow(/资产/)
    expect(() => transitionDubbingShot(shot(), { ...submit(0), at: '2026-09-04T00:00:00.000Z' })).toThrow(/时间/)
  })

  it('JSON 往返保留业务资料；序列化后继续返修不会重置计数', () => {
    const generated = transitionDubbingShot(shot(), submit(0))
    const restored = JSON.parse(JSON.stringify(generated)) as typeof generated
    expect(restored).toEqual(generated)
    expect(transitionDubbingShot(restored, revision(0)).revisionCount).toBe(1)
    expect(() => transitionDubbingShot({ ...restored, revisionCount: 3 }, revision(0))).toThrow(/记录/)
  })

  it('拒绝缺失返修意见的损坏记录和早于创建时间的更新时间', () => {
    const generated = transitionDubbingShot(shot(), submit(0))
    expect(() => transitionDubbingShot({ ...generated, status: '待返修' }, submit(1))).toThrow(/返修记录/)
    expect(() => transitionDubbingShot({ ...shot(), updatedAt: at(-1) }, submit(0))).toThrow(/时间/)
  })
})
