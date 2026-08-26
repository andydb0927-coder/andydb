import { describe, expect, test } from 'vitest'

import { optimizePromptLocally } from './local-prompt-optimizer'

describe('local prompt optimizer', () => {
  test('structures an image prompt with camera, lighting, and sound guidance', () => {
    const optimized = optimizePromptLocally('清晨薄雾中的古桥', 'image')

    expect(optimized).toContain('主体与场景：清晨薄雾中的古桥')
    expect(optimized).toContain('镜头：')
    expect(optimized).toContain('光线：')
    expect(optimized).toContain('声音：')
  })

  test('is idempotent for an already structured video prompt', () => {
    const once = optimizePromptLocally('人物走过雨夜街道', 'video')
    expect(optimizePromptLocally(once, 'video')).toBe(once)
  })
})
