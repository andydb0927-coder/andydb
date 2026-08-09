import type { PreparedImage } from './node-draft'

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export type ImagePreparationErrorCode = 'type' | 'size' | 'read'

const errorMessages: Record<ImagePreparationErrorCode, string> = {
  type: '仅支持 PNG、JPEG 或 WebP 图片',
  size: '图片不能超过 8 MB',
  read: '无法读取图片，请重新选择',
}

export class ImagePreparationError extends Error {
  readonly code: ImagePreparationErrorCode

  constructor(code: ImagePreparationErrorCode) {
    super(errorMessages[code])
    this.name = 'ImagePreparationError'
    this.code = code
  }
}

export function prepareImageFile(file: File): Promise<PreparedImage> {
  const mimeType = file.type
  if (!ACCEPTED_IMAGE_TYPES.some((accepted) => accepted === mimeType)) {
    return Promise.reject(new ImagePreparationError('type'))
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Promise.reject(new ImagePreparationError('size'))
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const rejectRead = () => reject(new ImagePreparationError('read'))

    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:')) {
        rejectRead()
        return
      }

      resolve({
        dataUrl: reader.result,
        mimeType: mimeType as PreparedImage['mimeType'],
      })
    })
    reader.addEventListener('error', rejectRead)
    reader.addEventListener('abort', rejectRead)

    try {
      reader.readAsDataURL(file)
    } catch {
      rejectRead()
    }
  })
}
