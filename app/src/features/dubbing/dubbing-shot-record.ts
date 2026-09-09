import { dubbingAssert, dubbingInteger, dubbingText, dubbingTimestamp, dubbingUniqueIds } from './dubbing-domain-validation'

export const DUBBING_SHOT_REVIEW_STATUSES = ['待生成', '待自审', '待返修', '已通过', '已交付'] as const
export type DubbingShotReviewStatus = typeof DUBBING_SHOT_REVIEW_STATUSES[number]
export const DUBBING_MAX_SHOT_REVISIONS = 3

export interface DubbingShotContent {
  readonly originalDialogue: string
  readonly localizedDialogue: string
  readonly framing: string
  readonly camera: string
  readonly referenceAssetIds: readonly string[]
}

export interface DubbingShotRecordInput {
  readonly id: string
  readonly dramaId: string
  readonly episodeId: string
  readonly episodeNumber: number
  readonly shotNumber: number
  readonly sourceAssetId: string
  /** Original-media milliseconds, half-open range; independent of output duration. */
  readonly sourceTimecode: { readonly startMs: number; readonly endMs: number }
  readonly content: DubbingShotContent
  readonly createdAt: string
}

export interface DubbingGenerationVersionInput {
  readonly id: string
  readonly assetIds: readonly string[]
  readonly providerId: string
  readonly requestId: string
}

export interface DubbingGenerationVersion extends DubbingGenerationVersionInput {
  readonly createdAt: string
  readonly revisionId: string | null
  readonly contentSnapshot: DubbingShotContent
}

export interface DubbingRevisionRecord {
  readonly id: string
  readonly round: number
  readonly feedback: string
  readonly standardIds: readonly string[]
  readonly baseVersionId: string
  readonly actorId: string
  readonly at: string
}

interface DubbingEventMetadata { readonly id: string; readonly actorId: string; readonly at: string }
export type DubbingShotEvent = DubbingEventMetadata & (
  | { readonly type: 'submit-generation'; readonly version: DubbingGenerationVersionInput }
  | { readonly type: 'edit-content'; readonly content: DubbingShotContent }
  | { readonly type: 'request-revision'; readonly feedback: string; readonly standardIds: readonly string[] }
  | { readonly type: 'approve'; readonly versionId: string; readonly selfReviewId: string }
  | { readonly type: 'deliver'; readonly deliveryReference: string }
)

export interface DubbingShotRecord extends DubbingShotRecordInput {
  readonly namespace: 'dubbing.shot'
  readonly schemaVersion: 1
  readonly status: DubbingShotReviewStatus
  readonly generationVersions: readonly DubbingGenerationVersion[]
  readonly revisions: readonly DubbingRevisionRecord[]
  readonly revisionCount: number
  readonly events: readonly DubbingShotEvent[]
  readonly updatedAt: string
  readonly approval: { readonly versionId: string; readonly actorId: string; readonly at: string; readonly selfReviewId: string } | null
  readonly delivery: { readonly versionId: string; readonly reference: string; readonly actorId: string; readonly at: string } | null
}

function validateContent(content: DubbingShotContent) {
  dubbingAssert(content && typeof content === 'object', '镜头内容格式无效。')
  dubbingText(content.originalDialogue, '原台词', true)
  dubbingText(content.localizedDialogue, '本地化台词', true)
  dubbingText(content.framing, '景别', true)
  dubbingText(content.camera, '机位', true)
  dubbingUniqueIds(content.referenceAssetIds, '引用资产')
}

function validateInput(input: DubbingShotRecordInput) {
  for (const value of [input.id, input.dramaId, input.episodeId, input.sourceAssetId]) dubbingText(value, '镜头及来源标识')
  dubbingInteger(input.episodeNumber, '集号', 1, 999)
  dubbingInteger(input.shotNumber, '镜号')
  dubbingAssert(input.sourceTimecode, '原片时间码缺失。')
  dubbingInteger(input.sourceTimecode.startMs, '原片时间码起点', 0)
  dubbingInteger(input.sourceTimecode.endMs, '原片时间码终点', 1)
  dubbingAssert(input.sourceTimecode.endMs > input.sourceTimecode.startMs, '原片时间码终点必须晚于起点。')
  validateContent(input.content)
  dubbingTimestamp(input.createdAt)
}

export function createDubbingShotRecord(input: DubbingShotRecordInput): DubbingShotRecord {
  validateInput(input)
  // Pick fields explicitly: runtime callers cannot inject review state through a draft.
  return structuredClone({ namespace: 'dubbing.shot', schemaVersion: 1,
    id: input.id, dramaId: input.dramaId, episodeId: input.episodeId, episodeNumber: input.episodeNumber,
    shotNumber: input.shotNumber, sourceAssetId: input.sourceAssetId, sourceTimecode: input.sourceTimecode,
    content: input.content, createdAt: input.createdAt, updatedAt: input.createdAt,
    status: '待生成', generationVersions: [], revisions: [], revisionCount: 0, events: [], approval: null, delivery: null })
}

