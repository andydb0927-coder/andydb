import { dubbingAssert, dubbingText, dubbingTimestamp } from './dubbing-domain-validation'
import { dubbingConfirmationCurrent, dubbingQaInput, dubbingQaSignature, type DubbingQaConfirmation } from './dubbing-qa-checklist'
import { runDubbingQa, type DubbingQaResult } from './dubbing-qa-runner'
import { loadDubbingQaTemplate } from './dubbing-qa-standard'
import type { DubbingWorkspace } from './dubbing-workbench-model'

export const DUBBING_EXTERNAL_CHECKS = [
  { id: 'file', label: '实际交付文件已检测：1080×1920 / H.264 MP4 / ≥25Mbps / 25或30fps / SDR Rec709 / 双声道均有声音' },
  { id: 'sound', label: '分轨音量与完整性已核验：人声 -12~-1、音效 -30~-1、BGM -30~-18 dB，无爆音/截断，全剧波动≤±3dB' },
  { id: 'lip', label: '实际成片逐镜口型已人工核验，偏差≤0.3s（非自动口型识别）' },
  { id: 'subtitles', label: '字幕字体/版权/白字黑描边5/阴影65%/字号10/行距4/1–3行居中及客户安全框已核验' },
  { id: 'posters', label: '双海报1080×1440与1080×1920 JPEG≤10MB、对应EP集号、每集首帧固定封面已核验' },
  { id: 'handoff', label: '文件夹命名、完整集数及镜头清单、原版与修改版、飞书三栏规则已人工核验；本次不执行上传' },
] as const
export type DubbingDeliveryScope = { type: 'shot'; shotId: string } | { type: 'episode'; episodeNumber: number }
export interface DubbingExternalEvidenceInput {
  reportReference: string
  fileReference: string
  reviewer: string
  checkedIds: string[]
}
export interface DubbingExternalEvidence extends DubbingExternalEvidenceInput { signature: string; at: string }
export interface DubbingDeliveryPackage {
  namespace: 'dubbing.delivery'; schemaVersion: 1; id: string; projectId: string; createdAt: string
  scope: DubbingDeliveryScope; reference: string; expectedEpisodeCount: number; episodeNames: string[]
  notice: string
  shots: { shotId: string; episodeNumber: number; shotNumber: number; versionId: string; assetIds: string[];
    selfReviewId: string; confirmation: DubbingQaConfirmation; externalEvidence: DubbingExternalEvidence;
    results: DubbingQaResult[]; revisionCount: number; deliveryReference: string }[]
}
export function parseDubbingExternalEvidence(input: unknown): DubbingExternalEvidenceInput {
  const error = '外部检测记录无效：请提供报告引用、实际交付文件引用、核验人并完成全部核验项。'
  dubbingAssert(typeof input === 'object' && input !== null && !Array.isArray(input), error)
  const value = input as Record<string, unknown>
  dubbingAssert(['reportReference', 'fileReference', 'reviewer'].every(key => typeof value[key] === 'string' && value[key].trim().length > 0 && value[key].length <= 2000), error)
  dubbingAssert(Array.isArray(value.checkedIds) && value.checkedIds.length === DUBBING_EXTERNAL_CHECKS.length && DUBBING_EXTERNAL_CHECKS.every(check => value.checkedIds instanceof Array && value.checkedIds.includes(check.id)), error)
  return { reportReference: String(value.reportReference).trim(), fileReference: String(value.fileReference).trim(), reviewer: String(value.reviewer).trim(), checkedIds: DUBBING_EXTERNAL_CHECKS.map(check => check.id) }
}
export function checkDubbingDelivery(workspace: DubbingWorkspace, scope: DubbingDeliveryScope, expectedEpisodeCount: number) {
  const selected = workspace.shots.filter(shot => scope.type === 'shot' ? shot.record.id === scope.shotId : shot.record.episodeNumber === scope.episodeNumber)
  const episodeNames = [...new Set(workspace.shots.map(shot => shot.record.episodeNumber))].sort((a, b) => a - b).map(n => `EP${String(n).padStart(3, '0')}`)
  const blockers: string[] = []
  if (!selected.length) blockers.push('所选交付范围没有镜头。')
  const shots = selected.map(shot => {
    const { record } = shot, versionId = record.generationVersions.at(-1)?.id
    const prefix = `EP${String(record.episodeNumber).padStart(3, '0')} 镜头${record.shotNumber}：`
    const results = runDubbingQa(loadDubbingQaTemplate(), { ...dubbingQaInput(workspace, shot), episodeNames, expectedEpisodeCount })
    if (record.status !== '已通过') blockers.push(prefix + '尚未自审通过，或已经交付；已归档清单可重新下载。')
    const review = shot.qaHistory.find(entry => entry.id === record.approval?.selfReviewId && entry.versionId === versionId)
    if (!versionId || record.approval?.versionId !== versionId || !dubbingConfirmationCurrent(workspace, shot) || review?.confirmation?.signature !== dubbingQaSignature(workspace, shot)) blockers.push(prefix + '当前版本自审确认表缺失或已过期，请返修后重新自审。')
    for (const item of results) if (!item.checkId.startsWith('rule:') && item.result !== 'PASS') blockers.push(prefix + `${item.checkId} [${item.result}] ${item.evidence}`)
    const evidence = shot.deliveryEvidence
    if (!evidence || evidence.signature !== dubbingQaSignature(workspace, shot)) blockers.push(prefix + '外部检测报告缺失或已过期，请登记当前版本的实际文件核验依据。')
    else {
      try { parseDubbingExternalEvidence(evidence) } catch { blockers.push(prefix + '外部检测记录不完整，请重新核验。') }
    }
    return { shotId: record.id, results }
  })
  return { blockers, episodeNames, shots }
}
export function createDubbingDeliveryPackage(workspace: DubbingWorkspace, scope: DubbingDeliveryScope, expectedEpisodeCount: number, reference: string, at: string, id: string): DubbingDeliveryPackage {
  dubbingText(reference, '交付引用'); dubbingText(id, '交付清单标识'); dubbingTimestamp(at)
  const checked = checkDubbingDelivery(workspace, scope, expectedEpisodeCount)
  dubbingAssert(!checked.blockers.length, `交付检查未通过：${checked.blockers[0] ?? ''}`)
  return structuredClone({ namespace: 'dubbing.delivery', schemaVersion: 1, id, projectId: workspace.projectId, createdAt: at,
    scope, reference: reference.trim(), expectedEpisodeCount, episodeNames: checked.episodeNames,
    notice: '本地交付清单快照，不含媒体文件、不执行转码或飞书上传、不代表客户签收。自动PASS只核验所提供的数据；外部报告为人工登记，未自动验证真实性。',
    shots: checked.shots.map(item => {
      const shot = workspace.shots.find(s => s.record.id === item.shotId)!, record = shot.record, latest = record.generationVersions.at(-1)!
      const review = shot.qaHistory.find(entry => entry.id === record.approval!.selfReviewId)!
      return { shotId: record.id, episodeNumber: record.episodeNumber, shotNumber: record.shotNumber, versionId: latest.id, assetIds: [...latest.assetIds],
        selfReviewId: review.id, confirmation: review.confirmation!, externalEvidence: shot.deliveryEvidence!, results: item.results,
        revisionCount: record.revisionCount, deliveryReference: reference.trim() }
    }) })
}
