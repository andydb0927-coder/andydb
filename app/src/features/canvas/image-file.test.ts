import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  MAX_IMAGE_BYTES,
  prepareImageFile,
} from './image-file'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('image file preparation', () => {
  test.each([
    ['image/png', 'frame.png'],
    ['image/jpeg', 'frame.jpg'],
    ['image/webp', 'frame.webp'],
  ] as const)('returns a durable %s data URL', async (mimeType, name) => {
    const prepared = await prepareImageFile(
      new File(['image-bytes'], name, { type: mimeType }),
    )

    expect(prepared.mimeType).toBe(mimeType)
    expect(prepared.dataUrl).toMatch(
      new RegExp(`^data:${mimeType.replace('/', '\\/')};base64,`),
    )
  })

  test('rejects an unsupported image before constructing a FileReader', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsDataURL')

    await expect(
      prepareImageFile(
        new File(['gif'], 'frame.gif', { type: 'image/gif' }),
      ),
    ).rejects.toMatchObject({
      code: 'type',
      message: '仅支持 PNG、JPEG 或 WebP 图片',
    })
    expect(read).not.toHaveBeenCalled()
  })

  test('rejects a file larger than 8 MiB before constructing a FileReader', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsDataURL')
    const tooLarge = new File(
      [new Uint8Array(MAX_IMAGE_BYTES + 1)],
      'large.png',
      { type: 'image/png' },
    )

    await expect(prepareImageFile(tooLarge)).rejects.toMatchObject({
      code: 'size',
      message: '图片不能超过 8 MB',
    })
    expect(read).not.toHaveBeenCalled()
  })

  test('reports a FileReader failure as a retryable read error', async () => {
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(
      function reportReadFailure(this: FileReader) {
        this.dispatchEvent(new Event('error'))
      },
    )

    await expect(
      prepareImageFile(
        new File(['png'], 'frame.png', { type: 'image/png' }),
      ),
    ).rejects.toMatchObject({
      code: 'read',
      message: '无法读取图片，请重新选择',
    })
  })
})
