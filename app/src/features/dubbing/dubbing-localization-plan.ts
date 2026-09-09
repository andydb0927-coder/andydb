import { dubbingAssert, dubbingInteger, dubbingPdfSource, dubbingText, dubbingUniqueIds, type DubbingPdfSource } from './dubbing-domain-validation'

export const DUBBING_REPLACEMENT_CATEGORIES = ['建筑', '服装', '图案', '工具', '交通', '面孔', '文字', '家具', '食物', '品牌', '日常', '祭祀'] as const
export type DubbingReplacementCategory = typeof DUBBING_REPLACEMENT_CATEGORIES[number]
export type DubbingNumberContext = 'ordinary' | 'sentence-start' | 'money' | 'phone' | 'official-number' | 'time' | 'age' | 'episode'
export interface DubbingNumberRules {
  mode: 'threshold' | 'words' | 'unconfigured'
  threshold: number
  thresholdInclusive: boolean | null
  sentenceStartWords: boolean
  digitExceptions: DubbingNumberContext[]
  unitSeparator: ' ' | ''
}
export interface DubbingLocalizationPlanInput {
  id: string
  dramaId: string
  targetLanguage: string
  names: { characterId: string; originalName: string; givenName: string; familyName: string }[]
  replacements: { id: string; category: DubbingReplacementCategory; sourceText: string; targetText: string }[]
  textReplacements: { id: string; kind: '中文字幕' | '花字'; sourceText: string; targetText: string }[]
  numberRules?: DubbingNumberRules
}
export interface DubbingLocalizationPlan extends DubbingLocalizationPlanInput {
  namespace: 'dubbing.localization'
  schemaVersion: 1
  numberRules: DubbingNumberRules
  specialRules: { id: string; requirement: string; source: DubbingPdfSource }[]
}

const normalizeName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')

function validateNumberRules(rules: DubbingNumberRules) {
  dubbingAssert(['threshold', 'words', 'unconfigured'].includes(rules.mode), '数字规则模式无效。')
  dubbingInteger(rules.threshold, '数字阈值', 0)
  dubbingAssert(rules.thresholdInclusive === null || typeof rules.thresholdInclusive === 'boolean', '数字边界规则无效。')
  dubbingAssert(typeof rules.sentenceStartWords === 'boolean', '句首数字规则无效。')
  dubbingUniqueIds(rules.digitExceptions, '数字例外')
  dubbingAssert(rules.digitExceptions.every(context => ['money', 'phone', 'official-number', 'time', 'age', 'episode'].includes(context)), '数字例外类型无效。')
  dubbingAssert(rules.unitSeparator === ' ' || rules.unitSeparator === '', '数字单位分隔规则无效。')
}

function defaultNumberRules(language: string): DubbingNumberRules {
  const primary = language.toLowerCase().split('-')[0]
  const supported = ['en', 'pt', 'es'].includes(primary)
  return { mode: primary === 'es' ? 'words' : supported ? 'threshold' : 'unconfigured', threshold: 10,
    thresholdInclusive: null, sentenceStartWords: supported,
    unitSeparator: ' ', digitExceptions: !supported ? [] : primary === 'es' ? ['phone', 'official-number'] : ['money', 'phone', 'official-number', 'time', 'age', 'episode'] }
}

/** Decides notation, not translation. PDF pages 9 and 17 disagree on the inclusive boundary. */
export function dubbingNumberNotation(rules: DubbingNumberRules, value: number, context: DubbingNumberContext = 'ordinary'): 'words' | 'digits' | 'needs-confirmation' {
  validateNumberRules(rules)
  dubbingAssert(Number.isFinite(value) && value >= 0, '数字必须为非负有限数值。')
  dubbingAssert(['ordinary', 'sentence-start', 'money', 'phone', 'official-number', 'time', 'age', 'episode'].includes(context), '数字上下文无效。')
  if (rules.mode === 'unconfigured') return 'needs-confirmation'
  if (context === 'sentence-start' && rules.sentenceStartWords) return 'words'
  if (rules.digitExceptions.includes(context)) return 'digits'
  if (rules.mode === 'words') return 'words'
  if (value < rules.threshold) return 'words'
  if (value > rules.threshold) return 'digits'
  return rules.thresholdInclusive === null ? 'needs-confirmation' : rules.thresholdInclusive ? 'words' : 'digits'
}

export function formatDubbingEpisodeNumber(episodeNumber: number): string {
  dubbingInteger(episodeNumber, '集号', 1, 999)
  return `EP${String(episodeNumber).padStart(3, '0')}`
}

export function createDubbingLocalizationPlan(input: DubbingLocalizationPlanInput): DubbingLocalizationPlan {
  dubbingText(input.id, '方案 ID')
  dubbingText(input.dramaId, '剧集 ID')
  dubbingText(input.targetLanguage, '目标语种')
  const identities = { ids: new Set<string>(), original: new Set<string>(), target: new Set<string>() }
  input.names.forEach(name => {
    dubbingText(name.characterId, '角色 ID')
    dubbingText(name.originalName, '原名')
    dubbingText(name.givenName, '目标名')
    dubbingText(name.familyName, '目标姓氏')
    const values = [normalizeName(name.characterId), normalizeName(name.originalName), normalizeName(`${name.givenName.trim()} ${name.familyName.trim()}`)]
    ;[identities.ids, identities.original, identities.target].forEach((set, i) => {
      dubbingAssert(!set.has(values[i]), '角色 ID、原名与目标全名必须在全剧范围内唯一。')
      set.add(values[i])
    })
  })
  dubbingUniqueIds(input.replacements.map(item => item.id), '替换项 ID')
  input.replacements.forEach(item => {
    dubbingAssert(DUBBING_REPLACEMENT_CATEGORIES.includes(item.category), '替换分类无效。')
    dubbingText(item.sourceText, '原元素')
    dubbingText(item.targetText, '目标元素')
  })
  dubbingUniqueIds(input.textReplacements.map(item => item.id), '文字替换 ID')
  input.textReplacements.forEach(item => {
    dubbingAssert(['中文字幕', '花字'].includes(item.kind), '文字替换分类无效。')
    dubbingText(item.sourceText, '原文字')
    dubbingText(item.targetText, '目标文字')
  })
  const numberRules = input.numberRules ?? defaultNumberRules(input.targetLanguage.trim())
  validateNumberRules(numberRules)
  return structuredClone({ id: input.id, dramaId: input.dramaId, targetLanguage: input.targetLanguage.trim(),
    names: input.names, replacements: input.replacements, textReplacements: input.textReplacements,
    namespace: 'dubbing.localization', schemaVersion: 1, numberRules,
    specialRules: [
      { id: 'episode-number', requirement: '集号使用 EP 加三位数字，例如 EP001。', source: dubbingPdfSource(12, 25) },
      { id: 'uber-logo', requirement: '按项目方案替换叫车相关标志为确认的 Uber 标志，人工核对位置和形态。', source: dubbingPdfSource(5, 21) },
      { id: 'whiteboard', requirement: '按本地化方案将黑板替换为白板，并同步检查板上文字。', source: dubbingPdfSource(4, 20) },
      { id: 'coffee-machine', requirement: '按场景方案采用咖啡机等目标市场道具，保持剧情用途一致。', source: dubbingPdfSource(5, 21) },
    ] })
}
