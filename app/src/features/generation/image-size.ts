export const customImageSizeLimits = {
  minPixels: 921_600,
  maxPixels: 4_624_220,
  inputMin: 1,
  inputMax: 10_000,
  step: 1,
  maxAspectRatio: 16,
} as const

export const seedreamAspectRatioOptions = [
  '1:1',
  '1:2',
  '2:1',
  '9:16',
  '16:9',
  '3:4',
  '4:3',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
  '9:21',
] as const

export const seedreamResolutionOptions = ['1K', '1.5K', '2K'] as const

type SeedreamAspectRatio = (typeof seedreamAspectRatioOptions)[number]
type SeedreamResolution = (typeof seedreamResolutionOptions)[number]

const officialSeedreamSizes: Record<
  SeedreamResolution,
  Partial<Record<SeedreamAspectRatio, readonly [number, number]>>
> = {
  '1K': {
    '1:1': [1024, 1024],
    '4:3': [1152, 864],
    '3:4': [864, 1152],
    '16:9': [1424, 800],
    '9:16': [800, 1424],
    '3:2': [1248, 832],
    '2:3': [832, 1248],
    '21:9': [1568, 672],
    '9:21': [672, 1568],
  },
  '1.5K': {
    '1:1': [1536, 1536],
    '4:3': [1792, 1344],
    '3:4': [1344, 1792],
    '16:9': [2048, 1152],
    '9:16': [1152, 2048],
    '3:2': [1872, 1248],
    '2:3': [1248, 1872],
    '21:9': [2352, 1008],
    '9:21': [1008, 2352],
  },
  '2K': {
    '1:1': [2048, 2048],
    '4:3': [2368, 1776],
    '3:4': [1776, 2368],
    '16:9': [2816, 1584],
    '9:16': [1584, 2816],
    '3:2': [2496, 1664],
    '2:3': [1664, 2496],
    '21:9': [3136, 1344],
    '9:21': [1344, 3136],
  },
}

const squareResolutionEdge: Record<SeedreamResolution, number> = {
  '1K': 1024,
  '1.5K': 1536,
  '2K': 2048,
}

function alignToEight(value: number) {
  return Math.max(8, Math.floor(value / 8) * 8)
}

function normalizedSeedreamResolution(value: unknown): SeedreamResolution {
  return value === '1K' || value === '1.5K' ? value : '2K'
}

function normalizedSeedreamAspectRatio(value: unknown): SeedreamAspectRatio {
  return seedreamAspectRatioOptions.includes(value as SeedreamAspectRatio)
    ? value as SeedreamAspectRatio
    : '16:9'
}

function generatedSeedreamSize(
  resolution: SeedreamResolution,
  aspectRatio: SeedreamAspectRatio,
) {
  const [ratioWidth, ratioHeight] = aspectRatio.split(':').map(Number)
  const targetPixels = squareResolutionEdge[resolution] ** 2
  const unit = alignToEight(Math.sqrt(targetPixels / (ratioWidth * ratioHeight)))
  return {
    width: ratioWidth * unit,
    height: ratioHeight * unit,
  }
}

export function constrainSeedreamImageSize(width: number, height: number) {
  const originalWidth = Math.max(1, Math.round(width))
  const originalHeight = Math.max(1, Math.round(height))
  if (originalWidth * originalHeight <= customImageSizeLimits.maxPixels) {
    return { width: originalWidth, height: originalHeight }
  }

  const aspectRatio = originalWidth / originalHeight
  const scale = Math.sqrt(
    customImageSizeLimits.maxPixels / (originalWidth * originalHeight),
  )
  let constrainedWidth: number
  let constrainedHeight: number
  if (aspectRatio >= 1) {
    constrainedWidth = alignToEight(originalWidth * scale)
    constrainedHeight = alignToEight(constrainedWidth / aspectRatio + 4)
  } else {
    constrainedHeight = alignToEight(originalHeight * scale)
    constrainedWidth = alignToEight(constrainedHeight * aspectRatio + 4)
  }

  while (constrainedWidth * constrainedHeight > customImageSizeLimits.maxPixels) {
    if (aspectRatio >= 1) {
      constrainedWidth -= 8
      constrainedHeight = alignToEight(constrainedWidth / aspectRatio + 4)
    } else {
      constrainedHeight -= 8
      constrainedWidth = alignToEight(constrainedHeight * aspectRatio + 4)
    }
  }
  return { width: constrainedWidth, height: constrainedHeight }
}

export function resolveSeedreamImageSize(
  parameters: Record<string, string | number | boolean> | undefined,
) {
  const resolution = normalizedSeedreamResolution(parameters?.resolution)
  if (parameters?.aspectRatio === '自适应') {
    return { apiValue: resolution, label: `自适应 · ${resolution}` }
  }
  if (parameters?.aspectRatio === '自定义') {
    const width = Number(parameters.customWidth)
    const height = Number(parameters.customHeight)
    const error = customImageSizeError(width, height)
    if (error) throw new Error(error)
    return {
      apiValue: `${width}x${height}`,
      label: `${width}×${height}`,
      width,
      height,
    }
  }

  const aspectRatio = normalizedSeedreamAspectRatio(parameters?.aspectRatio)
  const officialSize = officialSeedreamSizes[resolution][aspectRatio]
  const candidate = officialSize
    ? { width: officialSize[0], height: officialSize[1] }
    : generatedSeedreamSize(resolution, aspectRatio)
  const size = constrainSeedreamImageSize(candidate.width, candidate.height)
  return {
    apiValue: `${size.width}x${size.height}`,
    label: `${size.width}×${size.height}`,
    ...size,
  }
}

function greatestCommonDivisor(left: number, right: number) {
  let a = Math.abs(Math.round(left))
  let b = Math.abs(Math.round(right))
  while (b) [a, b] = [b, a % b]
  return a || 1
}

export function customImageSizeError(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return '自定义宽高必须是正整数。'
  }
  const pixels = width * height
  if (pixels < customImageSizeLimits.minPixels || pixels > customImageSizeLimits.maxPixels) {
    return '自定义尺寸总像素需在 921,600–4,624,220 之间。'
  }
  const ratio = width / height
  if (
    ratio > customImageSizeLimits.maxAspectRatio ||
    ratio < 1 / customImageSizeLimits.maxAspectRatio
  ) {
    return '自定义宽高比需在 1:16 到 16:1 之间。'
  }
  return undefined
}

export function simplifiedImageRatio(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return '—'
  }
  const divisor = greatestCommonDivisor(width, height)
  return `${width / divisor}:${height / divisor}`
}
