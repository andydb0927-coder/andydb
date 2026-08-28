import type { VideoSegmentOptions } from './browser-media-processing'

export function videoProcessingPlan(source: { width: number; height: number; duration: number }, options: VideoSegmentOptions) {
  const rate = options.playbackRate ?? 1
  const { startSeconds: start, endSeconds: end } = options
  if (![source.width, source.height, source.duration, start, end, rate].every(Number.isFinite) || source.width <= 0 || source.height <= 0 || start < 0 || end <= start || end > source.duration + 0.1 || rate < 0.25 || rate > 4) throw new Error('视频选区或变速参数无效，请重新选择。')
  const c = options.crop ?? { x: 0, y: 0, width: 1, height: 1 }
  if (!Object.values(c).every(Number.isFinite) || c.x < 0 || c.y < 0 || c.width <= 0 || c.height <= 0 || c.x + c.width > 1.00001 || c.y + c.height > 1.00001) throw new Error('裁剪范围必须位于视频画面内。')
  const turns = options.rotationQuarterTurns ?? 0
  if (!Number.isInteger(turns)) throw new Error('旋转角度必须为 90 度的倍数。')
  const rotation = ((turns % 4) + 4) % 4
  const crop = { x: Math.round(c.x * source.width), y: Math.round(c.y * source.height), width: Math.max(2, Math.round(c.width * source.width)), height: Math.max(2, Math.round(c.height * source.height)) }
  // WebM encoders require even dimensions; never claim an unencoded odd size.
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2)
  const width = even(rotation % 2 ? crop.height : crop.width)
  const height = even(rotation % 2 ? crop.width : crop.height)
  const layers = options.layout === 'triple'
    ? Array.from({ length: 3 }, (_, i) => ({ x: Math.floor(width * i / 3), y: 0, width: Math.floor(width * (i + 1) / 3) - Math.floor(width * i / 3), height }))
    : [{ x: 0, y: 0, width, height }, ...(options.layout === 'pip' ? [{ x: Math.round(width * 0.64), y: Math.round(height * 0.62), width: Math.round(width * 0.32), height: Math.round(height * 0.32) }] : [])]
  return { width, height, crop, rotation, playbackRate: rate, durationSeconds: (Math.min(end, source.duration) - start) / rate, mirrorHorizontal: options.mirrorHorizontal ?? false, mirrorVertical: options.mirrorVertical ?? false, layers }
}
