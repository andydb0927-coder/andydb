import { describe, expect, test } from 'vitest'

import {
  modelParameterSemantics,
  resolveModelParameterManifest,
  standardImageAspectRatios,
} from './model-parameter-semantics'

describe('model parameter semantics', () => {
  test('binds the shared image semantics to their canonical option sets', () => {
    expect(standardImageAspectRatios).toEqual([
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
    expect(modelParameterSemantics).toMatchObject({
      aspectRatio: { defaultValue: '16:9', options: standardImageAspectRatios },
      resolution: { defaultValue: '2K', options: ['1K', '1.5K', '2K'] },
      count: { defaultValue: '1', options: ['1', '2', '4'] },
    })
  })

  test('expands semantic references while keeping provider overrides declarative', () => {
    expect(resolveModelParameterManifest({
      aspectRatio: true,
      resolution: { semantic: true, options: ['1K', '2K'], defaultValue: '2K' },
      count: { semantic: true, options: ['1', '4'], defaultValue: '4' },
      autoLink: { type: 'boolean', defaultValue: true },
    })).toEqual({
      aspectRatio: {
        type: 'enum',
        defaultValue: '16:9',
        options: standardImageAspectRatios,
      },
      resolution: { type: 'enum', defaultValue: '2K', options: ['1K', '2K'] },
      count: { type: 'enum', defaultValue: '4', options: ['1', '4'] },
      autoLink: { type: 'boolean', defaultValue: true },
    })
  })
})
