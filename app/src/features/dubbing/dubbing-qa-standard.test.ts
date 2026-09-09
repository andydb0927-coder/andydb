import { describe, expect, it } from 'vitest'
import { DUBBING_QA_CATEGORIES, DUBBING_QA_LEVELS, loadDubbingQaTemplate, validateDubbingQaTemplate } from './dubbing-qa-standard'

describe('客户 PDF 验收模板', () => {
  it('加载九大类、三级等级和对应颜色，所有规则可追溯到客户 PDF', () => {
    const template = loadDubbingQaTemplate()
    expect(template).toMatchObject({ namespace: 'dubbing.qa', schemaVersion: 1, p1BlockingThreshold: null })
    expect(DUBBING_QA_CATEGORIES).toEqual(['资产', '场景', '道具', '画面', '声音', '字幕', '修改', '交付', '中国元素'])
    expect([...new Set(template.rules.map(r => r.category))]).toEqual([...DUBBING_QA_CATEGORIES])
    expect(DUBBING_QA_LEVELS).toEqual({ P0: { color: '红', label: '严重问题' }, P1: { color: '黄', label: '一般问题' }, P2: { color: '白', label: '轻微问题' } })
    for (const rule of template.rules) {
      expect(rule.standardId).toMatch(/^DB-QA-/)
      expect(rule.requirement.trim()).not.toBe('')
      expect(['P0', 'P1', 'P2']).toContain(rule.level)
      expect(['自动', 'AI辅助', '人工']).toContain(rule.checkMethod)
      expect(rule.source).toMatchObject({ kind: '客户PDF', documentName: '审核交付验收标准.pdf' })
      expect(rule.source.pages.length).toBeGreaterThan(0)
      expect(rule.source.pages.every(page => Number.isInteger(page) && page >= 1 && page <= 26)).toBe(true)
      expect(rule).not.toHaveProperty('passed')
    }
    expect(new Set(template.rules.map(r => r.standardId)).size).toBe(template.rules.length)
    expect(() => validateDubbingQaTemplate(template)).not.toThrow()
  })

  it('复制加载结果可独立编辑，不能污染标准模板；JSON 往返不丢来源', () => {
    const template = loadDubbingQaTemplate()
    template.rules[0].requirement = '草稿规则'
    template.rules[0].source.pages.push(26)
    const fresh = loadDubbingQaTemplate()
    expect(fresh.rules[0].requirement).not.toBe('草稿规则')
    expect(JSON.parse(JSON.stringify(fresh))).toEqual(fresh)
  })

  it('含完整十二类元素、返修与新旧版本并存规范，但不伪造自动验收', () => {
    const template = loadDubbingQaTemplate()
    expect(template.rules.filter(r => r.category === '中国元素')).toHaveLength(12)
    expect(template.rules.some(r => r.category === '修改' && r.requirement.includes('3 次'))).toBe(true)
    expect(template.rules.some(r => r.requirement.includes('原片') && r.requirement.includes('覆盖'))).toBe(true)
    expect(template.rules.find(r => r.standardId === 'DB-QA-ELEMENT-06')).toMatchObject({ checkMethod: '人工' })
    expect(template.notes.join('')).toContain('不代表已执行')
    expect(template.notes.join('')).toContain('族裔')
  })

  it.each(['重复标准', '缺失分类', '非法等级', '非法方式', '非法来源页', '空要求'] as const)('拒绝损坏模板：%s', corruption => {
    const template = loadDubbingQaTemplate()
    switch (corruption) {
      case '重复标准': template.rules.push(structuredClone(template.rules[0])); break
      case '缺失分类': template.rules = template.rules.filter(r => r.category !== '声音'); break
      case '非法等级': template.rules[0].level = 'P3' as 'P0'; break
      case '非法方式': template.rules[0].checkMethod = '自动通过' as '自动'; break
      case '非法来源页': template.rules[0].source.pages = [27]; break
      case '空要求': template.rules[0].requirement = ''; break
    }
    expect(() => validateDubbingQaTemplate(template)).toThrow()
  })
})
