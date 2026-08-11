import { describe, expect, test } from 'vitest'

import {
  fingerprintAssetFile,
  readAssetFileAsDataUrl,
  validateAssetFile,
} from './asset-import'

describe('local asset import', () => {
  test('rejects unsupported and oversized files before reading them', () => {
    expect(() => validateAssetFile(new File(['x'], 'note.txt', { type: 'text/plain' })))
      .toThrow('仅支持图片、视频或音频文件')
    const oversized = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })
    expect(() => validateAssetFile(oversized)).toThrow('单个素材不能超过 20 MiB')
  })

  test('returns a SHA-256 fingerprint for the exact file bytes', async () => {
    await expect(
      fingerprintAssetFile(new File(['same-media'], 'first.png', { type: 'image/png' })),
    ).resolves.toBe('sha256:1a038359f9ee4718fcd9be6ffad5154bb4114c01fbfd7ccb2990f59c0cb82d8c')
  })

  test('reads accepted media as a data URL', async () => {
    await expect(
      readAssetFileAsDataUrl(new File(['audio-bytes'], 'sound.mp3', { type: 'audio/mpeg' })),
    ).resolves.toMatch(/^data:audio\/mpeg;base64,/)
  })
})
