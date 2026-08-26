import { describe, expect, test } from 'vitest'

import { ImageSizeResolver, type ImageSizePolicy } from './image-size-resolver'
import { standardImageAspectRatios } from './model-parameter-semantics'

const policy: ImageSizePolicy = {
  aspectOptions: [...standardImageAspectRatios, '自适应', '自定义'],
  resolutionTiers: [
    {
      id: '1K',
      squareEdge: 1024,
      exactSizes: { '16:9': [1424, 800] },
    },
    {
      id: '1.5K',
      squareEdge: 1536,
      exactSizes: { '3:4': [1344, 1792] },
    },
    {
      id: '2K',
      squareEdge: 2048,
      exactSizes: {
        '9:16': [1584, 2816],
        '21:9': [3136, 1344],
        '9:21': [1344, 3136],
      },
    },
  ],
  pixelConstraints: {
    minTotalPixels: 921_600,
    maxTotalPixels: 4_624_220,
    minRatio: 1 / 16,
    maxRatio: 16,
  },
  multiImageStrategy: 'serial',
  costMode: { amount: 18, per: 'image' },
}

describe('ImageSizeResolver', () => {
  const resolver = new ImageSizeResolver(policy)

  test.each([
    ['1K', '16:9', '1424x800'],
    ['1.5K', '3:4', '1344x1792'],
    ['2K', '9:16', '1584x2816'],
    ['2K', '21:9', '3136x1344'],
    ['2K', '9:21', '1344x3136'],
    ['2K', '1:2', '1448x2896'],
    ['2K', '5:4', '2280x1824'],
  ])('resolves %s %s from policy only', (resolution, aspectRatio, apiValue) => {
    expect(resolver.resolve({ resolution, aspectRatio })).toMatchObject({ apiValue })
  })

  test('handles adaptive, constrained and custom sizes without provider ids', () => {
    expect(resolver.resolve({ resolution: '1.5K', aspectRatio: '自适应' }))
      .toEqual({ apiValue: '1.5K', label: '自适应 · 1.5K', mode: 'adaptive' })
    expect(resolver.constrain(4096, 1755)).toEqual({ width: 3280, height: 1408 })
    expect(resolver.validationError({
      resolution: '2K',
      aspectRatio: '自定义',
      customWidth: 512,
      customHeight: 512,
    })).toBe('自定义尺寸总像素需在 921,600–4,624,220 之间。')
    expect(resolver.resolve({
      resolution: '2K',
      aspectRatio: '自定义',
      customWidth: 1600,
      customHeight: 2000,
    })).toEqual({
      apiValue: '1600x2000',
      label: '1600×2000',
      mode: 'custom',
      width: 1600,
      height: 2000,
    })
  })
})
