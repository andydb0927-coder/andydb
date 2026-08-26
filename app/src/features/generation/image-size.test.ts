import { describe, expect, test } from 'vitest'

import {
  constrainSeedreamImageSize,
  resolveSeedreamImageSize,
  seedreamAspectRatioOptions,
} from './image-size'

describe('Seedream 5.0 Pro image size mapping', () => {
  test('exposes the 13 Liblib ratios in their measured order', () => {
    expect(seedreamAspectRatioOptions).toEqual([
      '1:1',
      '1:2',
      '2:1',
      '9:16',
      '16:9',
      '3:4',
      '4:3',
      '3:2',
      '2:3',
      '5:4',
      '4:5',
      '21:9',
      '9:21',
    ])
  })

  test.each([
    ['1K', '16:9', '1424x800'],
    ['1.5K', '3:4', '1344x1792'],
    ['2K', '9:16', '1584x2816'],
    ['2K', '21:9', '3136x1344'],
    ['2K', '9:21', '1344x3136'],
    ['2K', '1:2', '1448x2896'],
    ['2K', '5:4', '2280x1824'],
  ])('maps %s %s to an exact API size', (resolution, ratio, apiValue) => {
    expect(resolveSeedreamImageSize({
      resolution,
      aspectRatio: ratio,
    })).toMatchObject({ apiValue })
  })

  test('passes adaptive resolution through without inventing pixels', () => {
    expect(resolveSeedreamImageSize({
      resolution: '1.5K',
      aspectRatio: '自适应',
    })).toEqual({ apiValue: '1.5K', label: '自适应 · 1.5K' })
  })

  test('shrinks an oversized candidate proportionally below the official pixel cap', () => {
    const result = constrainSeedreamImageSize(4096, 1755)
    expect(result).toEqual({ width: 3280, height: 1408 })
    expect(result.width * result.height).toBeLessThanOrEqual(4_624_220)
    expect(result.width / result.height).toBeCloseTo(4096 / 1755, 2)
  })

  test('validates custom size before returning the API value', () => {
    expect(() => resolveSeedreamImageSize({
      resolution: '2K',
      aspectRatio: '自定义',
      customWidth: 512,
      customHeight: 512,
    })).toThrow('自定义尺寸总像素需在 921,600–4,624,220 之间')

    expect(resolveSeedreamImageSize({
      resolution: '2K',
      aspectRatio: '自定义',
      customWidth: 1600,
      customHeight: 2000,
    })).toEqual({
      apiValue: '1600x2000',
      label: '1600×2000',
      width: 1600,
      height: 2000,
    })
  })
})
