import type { GenerationRequest } from './generation-adapter'
import { ImageSizeResolver } from './image-size-resolver'
import type { ModelProvider } from './model-provider-registry'
import { createSeedreamLiveProvider, seedreamImageSizePolicy, type SeedreamLiveProviderOptions } from './seedream-live-provider'

export const arkImageEditModelId = 'doubao-seedream-5-0-pro-260628'
export const arkImageUpscaleUnavailable = '暂未开放：火山方舟未提供独立 2x/4x 图片超分接口，不能用重绘冒充高清放大。'
export const arkImageCutoutUnavailable = '暂未开放：当前火山方舟接口未提供自动抠像；透明背景模式要求输入图片已带透明通道。'
export type ArkImageEditOperation = 'edit' | 'outpaint' | 'erase'
export const imageEditDirections = ['四周', '左侧', '右侧', '上方', '下方'] as const
export interface ArkImageEditDraft {
  operation: ArkImageEditOperation
  prompt: string
  width: number
  height: number
  direction?: string
  box?: { x1: number; y1: number; x2: number; y2: number }
}

/** Official prices checked 2026-08-27; local credits are not a CNY exchange rate. */
export function estimateArkImageEditCny(size: { width?: number; height?: number }, count = 1) {
  const pixels = (size.width ?? 0) * (size.height ?? 0)
  return Number(((pixels > 0 && pixels <= 2_610_000 ? 0.3 : 0.6) * count).toFixed(2))
}

export function imageEditParameters(draft: ArkImageEditDraft) {
  return {
    imageEditOperation: draft.operation,
    aspectRatio: '自定义', customWidth: draft.width, customHeight: draft.height,
    resolution: '2K', count: 1,
    ...(draft.direction ? { expandDirection: draft.direction } : {}),
    ...(draft.box ? { editX1: draft.box.x1, editY1: draft.box.y1, editX2: draft.box.x2, editY2: draft.box.y2 } : {}),
  }
}

export function buildArkImageEditPrompt(request: GenerationRequest) {
  const parameters = request.parameters ?? {}
  const operation = parameters.imageEditOperation
  if (!['edit', 'outpaint', 'erase'].includes(String(operation))) throw new Error('图片编辑操作暂不支持')
  if ('mask' in parameters || 'upscaleScale' in parameters) throw new Error('图片编辑不支持独立掩膜或超分倍数参数')
  if (request.targetKind !== 'image' || request.referenceAssets.length !== 1 || request.referenceAssets[0]?.kind !== 'image') {
    throw new Error('图片编辑需要一张源图片，请先选择已有图片结果或上传图片。')
  }
  if (!request.prompt.trim()) throw new Error('请填写图片编辑描述。')
  if (operation === 'erase') {
    const box = ['editX1', 'editY1', 'editX2', 'editY2'].map((key) => Number(parameters[key]))
    if (box.some((value) => !Number.isInteger(value) || value < 0 || value > 999) || box[0]! >= box[2]! || box[1]! >= box[3]!) {
      throw new Error('请框选有效擦除区域，坐标需为 0–999 的整数。')
    }
    return `擦除图1 <bbox>${box.join(' ')}</bbox> 区域内指定的对象：${request.prompt.trim()}。根据周围场景自然补全背景，尽量保持区域外内容、主体身份与光线不变。`
  }
  if (operation === 'outpaint') {
    const direction = String(parameters.expandDirection ?? '')
    if (!(imageEditDirections as readonly string[]).includes(direction)) throw new Error('请选择有效扩图方向。')
    return `将图1的画面向${direction}自然延展至目标输出尺寸，尽量保留原有主体与构图，不拉伸主体。扩展内容：${request.prompt.trim()}。`
  }
  return `编辑图1：${request.prompt.trim()}。尽量保持未指定修改的内容不变。`
}

export function createArkImageEditProvider(options: SeedreamLiveProviderOptions & { timeoutMs?: number } = {}): ModelProvider {
  // Do not inherit the legacy Seedream MODEL_ID: 260128 is Lite, not coordinate-edit Pro.
  const delegate = createSeedreamLiveProvider({ ...options, modelId: options.modelId ?? arkImageEditModelId })
  const resolver = new ImageSizeResolver(seedreamImageSizePolicy)
  const disabledReason = delegate.disabledReason ? '火山方舟图片编辑开发验证配置未完成' : undefined
  return {
    ...delegate,
    id: 'ark-image-edit', modelName: 'Seedream 5.0 Pro 图片编辑', apiDisplayName: '火山方舟图片编辑',
    selectorVisible: false, capabilities: ['image-to-image', 'image-edit'], disabledReason,
    async generate(request, context) {
      context.signal.throwIfAborted()
      if (disabledReason) throw new Error(disabledReason)
      const prompt = buildArkImageEditPrompt(request)
      const size = resolver.resolve(request.parameters)
      if (!['1K', '1.5K', '2K'].includes(String(request.parameters?.resolution ?? '2K'))) throw new Error('图片编辑仅支持 1K、1.5K、2K')
      const controller = new AbortController()
      const cancel = () => controller.abort()
      context.signal.addEventListener('abort', cancel, { once: true })
      let timedOut = false
      const timeout = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 180_000)
      try {
        const result = await delegate.generate({ ...request, prompt }, { ...context, signal: controller.signal })
        context.signal.throwIfAborted()
        if (timedOut) throw new Error('timeout')
        const assets = result.assets ?? [result.asset]
        return {
          ...result,
          version: { ...result.version, prompt: request.prompt },
          usage: {
            providerId: 'ark-image-edit', providerName: '火山方舟', modelName: 'Seedream 5.0 Pro 图片编辑',
            cost: 18 * assets.length, currency: 'credits',
            estimatedCostCny: Number(assets.reduce((total, asset) => total + estimateArkImageEditCny(asset.width && asset.height ? asset : size), 0).toFixed(2)),
          },
        }
      } catch (error) {
        context.signal.throwIfAborted()
        if (timedOut) throw new Error('图片编辑请求超时；请先核对官方用量，避免重复付费。')
        // Delegate errors are sanitized; never reflect raw network errors, keys or response bodies.
        const message = error instanceof Error ? error.message : ''
        if (/^Seedream (?:鉴权失败|访问被拒绝|请求过于频繁或额度不足|提示词未通过安全检查|参考图片未通过安全检查|生成结果未通过安全检查|请求参数无效|请求失败（\d+）|响应格式异常|结果 URL 无效|参考图片必须是 HTTPS 地址或本地上传图片|未返回图片结果|当前仅支持)/u.test(message)) {
          throw new Error(message.replace('Seedream ', '图片编辑 '))
        }
        throw new Error('图片编辑网络异常，请检查网络和服务配置后重试。')
      } finally {
        clearTimeout(timeout)
        context.signal.removeEventListener('abort', cancel)
      }
    },
  }
}
