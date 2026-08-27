import type { GenerationRequest, GenerationResult } from './generation-adapter'
import { imageAnalysisFailureDetail } from './generation-errors'
import type { ModelCapability, ModelProvider } from './model-provider-registry'
import { ImageSizeResolver } from './image-size-resolver'
import { arkImageEditModelId, createArkImageEditProvider, estimateArkImageEditCny } from './ark-image-edit-provider'
import { createSeedreamLiveProvider, seedreamImageSizePolicy, type SeedreamLiveProviderOptions } from './seedream-live-provider'
import { resolveModelParameterManifest, standardImageResolutionTiers, type ModelParameterManifest } from './model-parameter-semantics'

export const imageAnalysisTools = [
  { id: 'panorama-720-api', label: '720全景', capability: 'panorama-720', count: 1, columns: 1, notice: '提示词全景：2:1 图片，不保证等距柱状投影或接缝准确；请在全景查看器中复核。' },
  { id: 'multi-camera-grid-api', label: '多机位九宫格', capability: 'multi-camera-grid', count: 9, columns: 3, notice: '串行生成 9 张独立图片并排为 3×3；同一参考图辅助一致性，不保证角色/空间完全一致。' },
  { id: 'plot-four-grid-api', label: '剧情推演四宫格', capability: 'plot-four-grid', count: 4, columns: 2, notice: '本地模板按起因、发展、转折、结果生成 4 张图，不是专用剧情推演模型。' },
  { id: 'storyboard-25-grid-api', label: '25宫格连贯分镜', capability: 'storyboard-continuity', count: 25, columns: 5, notice: '串行调用 25 次，按本地剧情与机位模板排为 5×5；请人工检查叙事与角色一致性。' },
  { id: 'cinematic-lighting-api', label: '电影级光影矫正', capability: 'cinematic-lighting', count: 1, columns: 1, notice: '参考图 AI 重绘，不是无损调色；即使指定框选区域，也不保证框外像素完全不变。' },
] as const satisfies readonly { id: string; label: string; capability: ModelCapability; count: number; columns: number; notice: string }[]

export type ImageAnalysisToolId = typeof imageAnalysisTools[number]['id']
export function isImageAnalysisToolId(id?: string): id is ImageAnalysisToolId {
  return imageAnalysisTools.some(tool => tool.id === id)
}
const resolver = new ImageSizeResolver(seedreamImageSizePolicy)
const cameras = ['正面全景，平视', '左侧中景，平视', '背面全景，平视', '右侧中景，平视', '俯拍远景', '低机位仰拍', '正面近景', '肩后视角中景', '关键道具细节特写']
const plot = ['起因：建立场景与人物目标', '发展：人物开始行动', '转折：呈现矛盾或意外', '结果：交代行动结果']

export function imageAnalysisPlan(request: GenerationRequest) {
  const tool = imageAnalysisTools.find(tool => tool.id === request.providerId)
  if (!tool || request.targetKind !== 'image') throw new Error('请选择已支持的图片分析工具。')
  if (!request.prompt.trim()) throw new Error('请填写场景或编辑描述。')
  if (request.referenceAssets.length > 1 || request.referenceAssets.some(asset => asset.kind !== 'image')) throw new Error('图片分析仅支持一张源图片。')
  if (Number(request.parameters?.count ?? 1) !== 1) throw new Error('工具数量由预设确定，不支持额外数量倍增。')
  const resolution = String(request.parameters?.resolution ?? '1.5K')
  if (!standardImageResolutionTiers.some(tier => tier === resolution)) throw new Error('请选择 1K、1.5K 或 2K 清晰度。')
  const aspectRatio = tool.id === 'panorama-720-api' ? '2:1' : '16:9'
  const size = resolver.resolve({ aspectRatio, resolution })
  let instruction = ''
  if (tool.id === 'cinematic-lighting-api') {
    if (request.referenceAssets.length !== 1) throw new Error('光影矫正需要一张源图片。')
    if (request.parameters?.useBox) {
      const box = ['editX1', 'editY1', 'editX2', 'editY2'].map(key => Number(request.parameters?.[key]))
      if (box.some(n => !Number.isInteger(n) || n < 0 || n > 999) || box[0] >= box[2] || box[1] >= box[3]) throw new Error('请填写有效的 0–999 光影区域。')
      instruction = `优先调整图1 <bbox>${box.join(' ')}</bbox> 区域的光影。`
    }
  }
  const prompts = Array.from({ length: tool.count }, (_, index) => {
    const subject = request.prompt.trim()
    if (tool.id === 'panorama-720-api') return `${subject}。生成用于球面查看器的2:1等距柱状全景图（equirectangular），覆盖水平360度与垂直180度，水平地平线，左右边缘连续，无边框文字。`
    if (tool.id === 'cinematic-lighting-api') return `${instruction}电影级光影矫正：${subject}。主光、辅光、轮廓光自然协调，高光不过曝，保留主体身份与构图。`
    const camera = tool.id === 'multi-camera-grid-api' ? cameras[index] : cameras[index % cameras.length]
    const story = tool.id === 'plot-four-grid-api' ? plot[index] : tool.id === 'storyboard-25-grid-api' ? `${['建立环境', '铺垫目标', '展开行动', '矛盾转折', '结尾回应'][Math.floor(index / 5)]}，阶段内第${index % 5 + 1}镜` : '同一时间同一场景'
    return `${subject}。第${index + 1}/${tool.count}个独立镜头；${story}；机位：${camera}。保持参考图中人物服装、场景与美术风格，输出单幅画面，不拼宫格，不加文字或边框。`
  })
  return { ...tool, ...size, aspectRatio, resolution, prompts, credits: tool.count * 18, costCny: estimateArkImageEditCny(size, tool.count) }
}