function validateRecord(record: DubbingShotRecord) {
  validateInput(record)
  dubbingAssert(record.namespace === 'dubbing.shot' && record.schemaVersion === 1, '镜头记录版本不受支持。')
  dubbingAssert(DUBBING_SHOT_REVIEW_STATUSES.includes(record.status), '镜头审核状态无效。')
  dubbingAssert(dubbingTimestamp(record.updatedAt) >= dubbingTimestamp(record.createdAt), '记录更新时间不能早于创建时间。')
  dubbingAssert(record.revisionCount === record.revisions.length && record.revisionCount <= DUBBING_MAX_SHOT_REVISIONS, '返修记录与计数不一致。')
  dubbingUniqueIds(record.events.map(e => e.id), '审核事件')
  dubbingUniqueIds(record.generationVersions.map(v => v.id), '生成版本')
  dubbingUniqueIds(record.revisions.map(r => r.id), '返修记录')
  const latest = record.generationVersions.at(-1)
  dubbingAssert(record.status === '待生成' ? !latest : latest, '镜头状态与生成版本记录不一致。')
  dubbingAssert(record.status !== '待返修' || record.revisions.length > 0, '待返修状态必须有对应返修记录。')
  record.revisions.forEach((revision, index) => {
    dubbingAssert(revision.round === index + 1 && record.generationVersions.some(v => v.id === revision.baseVersionId), '返修记录轮次或基准版本无效。')
  })
  if (record.status === '已通过' || record.status === '已交付') {
    dubbingAssert(record.approval?.versionId === latest?.id, '批准记录必须对应最新版本。')
    dubbingText(record.approval?.selfReviewId, '自审记录')
  }
}

function requireState(record: DubbingShotRecord, allowed: readonly DubbingShotReviewStatus[]) {
  dubbingAssert(allowed.includes(record.status), `当前状态“${record.status}”不允许此操作。`)
}

/** Pure business reducer. Provider retries and successful jobs never approve a shot. */
export function transitionDubbingShot(record: DubbingShotRecord, event: DubbingShotEvent): DubbingShotRecord {
  validateRecord(record)
  dubbingText(event.id, '审核事件标识')
  dubbingText(event.actorId, '操作人员')
  dubbingAssert(!record.events.some(e => e.id === event.id), '审核事件重复，原记录未改变。')
  dubbingAssert(dubbingTimestamp(event.at) >= dubbingTimestamp(record.updatedAt), '事件时间不能早于记录更新时间。')
  let next: DubbingShotRecord = record
  const latest = record.generationVersions.at(-1)
  switch (event.type) {
    case 'edit-content':
      requireState(record, ['待生成', '待返修'])
      validateContent(event.content)
      next = { ...record, content: event.content }
      break
    case 'submit-generation': {
      requireState(record, ['待生成', '待返修'])
      for (const value of [event.version.id, event.version.providerId, event.version.requestId]) dubbingText(value, '生成版本标识')
      dubbingUniqueIds(event.version.assetIds, '生成资产', false)
      dubbingAssert(!record.generationVersions.some(v => v.id === event.version.id), '生成版本已存在，禁止覆盖。')
      const version: DubbingGenerationVersion = { ...event.version, createdAt: event.at,
        revisionId: record.status === '待返修' ? record.revisions.at(-1)!.id : null, contentSnapshot: record.content }
      next = { ...record, status: '待自审', generationVersions: [...record.generationVersions, version], approval: null }
      break
    }
    case 'request-revision': {
      requireState(record, ['待自审', '已通过'])
      dubbingAssert(record.revisionCount < DUBBING_MAX_SHOT_REVISIONS, '每个镜头最多返修 3 次，已达到上限；原记录已保留。')
      dubbingText(event.feedback, '返修意见')
      dubbingUniqueIds(event.standardIds, '验收标准')
      const revision: DubbingRevisionRecord = { id: event.id, round: record.revisionCount + 1,
        feedback: event.feedback, standardIds: event.standardIds, baseVersionId: latest!.id, actorId: event.actorId, at: event.at }
      next = { ...record, status: '待返修', revisions: [...record.revisions, revision], revisionCount: revision.round, approval: null }
      break
    }
    case 'approve':
      requireState(record, ['待自审'])
      dubbingAssert(event.versionId === latest?.id, '只能批准最新版本。')
      dubbingText(event.selfReviewId, '自审记录')
      next = { ...record, status: '已通过', approval: { versionId: event.versionId, actorId: event.actorId, at: event.at, selfReviewId: event.selfReviewId } }
      break
    case 'deliver':
      requireState(record, ['已通过'])
      dubbingText(event.deliveryReference, '交付引用')
      next = { ...record, status: '已交付', delivery: { versionId: latest!.id, reference: event.deliveryReference, actorId: event.actorId, at: event.at } }
      break
    default: {
      const unsupported: never = event
      throw new Error(`不支持的镜头事件：${String(unsupported)}`)
    }
  }
  return structuredClone({ ...next, updatedAt: event.at, events: [...record.events, event] })
}
