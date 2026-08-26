export interface ImageResolutionTier {
  id: string
  squareEdge: number
  apiValue?: string
  exactSizes?: Readonly<Record<string, readonly [number, number]>>
}

export interface ImagePixelConstraints {
  minTotalPixels: number
  maxTotalPixels: number
  minRatio: number
  maxRatio: number
}

export interface ImageSizePolicy {
  aspectOptions: readonly string[]
  resolutionTiers: readonly ImageResolutionTier[]
  pixelConstraints: ImagePixelConstraints
  multiImageStrategy: 'single' | 'serial' | 'batch'
  costMode: { amount: number; per: 'generation' | 'image' }
}

export interface ResolvedImageSize {
  apiValue: string
  label: string
  mode: 'preset' | 'adaptive' | 'custom'
  width?: number
  height?: number
}

export type ImageSizeParameters = Record<
  string,
  string | number | boolean
> | undefined

function alignToEight(value: number) {
  return Math.max(8, Math.floor(value / 8) * 8)
}

function ratioParts(value: string) {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/u.exec(value)
  if (!match) return undefined
  const width = Number(match[1])
  const height = Number(match[2])
  return width > 0 && height > 0 ? { width, height } : undefined
}

function formatPixels(value: number) {
  return value.toLocaleString('en-US')
}

function formatRatioBoundary(value: number) {
  return value < 1 ? `1:${1 / value}` : `${value}:1`
}

function greatestCommonDivisor(left: number, right: number) {
  let a = Math.abs(Math.round(left))
  let b = Math.abs(Math.round(right))
  while (b) [a, b] = [b, a % b]
  return a || 1
}

export function simplifiedImageRatio(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return '—'
  }
  const divisor = greatestCommonDivisor(width, height)
  return `${width / divisor}:${height / divisor}`
}

export class ImageSizeResolver {
  readonly policy: ImageSizePolicy

  constructor(policy: ImageSizePolicy) {
    this.policy = policy
  }

  constrain(width: number, height: number) {
    const originalWidth = Math.max(1, Math.round(width))
    const originalHeight = Math.max(1, Math.round(height))
    if (originalWidth * originalHeight <= this.policy.pixelConstraints.maxTotalPixels) {
      return { width: originalWidth, height: originalHeight }
    }

    const aspectRatio = originalWidth / originalHeight
    const scale = Math.sqrt(
      this.policy.pixelConstraints.maxTotalPixels /
        (originalWidth * originalHeight),
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

    while (
      constrainedWidth * constrainedHeight >
      this.policy.pixelConstraints.maxTotalPixels
    ) {
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

  validationError(parameters: ImageSizeParameters) {
    if (parameters?.aspectRatio !== '自定义') return undefined
    const width = Number(parameters.customWidth)
    const height = Number(parameters.customHeight)
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      return '自定义宽高必须是正整数。'
    }
    const pixels = width * height
    const { minTotalPixels, maxTotalPixels, minRatio, maxRatio } =
      this.policy.pixelConstraints
    if (pixels < minTotalPixels || pixels > maxTotalPixels) {
      return `自定义尺寸总像素需在 ${formatPixels(minTotalPixels)}–${formatPixels(maxTotalPixels)} 之间。`
    }
    const ratio = width / height
    if (ratio < minRatio || ratio > maxRatio) {
      return `自定义宽高比需在 ${formatRatioBoundary(minRatio)} 到 ${formatRatioBoundary(maxRatio)} 之间。`
    }
    return undefined
  }

  resolve(parameters: ImageSizeParameters): ResolvedImageSize {
    const tier = this.policy.resolutionTiers.find(
      ({ id }) => id === parameters?.resolution,
    ) ?? this.policy.resolutionTiers[0]
    if (!tier) throw new Error('图片模型未声明分辨率档位')
    const aspectRatio = String(parameters?.aspectRatio ?? this.policy.aspectOptions[0] ?? '')
    if (!this.policy.aspectOptions.includes(aspectRatio)) {
      throw new Error(`图片模型不支持比例 ${aspectRatio}`)
    }
    if (aspectRatio === '自适应') {
      const apiValue = tier.apiValue ?? tier.id
      return { apiValue, label: `自适应 · ${tier.id}`, mode: 'adaptive' }
    }
    if (aspectRatio === '自定义') {
      const error = this.validationError(parameters)
      if (error) throw new Error(error)
      const width = Number(parameters?.customWidth)
      const height = Number(parameters?.customHeight)
      return {
        apiValue: `${width}x${height}`,
        label: `${width}×${height}`,
        mode: 'custom',
        width,
        height,
      }
    }

    const exact = tier.exactSizes?.[aspectRatio]
    const parsedRatio = ratioParts(aspectRatio)
    if (!parsedRatio) throw new Error(`无法解析图片比例 ${aspectRatio}`)
    const candidate = exact
      ? { width: exact[0], height: exact[1] }
      : (() => {
          const unit = alignToEight(
            Math.sqrt(
              tier.squareEdge ** 2 /
                (parsedRatio.width * parsedRatio.height),
            ),
          )
          return {
            width: parsedRatio.width * unit,
            height: parsedRatio.height * unit,
          }
        })()
    const size = this.constrain(candidate.width, candidate.height)
    return {
      apiValue: `${size.width}x${size.height}`,
      label: `${size.width}×${size.height}`,
      mode: 'preset',
      ...size,
    }
  }
}

export function imageSizeResolver(policy: ImageSizePolicy | undefined) {
  return policy ? new ImageSizeResolver(policy) : undefined
}
