import type { Asset } from '../project/model'
import type { GenerationRequest } from './generation-adapter'
import { mapToolGenerationError } from './generation-errors'
import type { ModelProvider } from './model-provider-registry'
import { createSeedanceVideoProvider, type SeedanceVideoProviderOptions } from './seedance-video-provider'

export const arkVideoContinueId = 'ark-video-continue'
export const arkVideoContinueModelId = 'doubao-seedance-2-0-260128'
export const videoReshootUnavailable = '片段重拍暂未开放：Seedance 2.0 无精确时间区间重拍参数，不能保证区间外原片不变。'
export const videoSubtitleUnavailable = '智能去字幕暂未开放：Seedance 2.0 未提供字幕区域或时序掩膜修复接口。'

export interface ArkVideoContinueDraft {
  prompt: string
  duration: number
  quality: string
  sound: boolean
  sourceDuration: number
  sourceWidth?: number
  sourceHeight?: number
}

type VideoSource = Pick<Asset, 'kind' | 'url' | 'mimeType' | 'durationSeconds' | 'width' | 'height'>

export function videoContinuationSourceFailure(source: VideoSource): string | undefined {
  if (source.kind !== 'video' || !['video/mp4', 'video/quicktime'].includes(source.mimeType)) {
    return '智能续写需要 MP4/MOV 源视频，其他格式暂不可用。'
  }
  try {
    const url = new URL(source.url)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid')
  } catch {
    return '智能续写需要官方可访问的 HTTPS 视频地址；本地素材尚未上传，不能直接提交。'
  }
  if (!Number.isFinite(source.durationSeconds) || source.durationSeconds! < 2 || source.durationSeconds! > 15) {
    return '智能续写源视频时长需为 2–15 秒；请等待元数据加载或更换视频。'
  }
  if (source.width !== undefined || source.height !== undefined) {
    const width = source.width ?? 0, height = source.height ?? 0
    const pixels = width * height, ratio = width / height
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 300 || height < 300 || width > 6000 || height > 6000 || ratio < 0.4 || ratio > 2.5 || pixels < 407696 || pixels > 8295044) {
      return '源视频尺寸不符合 Seedance 要求：边长 300–6000、宽高比 0.4–2.5、总像素 407696–8295044。'
    }
  }
  return undefined
}

export function videoContinueParameters(draft: ArkVideoContinueDraft) {
  return {
    videoPostOperation: 'continue', generationMode: '全能参考', aspectRatio: 'Auto', count: 1,
    duration: draft.duration, quality: draft.quality, sound: draft.sound,
    sourceDuration: draft.sourceDuration,
    ...(draft.sourceWidth !== undefined ? { sourceWidth: draft.sourceWidth } : {}),
    ...(draft.sourceHeight !== undefined ? { sourceHeight: draft.sourceHeight } : {}),
  }
}

export function buildArkVideoContinuePrompt(request: GenerationRequest) {
  const parameters = request.parameters ?? {}
  if (parameters.videoPostOperation !== 'continue' || ['start', 'end', 'startSeconds', 'endSeconds', 'mask', 'omni_reference_task_type'].some(key => key in parameters)) {
    throw new Error('此接口仅支持参考视频续写，不支持精确区间重拍或字幕掩膜擦除。')
  }
  if (request.targetKind !== 'video' || request.referenceAssets.length !== 1) throw new Error('智能续写需要且只接受一段源视频。')
  const sourceFailure = videoContinuationSourceFailure({ ...request.referenceAssets[0]!,
    durationSeconds: Number(parameters.sourceDuration),
    ...(parameters.sourceWidth !== undefined ? { width: Number(parameters.sourceWidth) } : {}),
    ...(parameters.sourceHeight !== undefined ? { height: Number(parameters.sourceHeight) } : {}),
  })
  if (sourceFailure) throw new Error(sourceFailure)
  const duration = Number(parameters.duration)
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) throw new Error('续写输出时长需为 4–15 秒整数。')
  if (!['480P', '720P', '1080P', '4K'].includes(String(parameters.quality))) throw new Error('请选择受支持的续写清晰度。')
  if (Number(parameters.count ?? 1) !== 1) throw new Error('智能续写每次仅生成一个视频。')
  const prompt = request.prompt.trim()
  if (!prompt || prompt.length > 2000) throw new Error('请填写 1–2000 字的续写描述。')
  return `延长@视频1，从视频结尾继续：${prompt}。保持主体、场景与运动衔接。`
}

export function createArkVideoContinueProvider(options: SeedanceVideoProviderOptions & { timeoutMs?: number } = {}): ModelProvider {
  const configuredModel = options.modelId ?? import.meta.env.VITE_ARK_VIDEO_MODEL_ID
  const modelId = configuredModel?.trim() || arkVideoContinueModelId
  const delegate = createSeedanceVideoProvider({ ...options, modelId })
  const disabledReason = delegate.disabledReason ? '火山方舟视频续写开发验证配置未完成'
    : modelId !== arkVideoContinueModelId ? '当前模型的视频续写契约尚未核对，请配置 Seedance 2.0（doubao-seedance-2-0-260128）。' : undefined
  return {
    ...delegate, id: arkVideoContinueId, modelName: 'Seedance 2.0 视频续写',
    selectorVisible: false, capabilities: ['video-continue'], disabledReason,
    modelNotice: '基于完整参考视频续拍；不自动拼接原片。',
    async generate(request, context) {
      context.signal.throwIfAborted()
      if (disabledReason) throw new Error(disabledReason)
      const prompt = buildArkVideoContinuePrompt(request)
      const controller = new AbortController()
      const cancel = () => controller.abort()
      context.signal.addEventListener('abort', cancel, { once: true })
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 600_000)
      try {
        const result = await delegate.generate({ ...request, prompt,
          parameters: { ...request.parameters, aspectRatio: 'Auto', generationMode: '全能参考' },
        }, { ...context, signal: controller.signal })
        context.signal.throwIfAborted()
        if (timedOut) throw new Error('timeout')
        return { ...result, persistence: 'project', version: { ...result.version, prompt: request.prompt },
          usage: { ...result.usage, providerId: arkVideoContinueId, providerName: '火山方舟', modelName: 'Seedance 2.0 视频续写', cost: 135, currency: 'credits' },
        }
      } catch (error) {
        context.signal.throwIfAborted()
        throw mapToolGenerationError(error, 'video-continue', timedOut)
      } finally {
        clearTimeout(timer)
        context.signal.removeEventListener('abort', cancel)
      }
    },
  }
}
