import Dexie, { type Table } from 'dexie'
import { createDubbingShotRecord, transitionDubbingShot, type DubbingShotContent, type DubbingShotEvent } from './dubbing-shot-record'
import { createDubbingLocalizationPlan, type DubbingLocalizationPlanInput } from './dubbing-localization-plan'
import { DUBBING_QA_CATEGORIES, loadDubbingQaTemplate } from './dubbing-qa-standard'
import { createDubbingQaConfirmation, dubbingConfirmationCurrent, parseDubbingQaEvidence } from './dubbing-qa-checklist'
import { dubbingAssert, dubbingText, dubbingUniqueIds } from './dubbing-domain-validation'
import { emptyDubbingWorkspace, type DubbingIntakeFields, type DubbingReviewSource, type DubbingWorkbenchShot, type DubbingWorkspace } from './dubbing-workbench-model'

export class DubbingWorkbenchDatabase extends Dexie {
  workspaces!: Table<DubbingWorkspace, string>
  constructor(name = 'wireless-canvas-dubbing-v1') {
    super(name)
    this.version(1).stores({ workspaces: 'projectId' })
  }
}
function shotAt(state: DubbingWorkspace, id: string): DubbingWorkbenchShot {
  const shot = state.shots.find(item => item.record.id === id)
  dubbingAssert(shot, '镜头不存在，请重新选择。')
  return shot
}
function validateStandards(ids: string[]) {
  dubbingUniqueIds(ids, 'QA 标准')
  const known = new Set(loadDubbingQaTemplate().rules.map(rule => rule.standardId))
  dubbingAssert(ids.every(id => known.has(id)), '包含未知 QA 标准。')
}
function metadata(shot: DubbingWorkbenchShot) {
  return { id: crypto.randomUUID(), actorId: 'local-reviewer', at: new Date(Math.max(Date.now(), Date.parse(shot.record.updatedAt) + 1)).toISOString() }
}
function advance(shot: DubbingWorkbenchShot, event: DubbingShotEvent) { shot.record = transitionDubbingShot(shot.record, event) }

