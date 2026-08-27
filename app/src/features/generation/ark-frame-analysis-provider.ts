import type { GenerationRequest } from './generation-adapter'
import type { ModelProvider } from './model-provider-registry'
import { createArkTextLlmProvider, type ArkTextLlmProviderOptions } from './ark-text-llm-provider'

export const frameAnalysisId = 'frame-analysis-api'
export const frameAnalysisMusicReason = '本批仅分析抽帧画面，不读取音轨；音乐维度暂未开放。'
export interface FrameAnalysisReport {
  summary: string
  shots: Array<{ start: number; end: number; description: string; motion: string }>
}

export function parseFrameAnalysisReport(content: string): FrameAnalysisReport {
  let value: FrameAnalysisReport
  try { value = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')) } catch { throw new Error('分析结果格式无效，请重新检查模型输出。') }
  if (!value || typeof value.summary !== 'string' || !value.summary.trim() || !Array.isArray(value.shots) || !value.shots.length || value.shots.length > 100 || value.shots.some((shot, index) =>
    !shot || !Number.isFinite(shot.start) || !Number.isFinite(shot.end) || shot.start < 0 || shot.end <= shot.start ||
    (index > 0 && shot.start < value.shots[index - 1].end) || typeof shot.description !== 'string' || !shot.description.trim() || typeof shot.motion !== 'string')) throw new Error('分析结果格式无效：分镜需有递增时间段与画面描述。')
  return { summary: value.summary, shots: value.shots.map(({ start, end, description, motion }) => ({ start, end, description, motion })) }
}

export function validateFrameAnalysisRequest(request: GenerationRequest) {
  if (request.targetKind !== 'text' || request.referenceAssets.length !== 1 || request.referenceAssets[0].kind !== 'video') throw new Error('拉片分析需要选择一个视频素材。')
  const asset = request.referenceAssets[0]
  if (!['video/mp4', 'video/quicktime', 'video/x-msvideo'].includes(asset.mimeType)) throw new Error('拉片分析仅支持 MP4、MOV 或 AVI，请先转换素材格式。')
  const dataMatch = /^data:(video\/(?:mp4|quicktime|x-msvideo));base64,([a-zA-Z0-9+/]+={0,2})$/.exec(asset.url)
  if (dataMatch) {
    if (dataMatch[1] !== asset.mimeType || dataMatch[2].length > 64_000_000 || Math.floor(dataMatch[2].length * 3 / 4) >= 50_000_000) throw new Error('拉片视频需小于50MB，请先裁短视频。')
  } else {
    try {
      const url = new URL(asset.url)
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid')
    } catch { throw new Error('拉片视频需要 HTTPS 公网地址或本地上传的数据，不能使用 blob 地址。') }
  }
  const fps = Number(request.parameters?.fps ?? 1)
  if (!Number.isFinite(fps) || fps < 0.2 || fps > 5) throw new Error('抽帧频率需为 0.2–5 fps。')
  if (request.parameters?.music) throw new Error(frameAnalysisMusicReason)
  if (request.parameters?.storyboard === false && request.parameters?.motion === false) throw new Error('请至少选择一个分析维度。')
  return fps
}

export function createArkFrameAnalysisProvider(options: ArkTextLlmProviderOptions & { timeoutMs?: number } = {}): ModelProvider {
  const delegate = createArkTextLlmProvider(options, request => [
    { role: 'system', content: '你是视频分镜分析助手，仅根据视频可见画面分析，不猜测音轨。仅输出严格JSON：{"summary":"概述","shots":[{"start":0,"end":1.5,"description":"画面描述","motion":"动态描述"}]}。时间单位秒，分镜时间递增且不重叠，最多100段。不输出Markdown或推理。' },
    { role: 'user', content: [
      { type: 'video_url', video_url: { url: request.referenceAssets[0].url, fps: validateFrameAnalysisRequest(request) } },
      { type: 'text', text: `${request.prompt}。分析维度：${request.parameters?.storyboard === false ? '' : '分镜、'}${request.parameters?.motion === false ? '' : '动态'}。仅抽帧视觉分析，时间边界需人工复核。` },
    ] },
  ])
  const disabledReason = delegate.disabledReason ? '火山方舟拉片分析开发验证配置未完成' : undefined
  return {
    ...delegate, id: frameAnalysisId, modelName: '豆包视频拉片分析', selectorVisible: false, menuCapabilities: [],
    capabilities: ['text', 'frame-analysis'], disabledReason,
    modelNotice: '抽帧视觉分析（0.2–5 fps），不是逐帧精确检测；不分析音轨。按实际输入/输出 token 计费。',
    async generate(request, context) {
      context.signal.throwIfAborted()
      if (disabledReason) throw new Error(disabledReason)
      validateFrameAnalysisRequest(request)
      const controller = new AbortController()
      const abort = () => controller.abort()
      context.signal.addEventListener('abort', abort, { once: true })
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 180_000)
      try {
        const result = await delegate.generate({ ...request, parameters: { ...request.parameters, stream: false, thinking: 'disabled', maxTokens: 4096 } }, { ...context, signal: controller.signal })
        context.signal.throwIfAborted()
        if (timedOut) throw new Error('timeout')
        const report = parseFrameAnalysisReport(result.version.textContent ?? '')
        const content = JSON.stringify(report)
        return { ...result, version: { ...result.version, textContent: content }, asset: { ...result.asset, url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}` },
          usage: result.usage ? { ...result.usage, providerId: frameAnalysisId, modelName: '豆包视频拉片分析' } : undefined }
      } catch (error) {
        context.signal.throwIfAborted()
        if (timedOut) throw new Error('拉片分析超时，请核对官方用量后再试。')
        const message = error instanceof Error ? error.message : ''
        if (message.startsWith('分析结果格式')) throw error
        if (/^火山方舟文本(?:请求参数无效|鉴权失败|模型无访问权限|生成请求过于频繁|生成服务暂不可用)/.test(message)) throw new Error(message.replace('火山方舟文本', '拉片分析'))
        throw new Error('拉片分析请求异常，请检查网络、视频格式及模型权限。')
      } finally {
        clearTimeout(timer)
        context.signal.removeEventListener('abort', abort)
      }
    },
  }
}
