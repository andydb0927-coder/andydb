import { describe, expect, test } from 'vitest'

import { buildHomeContentSeed } from './home-content'

describe('platform home content seed', () => {
  test('contains the required activity, six modes, six categorized skills and four capabilities', () => {
    const records = buildHomeContentSeed()

    expect(records.filter(({ kind }) => kind === 'activity')).toHaveLength(1)
    expect(
      records.filter(({ kind }) => kind === 'mode').map(({ title }) => title),
    ).toEqual([
      '直出超长视频',
      '片段重拍',
      '智能引用',
      '讲解视频',
      '素材混剪',
      '逐帧拉片',
    ])
    const skills = records.filter(({ kind }) => kind === 'skill')
    expect(skills).toHaveLength(6)
    expect(skills.filter(({ category }) => category === '专业影视')).toHaveLength(2)
    expect(skills.filter(({ category }) => category === '商业广告')).toHaveLength(2)
    expect(skills.filter(({ category }) => category === '音乐MV')).toHaveLength(2)
    expect(skills.every(({ imageUrl, author, usageCount, prompt }) =>
      Boolean(imageUrl && author && usageCount && prompt),
    )).toBe(true)
    const capabilities = records.filter(({ kind }) => kind === 'capability')
    expect(capabilities).toHaveLength(4)
    expect(capabilities.every(({ targetPath }) =>
      targetPath !== undefined &&
      ['/models', '/workflows', '/agents'].includes(targetPath),
    )).toBe(true)
    expect(new Set(records.map(({ id }) => id)).size).toBe(records.length)
  })

  test('returns fresh records so callers cannot mutate the shared seed', () => {
    const first = buildHomeContentSeed()
    first[0].title = '已修改'

    expect(buildHomeContentSeed()[0].title).not.toBe('已修改')
  })
})