export class DubbingWorkbenchRepository {
  private readonly database: DubbingWorkbenchDatabase
  constructor(database = new DubbingWorkbenchDatabase()) { this.database = database }
  async load(projectId: string): Promise<DubbingWorkspace> {
    const state = await this.database.workspaces.get(projectId) ?? emptyDubbingWorkspace(projectId)
    dubbingAssert(state.namespace === 'dubbing.workspace' && state.schemaVersion === 1 && Array.isArray(state.shots), '工作台记录版本不受支持，请保留数据并联系维护人员。')
    return structuredClone(state)
  }
  private async mutate(projectId: string, expectedVersion: number, change: (state: DubbingWorkspace) => void) {
    return this.database.transaction('rw', this.database.workspaces, async () => {
      const state = await this.load(projectId)
      dubbingAssert(state.version === expectedVersion, '工作台已在另一处更新，请刷新后重试。')
      change(state)
      state.version += 1
      await this.database.workspaces.put(structuredClone(state))
      return state
    })
  }
  async intake(source: DubbingReviewSource, fields: DubbingIntakeFields, targetShotId?: string) {
    return this.database.transaction('rw', this.database.workspaces, async () => {
      dubbingText(source.projectId, '项目 ID')
      dubbingText(source.asset.id, '结果资产')
      dubbingText(source.asset.url, '结果地址')
      dubbingAssert(!source.asset.url.startsWith('blob:'), '临时结果地址不能持久化，请先保存资产再送审。')
      const workspace = await this.load(source.projectId)
      const sourceKey = JSON.stringify([source.nodeId, source.asset.id])
      const existing = workspace.shots.find(item => item.sourceKeys.includes(sourceKey))
      if (existing) {
        dubbingAssert(!targetShotId || existing.record.id === targetShotId, '该结果已送审到其他镜头，请打开原镜头。')
        return { workspace, shotId: existing.record.id }
      }
      let shot: DubbingWorkbenchShot
      if (targetShotId) {
        shot = shotAt(workspace, targetShotId)
        dubbingAssert(['待生成', '待返修'].includes(shot.record.status), '当前镜头状态不允许添加待提交结果。')
        dubbingAssert(!shot.pending, '镜头已有待提交结果，请先处理当前结果。')
        dubbingAssert(!shot.record.generationVersions.some(version => version.assetIds.includes(source.asset.id)), '该资产已经提交过，请选择新的返修结果。')
        shot.sourceKeys.push(sourceKey)
        shot.pending = structuredClone(source)
      } else {
        dubbingAssert(!workspace.shots.some(item => item.record.episodeNumber === fields.episodeNumber && item.record.shotNumber === fields.shotNumber), '该集镜号已存在，请选择已有镜头或调整镜号。')
        const id = crypto.randomUUID()
        const record = createDubbingShotRecord({ id, dramaId: source.projectId, episodeId: `${source.projectId}:ep:${fields.episodeNumber}`,
          episodeNumber: fields.episodeNumber, shotNumber: fields.shotNumber, sourceAssetId: fields.sourceAssetId,
          sourceTimecode: { startMs: fields.startMs, endMs: fields.endMs }, createdAt: new Date().toISOString(),
          content: { originalDialogue: fields.originalDialogue, localizedDialogue: fields.localizedDialogue, framing: fields.framing, camera: fields.camera,
            referenceAssetIds: [...new Set(source.referenceAssets.map(asset => asset.id))] } })
        shot = { record, sourceKeys: [sourceKey], sourceNodeId: source.nodeId, sourceTitle: source.title, assets: [],
          pending: structuredClone(source), qa: { versionId: null, checkedIds: [] }, qaHistory: [] }
        workspace.shots.push(shot)
      }
      for (const asset of [source.asset, ...source.referenceAssets]) if (!shot.assets.some(item => item.id === asset.id)) shot.assets.push(structuredClone(asset))
      workspace.version += 1
      await this.database.workspaces.put(workspace)
      return { workspace: structuredClone(workspace), shotId: shot.record.id }
    })
  }
  submit(projectId: string, version: number, shotId: string) {
    return this.mutate(projectId, version, state => {
      const shot = shotAt(state, shotId), source = shot.pending
      dubbingAssert(source, '请从画布或历史送入新的生成结果。')
      const versionId = crypto.randomUUID()
      advance(shot, { ...metadata(shot), type: 'submit-generation', version: { id: versionId, assetIds: [source.asset.id], providerId: source.providerId, requestId: source.requestId } })
      shot.pending = null
      shot.qa = { versionId, checkedIds: [] }
    })
  }
  checkQa(projectId: string, version: number, shotId: string, ids: string[]) {
    return this.mutate(projectId, version, state => {
      const shot = shotAt(state, shotId)
      dubbingAssert(shot.record.status === '待自审', '仅待自审版本可以修改 QA 勾选。')
      validateStandards(ids)
      shot.qa.checkedIds = [...ids]
      delete shot.qa.confirmation
    })
  }
  checkQaCategories(projectId: string, version: number, shotId: string, categories: string[]) {
    return this.mutate(projectId, version, state => {
      const shot = shotAt(state, shotId)
      dubbingAssert(shot.record.status === '待自审', '仅待自审版本可以修改逐集排查。')
      dubbingAssert(categories.every(category => DUBBING_QA_CATEGORIES.some(known => known === category)), '未知 QA 分类。')
      shot.qa.checkedCategories = [...new Set(categories)]
      delete shot.qa.confirmation
    })
  }
  saveQaEvidence(projectId: string, version: number, shotId: string, input: unknown) {
    return this.mutate(projectId, version, state => {
      const shot = shotAt(state, shotId)
      dubbingAssert(shot.record.status === '待自审', '仅待自审版本可以修改检测数据。')
      shot.qa.evidence = parseDubbingQaEvidence(input)
      shot.qa.checkedIds = []; shot.qa.checkedCategories = []
      delete shot.qa.confirmation
    })
  }
  confirmChecklist(projectId: string, version: number, shotId: string) {
    return this.mutate(projectId, version, state => {
      const shot = shotAt(state, shotId)
      dubbingAssert(shot.record.status === '待自审', '仅待自审版本可以生成确认表。')
      shot.qa.confirmation = createDubbingQaConfirmation(state, shot, new Date().toISOString())
    })
  }
  approve(projectId: string, version: number, shotId: string) {
    return this.mutate(projectId, version, state => {
      const shot = shotAt(state, shotId), latest = shot.record.generationVersions.at(-1)
      dubbingAssert(latest && shot.qa.versionId === latest.id, '请先提交当前生成结果。')
      dubbingAssert(dubbingConfirmationCurrent(state, shot), '请完成全部 P0/P1/P2 子项、九节逐集排查并生成当前版本的自审确认表。')
      createDubbingQaConfirmation(state, shot, new Date().toISOString())
      const event = metadata(shot), selfReviewId = crypto.randomUUID()
      advance(shot, { ...event, type: 'approve', versionId: latest.id, selfReviewId })
      shot.qaHistory.push({ id: selfReviewId, versionId: latest.id, checkedIds: [...shot.qa.checkedIds], at: event.at, confirmation: structuredClone(shot.qa.confirmation) })
    })
  }
  revise(projectId: string, version: number, shotId: string, feedback: string, standardIds: string[]) {
    return this.mutate(projectId, version, state => {
      const shot = shotAt(state, shotId)
      dubbingText(feedback, '返修意见')
      dubbingAssert(standardIds.length > 0, '请至少选择一条 QA 标准。')
      validateStandards(standardIds)
      advance(shot, { ...metadata(shot), type: 'request-revision', feedback: feedback.trim(), standardIds })
    })
  }
  deliver(projectId: string, version: number, shotId: string, reference: string) {
    return this.mutate(projectId, version, state => {
      const shot = shotAt(state, shotId)
      advance(shot, { ...metadata(shot), type: 'deliver', deliveryReference: reference.trim() })
    })
  }
  editContent(projectId: string, version: number, shotId: string, content: DubbingShotContent) {
    return this.mutate(projectId, version, state => {
      const shot = shotAt(state, shotId)
      advance(shot, { ...metadata(shot), type: 'edit-content', content })
    })
  }
  savePlan(projectId: string, version: number, input: DubbingLocalizationPlanInput) {
    return this.mutate(projectId, version, state => {
      dubbingAssert(input.dramaId === projectId, '本地化方案不属于当前项目。')
      state.plan = createDubbingLocalizationPlan(input)
      for (const shot of state.shots) if (shot.record.status === '待自审') {
        shot.qa.checkedIds = []; shot.qa.checkedCategories = []; delete shot.qa.confirmation
      }
    })
  }
}
export const defaultDubbingRepository = new DubbingWorkbenchRepository()
