/** RIFF chunks need not be in a fixed order (metadata/watermarks may precede data). */
export function readWavMetadata(bytes: Uint8Array) {
  if (bytes.length < 44) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length))
  if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') return undefined
  let sampleRate = 0
  let audioChannels = 0
  let byteRate = 0
  let dataLength = 0
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset + 4, true)
    if (offset + 8 + size > bytes.length) return undefined
    const kind = text(offset, 4)
    if (kind === 'fmt ' && size >= 16) {
      audioChannels = view.getUint16(offset + 10, true)
      sampleRate = view.getUint32(offset + 12, true)
      byteRate = view.getUint32(offset + 16, true)
    }
    if (kind === 'data') dataLength += size
    offset += 8 + size + (size % 2)
  }
  return sampleRate > 0 && audioChannels > 0 && byteRate > 0 && dataLength > 0
    ? { sampleRate, audioChannels, durationSeconds: dataLength / byteRate }
    : undefined
}

export function base64WavMetadata(base64: string) {
  return readWavMetadata(Uint8Array.from(atob(base64), char => char.charCodeAt(0)))
}

export function audioFileExtension(mimeType: string) {
  const mime = mimeType.split(';')[0].toLowerCase()
  return ({ 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/l16': 'pcm', 'audio/mp4': 'm4a', 'audio/webm': 'webm' } as Record<string, string>)[mime] ?? 'audio'
}
