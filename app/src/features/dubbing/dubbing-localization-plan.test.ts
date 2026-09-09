import { describe, expect, it } from 'vitest'
import { DUBBING_REPLACEMENT_CATEGORIES, createDubbingLocalizationPlan, dubbingNumberNotation,
  formatDubbingEpisodeNumber, type DubbingLocalizationPlanInput } from './dubbing-localization-plan'

const input = (): DubbingLocalizationPlanInput => ({ id: 'plan-1', dramaId: 'drama-1', targetLanguage: 'en-US',
  names: [{ characterId: 'role-1', originalName: '林雨', givenName: 'Emma', familyName: 'Carter' }], replacements: [], textReplacements: [] })

describe('全剧本地化方案', () => {
  it('有独立命名空间，包含十二类清单与客户特殊规则', () => {
    expect(DUBBING_REPLACEMENT_CATEGORIES).toEqual(['建筑', '服装', '图案', '工具', '交通', '面孔', '文字', '家具', '食物', '品牌', '日常', '祭祀'])
    const plan = createDubbingLocalizationPlan(input())
    expect(plan).toMatchObject({ namespace: 'dubbing.localization', schemaVersion: 1, dramaId: 'drama-1', targetLanguage: 'en-US' })
    expect(plan.specialRules.map(r => r.id)).toEqual(['episode-number', 'uber-logo', 'whiteboard', 'coffee-machine'])
    expect(plan.specialRules.every(r => r.source.documentName === '审核交付验收标准.pdf' && r.source.pages.length)).toBe(true)
  })

  it('每类替换可保存，字幕和花字分别记录，输入与返回值不共享数组', () => {
    const source = input()
    source.replacements = DUBBING_REPLACEMENT_CATEGORIES.map((category, i) => ({ id: `r-${i}`, category, sourceText: `原${category}`, targetText: `已确认${category}` }))
    source.textReplacements = [{ id: 'title-1', kind: '花字', sourceText: '前一天', targetText: 'One day earlier' },
      { id: 'subtitle-1', kind: '中文字幕', sourceText: '你好', targetText: 'Hello' }]
    const plan = createDubbingLocalizationPlan(source)
    source.names[0].givenName = 'Changed'
    source.replacements[0].targetText = 'Changed'
    expect(plan.names[0].givenName).toBe('Emma')
    expect(plan.replacements[0].targetText).toBe('已确认建筑')
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan)
  })

  it.each([
    { characterId: 'role-2', originalName: '另一人', givenName: 'Ｅｍｍａ', familyName: '  CARTER ' },
    { characterId: 'role-2', originalName: ' 林雨 ', givenName: 'Olivia', familyName: 'Davis' },
    { characterId: 'role-1', originalName: '另一人', givenName: 'Olivia', familyName: 'Davis' },
  ])('全剧映射拒绝冲突（Unicode、大小写、空白归一后）', duplicate => {
    expect(() => createDubbingLocalizationPlan({ ...input(), names: [...input().names, duplicate] })).toThrow(/唯一/)
  })

  it('不同姓氏允许同名；不同剧可复用姓名，但不能省略姓氏', () => {
    expect(createDubbingLocalizationPlan({ ...input(), names: [...input().names,
      { characterId: 'role-2', originalName: '叶青', givenName: 'Emma', familyName: 'Smith' }] }).names).toHaveLength(2)
    expect(createDubbingLocalizationPlan({ ...input(), dramaId: 'drama-2' }).names).toEqual(input().names)
    expect(() => createDubbingLocalizationPlan({ ...input(), names: [{ ...input().names[0], familyName: ' ' }] })).toThrow(/姓氏/)
  })

  it('拒绝未知替换分类、重复 ID 和未选择语种', () => {
    expect(() => createDubbingLocalizationPlan({ ...input(), targetLanguage: '' })).toThrow(/语种/)
    expect(() => createDubbingLocalizationPlan({ ...input(), replacements: [{ id: 'r', category: '未知' as '建筑', sourceText: 'a', targetText: 'b' }] })).toThrow(/分类/)
    const replacement = { id: 'r', category: '建筑' as const, sourceText: '黑板', targetText: '白板' }
    expect(() => createDubbingLocalizationPlan({ ...input(), replacements: [replacement, replacement] })).toThrow(/重复/)
  })

  it.each(['en-US', 'pt-BR'])('保留 %s 的数字 10 歧义，显式确认后才能自动决定', targetLanguage => {
    const plan = createDubbingLocalizationPlan({ ...input(), targetLanguage })
    expect(dubbingNumberNotation(plan.numberRules, 9)).toBe('words')
    expect(dubbingNumberNotation(plan.numberRules, 11)).toBe('digits')
    expect(dubbingNumberNotation(plan.numberRules, 10)).toBe('needs-confirmation')
    expect(dubbingNumberNotation({ ...plan.numberRules, thresholdInclusive: true }, 10)).toBe('words')
    expect(dubbingNumberNotation({ ...plan.numberRules, thresholdInclusive: false }, 10)).toBe('digits')
    expect(dubbingNumberNotation(plan.numberRules, 5, 'money')).toBe('digits')
    expect(dubbingNumberNotation(plan.numberRules, 50, 'sentence-start')).toBe('words')
  })

  it('西语单词规则保留官方编号与电话号码例外，不干扰 EP 三位集号', () => {
    const plan = createDubbingLocalizationPlan({ ...input(), targetLanguage: 'es-MX' })
    expect(dubbingNumberNotation(plan.numberRules, 25)).toBe('words')
    expect(dubbingNumberNotation(plan.numberRules, 25, 'phone')).toBe('digits')
    expect(dubbingNumberNotation(plan.numberRules, 25, 'official-number')).toBe('digits')
    expect(formatDubbingEpisodeNumber(1)).toBe('EP001')
    expect(formatDubbingEpisodeNumber(100)).toBe('EP100')
    expect(() => formatDubbingEpisodeNumber(0)).toThrow(/集号/)
    expect(() => formatDubbingEpisodeNumber(1000)).toThrow(/集号/)
  })

  it('未知语种不冒用英语规则，可显式提供项目数字规则', () => {
    const plan = createDubbingLocalizationPlan({ ...input(), targetLanguage: 'ja-JP' })
    expect(dubbingNumberNotation(plan.numberRules, 1)).toBe('needs-confirmation')
    const custom = createDubbingLocalizationPlan({ ...input(), targetLanguage: 'ja-JP', numberRules: {
      ...plan.numberRules, mode: 'threshold', threshold: 5, thresholdInclusive: true, sentenceStartWords: false } })
    expect(dubbingNumberNotation(custom.numberRules, 6)).toBe('digits')
    expect(() => dubbingNumberNotation(custom.numberRules, Infinity)).toThrow(/数字/)
  })

  it('英文时间、年龄、集数保留数字例外及单位分隔规则', () => {
    const rules = createDubbingLocalizationPlan(input()).numberRules
    expect(rules.digitExceptions).toEqual(expect.arrayContaining(['time', 'age', 'episode']))
    expect(rules).toMatchObject({ unitSeparator: ' ' })
  })
})
