import { createDubbingShotRecord, transitionDubbingShot } from '../dubbing-shot-record'
import { createDubbingLocalizationPlan } from '../dubbing-localization-plan'
import { createDubbingQaConfirmation, dubbingQaSignature, type DubbingQaEvidence } from '../dubbing-qa-checklist'
import { DUBBING_QA_CATEGORIES, loadDubbingQaTemplate } from '../dubbing-qa-standard'
import { DUBBING_EXTERNAL_CHECKS } from '../dubbing-delivery'
import { emptyDubbingWorkspace } from '../dubbing-workbench-model'

/** Synthetic measurements for isolated tests only; never copied into product defaults. */
export const deliveryQaFixture = (): DubbingQaEvidence => ({ episodeNames: ['EP001'], expectedEpisodeCount: 1,
  subtitles: [{ startMs: 0, endMs: 1000, text: 'Hello', box: { x: .1, y: .7, width: .8, height: .1 } }],
  lipSyncOffsetsSeconds: [.3], volumeDeltaDb: 3, volumeReference: 'fixture meter baseline', channels: 2,
  file: { width: 1080, height: 1920, codec: 'H.264', bitrateMbps: 25, fps: 30, container: 'mp4', colorSpace: 'Rec709' } })
export const externalDeliveryFixture = () => ({ reportReference: 'fixture-only/report.json', fileReference: 'fixture-only/EP001.mp4', reviewer: 'fixture-reviewer', checkedIds: DUBBING_EXTERNAL_CHECKS.map(c => c.id) })
export function approvedDeliveryFixture(projectId = 'delivery-project') {
  const state = emptyDubbingWorkspace(projectId), at = '2026-09-01T10:00:00.000Z'
  state.plan = createDubbingLocalizationPlan({ id: 'plan-1', dramaId: state.projectId, targetLanguage: 'en-US', names: [], replacements: [], textReplacements: [] })
  const draft = createDubbingShotRecord({ id: 'shot-1', dramaId: state.projectId, episodeId: 'ep-1', episodeNumber: 1, shotNumber: 1, sourceAssetId: 'original', sourceTimecode: { startMs: 0, endMs: 1000 }, createdAt: at,
    content: { originalDialogue: '你好', localizedDialogue: 'Hello', framing: '', camera: '', referenceAssetIds: [] } })
  const record = transitionDubbingShot(draft, { id: 'submit-1', actorId: 'fixture-reviewer', at, type: 'submit-generation', version: { id: 'version-1', assetIds: ['result-1'], providerId: 'fixture', requestId: 'fixture-1' } })
  state.shots.push({ record, sourceKeys: [], sourceNodeId: 'node-1', sourceTitle: '测试镜头', assets: [], pending: null,
    qa: { versionId: 'version-1', checkedIds: loadDubbingQaTemplate().rules.map(r => r.standardId), checkedCategories: [...DUBBING_QA_CATEGORIES], evidence: deliveryQaFixture() }, qaHistory: [] })
  const shot = state.shots[0]
  shot.qa.confirmation = createDubbingQaConfirmation(state, shot, at)
  shot.record = transitionDubbingShot(record, { id: 'approve-1', actorId: 'fixture-reviewer', at, type: 'approve', versionId: 'version-1', selfReviewId: 'review-1' })
  shot.qaHistory.push({ id: 'review-1', versionId: 'version-1', at, checkedIds: [...shot.qa.checkedIds], confirmation: structuredClone(shot.qa.confirmation) })
  shot.deliveryEvidence = { ...externalDeliveryFixture(), signature: dubbingQaSignature(state, shot), at }
  return state
}
