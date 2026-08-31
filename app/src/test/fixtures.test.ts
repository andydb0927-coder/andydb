import { describe, expect, test } from 'vitest'

import { makeProjectFixture } from './fixtures'

describe('bundled project fixture', () => {
  test('uses a self-contained valid audio source instead of a missing public file', () => {
    const audio = makeProjectFixture().assets.find(({ kind }) => kind === 'audio')

    expect(audio?.mimeType).toBe('audio/wav')
    expect(audio?.url).toMatch(/^data:audio\/wav;base64,UklGR/)
    expect(audio?.url).not.toContain('/demo/rain.mp3')
  })
})
