import { dubbingAssert } from './dubbing-domain-validation'
import { DUBBING_QA_CATEGORIES, loadDubbingQaTemplate } from './dubbing-qa-standard'
import { runDubbingQa, type DubbingQaInput, type DubbingQaResult } from './dubbing-qa-runner'
import type { DubbingWorkbenchShot, DubbingWorkspace } from './dubbing-workbench-model'

export interface DubbingQaConfirmation { text: string; signature: string; at: string; results: DubbingQaResult[] }
export type DubbingQaEvidence = Pick<DubbingQaInput, 'episodeNames' | 'expectedEpisodeCount' | 'subtitles' | 'lipSyncOffsetsSeconds' | 'volumeDeltaDb' | 'volumeReference' | 'channels' | 'file' | 'numberContext'>
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const string = (v: unknown) => typeof v === 'string'
/** Accept only measurements, never caller-supplied PASS results or overrides of current dialogue. */
export function parseDubbingQaEvidence(value: unknown): DubbingQaEvidence {
  const error = '检测数据格式无效，请检查字段、有限数字与完整字幕/文件元数据。'
  dubbingAssert(object(value) && JSON.stringify(value).length <= 100_000, error)
  const allowed = ['episodeNames', 'expectedEpisodeCount', 'subtitles', 'lipSyncOffsetsSeconds', 'volumeDeltaDb', 'volumeReference', 'channels', 'file', 'numberContext']
  dubbingAssert(Object.keys(value).every(key => allowed.includes(key)), error)
  for (const key of ['expectedEpisodeCount', 'volumeDeltaDb', 'channels']) if (key in value) dubbingAssert(finite(value[key]), error)
  if ('volumeReference' in value) dubbingAssert(string(value.volumeReference), error)
  if ('numberContext' in value) dubbingAssert(['ordinary', 'sentence-start', 'money', 'phone', 'official-number', 'time', 'age', 'episode'].includes(String(value.numberContext)), error)
  if ('episodeNames' in value) dubbingAssert(Array.isArray(value.episodeNames) && value.episodeNames.every(string), error)
  if ('lipSyncOffsetsSeconds' in value) dubbingAssert(Array.isArray(value.lipSyncOffsetsSeconds) && value.lipSyncOffsetsSeconds.every(finite), error)
  if ('subtitles' in value) {
    dubbingAssert(Array.isArray(value.subtitles), error)
    for (const cue of value.subtitles) {
      dubbingAssert(object(cue) && finite(cue.startMs) && finite(cue.endMs) && string(cue.text) && (cue.episode === undefined || string(cue.episode)), error)
      if (cue.box !== undefined) { const box = cue.box; dubbingAssert(object(box) && ['x', 'y', 'width', 'height'].every(key => finite(box[key])), error) }
    }
  }
  if ('file' in value) { const file = value.file; dubbingAssert(object(file) && ['width', 'height', 'bitrateMbps', 'fps'].every(key => finite(file[key])) && ['codec', 'container', 'colorSpace'].every(key => string(file[key])), error) }
  return structuredClone(value) as DubbingQaEvidence
}
export function dubbingQaInput(workspace: DubbingWorkspace, shot: DubbingWorkbenchShot): DubbingQaInput {
  return { ...shot.qa.evidence, language: workspace.plan?.targetLanguage, numberRules: workspace.plan?.numberRules,
    originalText: shot.record.content.originalDialogue, localizedText: shot.record.content.localizedDialogue,
    localizedExtraTexts: workspace.plan?.textReplacements.map(item => item.targetText), revisionCount: shot.record.revisionCount }
}
export function dubbingQaSignature(workspace: DubbingWorkspace, shot: DubbingWorkbenchShot): string {
  return JSON.stringify({ version: shot.record.generationVersions.at(-1)?.id, input: dubbingQaInput(workspace, shot), plan: workspace.plan,
    episode: workspace.shots.map(item => [item.record.id, item.record.episodeNumber, item.record.shotNumber, item.record.generationVersions.at(-1)?.id]), template: loadDubbingQaTemplate() })
}
export function dubbingChecklistComplete(shot: DubbingWorkbenchShot): boolean {
  return loadDubbingQaTemplate().rules.every(rule => shot.qa.checkedIds.includes(rule.standardId)) && DUBBING_QA_CATEGORIES.every(category => shot.qa.checkedCategories?.includes(category))
}
export function dubbingConfirmationCurrent(workspace: DubbingWorkspace, shot: DubbingWorkbenchShot): boolean {
  return dubbingChecklistComplete(shot) && shot.qa.confirmation?.signature === dubbingQaSignature(workspace, shot)
}
export function createDubbingQaConfirmation(workspace: DubbingWorkspace, shot: DubbingWorkbenchShot, at: string): DubbingQaConfirmation {
  const template = loadDubbingQaTemplate()
  dubbingAssert(template.rules.every(rule => shot.qa.checkedIds.includes(rule.standardId)), '请确认全部子项（包括 P0/P1/P2），再生成自审确认表。')
  dubbingAssert(DUBBING_QA_CATEGORIES.every(category => shot.qa.checkedCategories?.includes(category)), '请完成九节逐集排查标记。')
  const results = runDubbingQa(template, dubbingQaInput(workspace, shot))
  dubbingAssert(!results.some(item => item.result === 'FAIL'), '自动检查存在 FAIL，请修正检测数据或镜头问题后重新自审。')
  const text = ['《自审确认表》', `项目：${workspace.projectId} · EP${String(shot.record.episodeNumber).padStart(3, '0')} · 镜头 ${shot.record.shotNumber}`,
    `版本：${shot.qa.versionId} · 语种：${workspace.plan?.targetLanguage ?? '未设置，人工确认'} · 时间：${at}`,
    '确认人：local-reviewer。已逐项人工核对符合或确认不适用；WARN/待人工确认是原始检测状态，不改写为自动PASS。元数据为人工登记，未自动读取媒体文件。',
    ...DUBBING_QA_CATEGORIES.flatMap(category => [`\n${category === '修改' ? '修改底线' : category} · 本集逐镜排查已确认`, ...template.rules.filter(rule => rule.category === category).map(rule => `[已确认] ${rule.standardId} ${rule.requirement}`)]),
    '\n检查依据（自动、AI辅助、人工分别保留）：', ...results.map(item => `${item.standardId} / ${item.checkId} / ${item.result} / ${item.checkMethod}：${item.evidence}`)].join('\n')
  return { text, signature: dubbingQaSignature(workspace, shot), at, results }
}
