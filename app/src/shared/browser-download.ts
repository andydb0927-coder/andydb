export interface DownloadAnchor {
  href: string
  download: string
  click(): void
  remove(): void
}

export interface DownloadEnvironment {
  createAnchor(): DownloadAnchor
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
}

export function safeDownloadFilename(filename: string) {
  const sanitized = filename
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/-+\./g, '.')
    .replace(/-{2,}/g, '-')
  return sanitized || 'timeline-export'
}

export function browserDownloadEnvironment(): DownloadEnvironment {
  return {
    createAnchor: () => document.createElement('a'),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  }
}

export function downloadBlob(
  blob: Blob,
  filename: string,
  environment: DownloadEnvironment = browserDownloadEnvironment(),
) {
  const anchor = environment.createAnchor()
  const url = environment.createObjectURL(blob)
  anchor.href = url
  anchor.download = safeDownloadFilename(filename)
  anchor.click()
  anchor.remove()
  environment.revokeObjectURL(url)
}
