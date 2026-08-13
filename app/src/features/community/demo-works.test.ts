import { describe, expect, test } from 'vitest'

import { buildDemoWorks } from './demo-works'

describe('community demo works', () => {
  test('provides at least eight certified local works across every home category', () => {
    const works = buildDemoWorks()

    expect(works.length).toBeGreaterThanOrEqual(8)
    expect(new Set(works.map(({ id }) => id)).size).toBe(works.length)
    expect(works.every(({ authorVerified }) => authorVerified)).toBe(true)
    expect(works.filter(({ tags }) => tags.includes('Seedance2.5'))).toHaveLength(2)
    for (const category of [
      '精选画布',
      '专业影视',
      '短剧漫剧',
      '商业广告',
      '动漫游戏',
      '教育生活',
    ]) {
      expect(works.some(({ tags }) => tags.includes(category))).toBe(true)
    }
  })

  test('returns fresh snapshots that do not share interaction state', () => {
    const first = buildDemoWorks()
    first[0].metrics.likes = 999

    expect(buildDemoWorks()[0].metrics.likes).not.toBe(999)
  })
})
