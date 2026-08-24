import { describe, expect, it } from 'vitest'

import {
  imagePrimaryActionsFor,
  imageResultActionPolicies,
} from './image-result-action-policy'

describe('image result action policy', () => {
  it('freezes the model and state driven Liblib action table', () => {
    expect(imageResultActionPolicies).toEqual([
      {
        id: 'lib-image-result',
        providerIds: ['mock-mj-image'],
        hasResult: true,
        actions: ['reference', 'mark', 'style'],
      },
      {
        id: 'style-image-v7-result',
        providerIds: ['mock-style-image-v7'],
        hasResult: true,
        actions: ['reference', 'style'],
      },
    ])
  })

  it('keeps empty and unverified model states on the safe three-action surface', () => {
    expect(imagePrimaryActionsFor('mock-mj-image', false)).toEqual([
      'reference',
      'mark',
      'style',
    ])
    expect(imagePrimaryActionsFor('mock-general-image', true)).toEqual([
      'reference',
      'mark',
      'style',
    ])
  })

  it('removes fixed result actions that Liblib does not expose', () => {
    expect(imagePrimaryActionsFor('mock-mj-image', true)).toEqual([
      'reference',
      'mark',
      'style',
    ])
    expect(imagePrimaryActionsFor('mock-style-image-v7', true)).toEqual([
      'reference',
      'style',
    ])
  })
})
