import { describe, expect, test } from 'vitest'

import { withAppBase } from './public-url'

describe('withAppBase', () => {
  test('prefixes repository-hosted public assets with the GitHub Pages base', () => {
    expect(withAppBase('/demo/shot-river.png', '/andydb/')).toBe(
      '/andydb/demo/shot-river.png',
    )
  })

  test('keeps localhost root paths unchanged', () => {
    expect(withAppBase('/demo/shot-river.png', '/')).toBe(
      '/demo/shot-river.png',
    )
  })

  test('does not rewrite remote, data, or blob URLs', () => {
    expect(withAppBase('https://cdn.example.com/shot.png', '/andydb/')).toBe(
      'https://cdn.example.com/shot.png',
    )
    expect(withAppBase('data:image/png;base64,abc', '/andydb/')).toBe(
      'data:image/png;base64,abc',
    )
    expect(withAppBase('blob:https://example.com/id', '/andydb/')).toBe(
      'blob:https://example.com/id',
    )
  })
})
