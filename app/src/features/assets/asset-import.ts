export const MAX_ASSET_FILE_BYTES = 20 * 1024 * 1024

type AssetImportErrorCode = 'type' | 'size' | 'read'

const errorMessages: Record<AssetImportErrorCode, string> = {
  type: '仅支持图片、视频或音频文件',
  size: '单个素材不能超过 20 MiB',
  read: '无法读取素材文件，请重新选择',
}

export class AssetImportError extends Error {
  readonly code: AssetImportErrorCode

  constructor(code: AssetImportErrorCode) {
    super(errorMessages[code])
    this.name = 'AssetImportError'
    this.code = code
  }
}

export function validateAssetFile(file: File): void {
  if (!['image/', 'video/', 'audio/'].some((prefix) => file.type.startsWith(prefix))) {
    throw new AssetImportError('type')
  }

  if (file.size > MAX_ASSET_FILE_BYTES) {
    throw new AssetImportError('size')
  }
}

export async function fingerprintAssetFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')

  return `sha256:${hex}`
}

export function readAssetFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const rejectRead = () => reject(new AssetImportError('read'))

    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:')) {
        rejectRead()
        return
      }

      resolve(reader.result)
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