export function createArkImageAnalysisProviders(options: SeedreamLiveProviderOptions & { timeoutMs?: number } = {}): ModelProvider[] {
  const delegate = createSeedreamLiveProvider({ ...options, modelId: arkImageEditModelId })
  const edit = createArkImageEditProvider({ ...options, modelId: arkImageEditModelId })
  const parameterManifest: ModelParameterManifest = {
    ...delegate.parameterManifest,
    resolution: { type: 'enum', options: standardImageResolutionTiers, defaultValue: '1.5K' },
    count: { type: 'enum', options: ['1'], defaultValue: '1' },
  }
  return imageAnalysisTools.map(tool => ({
    ...delegate, id: tool.id, name: '火山方舟', modelName: tool.label, selectorVisible: false,
    menuCapabilities: [], capabilities: ['text-to-image', 'image-to-image', tool.capability],
    disabledReason: delegate.disabledReason ? `${tool.label}开发验证配置未完成` : undefined,
    modelNotice: tool.notice,
    parameterManifest,
    parameterSchema: resolveModelParameterManifest(parameterManifest),
    pricing: { amount: tool.count * 18, currency: 'credits', unit: 'generation' },
    sizePolicy: { ...seedreamImageSizePolicy, costMode: { amount: tool.count * 18, per: 'generation' } },
    async generate(request, context) {
      context.signal.throwIfAborted()
      if (delegate.disabledReason) throw new Error(`${tool.label}开发验证配置未完成`)
      const plan = imageAnalysisPlan({ ...request, providerId: tool.id })
      const assets: NonNullable<GenerationResult['assets']> = []
      let incomplete: GenerationResult['incomplete']
      for (const [index, prompt] of plan.prompts.entries()) {
        context.signal.throwIfAborted()
        const controller = new AbortController()
        const abort = () => controller.abort()
        context.signal.addEventListener('abort', abort, { once: true })
        let timedOut = false
        const timer = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 180_000)
        try {
          const source = tool.id === 'cinematic-lighting-api' ? edit : delegate
          const result = await source.generate({ ...request, providerId: source.id, prompt,
            parameters: { aspectRatio: plan.aspectRatio, resolution: plan.resolution, count: 1, imageEditOperation: 'edit' },
          }, { ...context, signal: controller.signal, onProgress: value => context.onProgress?.(Math.floor((index + value / 100) / plan.count * 100)) })
          context.signal.throwIfAborted()
          if (timedOut) throw new Error('timeout')
          const output = result.assets ?? [result.asset]
          if (output.length !== 1) throw new Error('单图请求返回数量异常')
          assets.push(output[0])
        } catch (error) {
          context.signal.throwIfAborted()
          const detail = imageAnalysisFailureDetail(error, timedOut)
          if (!assets.length) throw new Error(`${tool.label}${detail}`, { cause: error })
          incomplete = { completed: assets.length, total: plan.count, reason: `${tool.label}已完成 ${assets.length}/${plan.count} 张，后续失败：${detail}。已保存完成结果；重新执行会重跑整组，请核对官方用量。` }
          break
        } finally {
          clearTimeout(timer)
          context.signal.removeEventListener('abort', abort)
        }
      }
      const asset = assets[0]
      return {
        persistence: 'project', asset, assets, ...(incomplete ? { incomplete } : {}),
        version: { id: crypto.randomUUID(), createdAt: new Date().toISOString(), assetId: asset.id, prompt: request.prompt },
        usage: { providerId: tool.id, providerName: '火山方舟', modelName: tool.label, cost: assets.length * 18, currency: 'credits',
          estimatedCostCny: Number(assets.reduce((sum, image) => sum + estimateArkImageEditCny(image.width && image.height ? image : plan), 0).toFixed(2)) },
      }
    },
  }))
}
