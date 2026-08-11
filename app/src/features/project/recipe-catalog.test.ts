import { describe, expect, test } from 'vitest'

import { findRecipe, recipeDefinitions } from './recipe-catalog'

describe('recipe catalog', () => {
  test('finds a supported recipe by its stable id', () => {
    expect(findRecipe('cinematic-story')?.title).toBe('电影感叙事')
    expect(findRecipe('not-a-recipe')).toBeUndefined()
  })

  test('exposes the same three recipes used by the project launcher', () => {
    expect(recipeDefinitions.map((recipe) => recipe.id)).toEqual([
      'cinematic-story',
      'brand-atmosphere',
      'character-teaser',
    ])
  })
})
