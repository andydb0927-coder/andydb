import { useEffect, useId, useRef, useState } from 'react'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import type { Asset } from '../project/model'
import type { GenerationRequest } from '../generation/generation-adapter'
import type { ModelProvider } from '../generation/model-provider-registry'
import { imageAnalysisParameterDefaults } from '../generation/image-analysis-parameters'
import { imageAnalysisPlan } from '../generation/ark-image-analysis-provider'
import { frameAnalysisId, frameAnalysisMusicReason, validateFrameAnalysisRequest } from '../generation/ark-frame-analysis-provider'

export interface ArkAnalysisDraft {
  prompt: string
  parameters: NonNullable<GenerationRequest['parameters']>
  source?: Asset
}

export function ArkAnalysisDialog({ provider, assets, initialSource, initialPrompt = '', initialParameters = {}, busy = false, onSubmit, onClose, onImportFile }: {
  provider: ModelProvider
  assets: Asset[]
  initialSource?: Asset
  initialPrompt?: string
  initialParameters?: GenerationRequest['parameters']
  busy?: boolean
  onSubmit(draft: ArkAnalysisDraft): void
  onClose(): void
  onImportFile?(file: File): Promise<Asset>
}) {
  const frame = provider.id === frameAnalysisId
  const title = frame ? '逐帧拉片分析' : provider.modelName
  const [prompt, setPrompt] = useState(initialPrompt || (frame ? '分析视频的分镜变化和人物动态。' : ''))
  const defaults = imageAnalysisParameterDefaults(provider, initialParameters)
  const resolutionSchema = provider.parameterSchema.resolution
  const resolutionOptions = resolutionSchema?.type === 'enum' ? resolutionSchema.options : []
  const [resolution, setResolution] = useState(defaults.resolution)
  const [sourceId, setSourceId] = useState(initialSource?.id ?? '')
  const [uploaded, setUploaded] = useState<Asset>()
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [fps, setFps] = useState(Number(initialParameters.fps ?? 1))
  const [storyboard, setStoryboard] = useState(initialParameters.storyboard !== false)
  const [motion, setMotion] = useState(initialParameters.motion !== false)
  const [useBox, setUseBox] = useState(initialParameters.useBox === true)
  const [box, setBox] = useState({ editX1: Number(initialParameters.editX1 ?? 0), editY1: Number(initialParameters.editY1 ?? 0), editX2: Number(initialParameters.editX2 ?? 999), editY2: Number(initialParameters.editY2 ?? 999) })
  const [submitted, setSubmitted] = useState(false)
  const submittedRef = useRef(false)
  const errorId = useId()
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const available = [...new Map([...assets, ...(initialSource ? [initialSource] : []), ...(uploaded ? [uploaded] : [])].map(asset => [asset.id, asset])).values()].filter(asset => asset.kind === (frame ? 'video' : 'image'))
  const source = available.find(asset => asset.id === sourceId)
  const parameters: NonNullable<GenerationRequest['parameters']> = frame ? { fps, storyboard, motion, music: false } : { resolution, count: defaults.count, useBox, ...box }
  const request: GenerationRequest = {
    projectId: '', nodeId: '', operation: 'regenerate', targetKind: frame ? 'text' : 'image', providerId: provider.id, prompt,
    parameters, referenceAssets: source && source.kind !== 'text' ? [{ kind: source.kind, url: source.url, mimeType: source.mimeType }] : [],
  }
  let plan: ReturnType<typeof imageAnalysisPlan> | undefined
  let error = provider.disabledReason ?? (busy ? '当前节点已有任务，请等待完成。' : uploadError)
  try {
    if (!prompt.trim()) throw new Error('请填写描述。')
    if (frame) validateFrameAnalysisRequest(request)
    else plan = imageAnalysisPlan(request)
  } catch (failure) { error ||= failure instanceof Error ? failure.message : '请检查输入。' }

  return (
    <ConfirmDialog portal as="section" label={title} overlayClassName="ark-image-edit-overlay nodrag nowheel" className="ark-image-edit-dialog ark-analysis-dialog"
      initialFocus="textarea" focusableSelector="button:not(:disabled),input:not(:disabled),select,textarea,summary" restoreFocus dismissOnBackdrop onClose={onClose}>
        <header><h2>{title}</h2><button type="button" aria-label={`关闭${title}`} onClick={onClose}>关闭</button></header>
        <p>火山方舟 · {frame ? '豆包视频理解' : 'Seedream 5.0 Pro'} · 官方 API</p>
        <p>{provider.modelNotice}</p>
        <label>源素材<select aria-label="源素材" value={sourceId} onChange={event => setSourceId(event.target.value)}>
          <option value="">{frame || provider.id === 'cinematic-lighting-api' ? '请选择素材' : '不使用参考图'}</option>
          {available.map((asset, index) => <option key={asset.id} value={asset.id}>{asset.kind === 'video' ? '视频' : '图片'} {index + 1}{asset.id === initialSource?.id ? '（当前来源）' : ''}</option>)}
        </select></label>
        {onImportFile ? <label>上传{frame ? '视频' : '图片'}<input type="file" aria-label="上传分析素材" disabled={uploadBusy} accept={frame ? 'video/mp4,video/quicktime,video/x-msvideo' : 'image/png,image/jpeg,image/webp'} onChange={async event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          if (frame && file.size >= 48_000_000) { setUploadError('请上传小于48MB的视频，避免Base64请求超过64MB。'); return }
          setUploadBusy(true); setUploadError('')
          try { const asset = await onImportFile(file); if (active.current) { setUploaded(asset); setSourceId(asset.id) } }
          catch { if (active.current) setUploadError('素材导入失败，请检查类型和大小。') }
          finally { if (active.current) setUploadBusy(false) }
        }} /></label> : null}
        {source ? (frame ? <video controls preload="metadata" src={source.url} aria-label="分析源视频" /> : <img className="ark-analysis-dialog__image" src={source.url} alt="分析源图片" />) : null}
        <label>{frame ? '分析要求' : '场景或光影描述'}<textarea aria-label="分析描述" maxLength={2000} value={prompt} onChange={event => setPrompt(event.target.value)} /></label>
        {frame ? <>
          <label>抽帧频率<input type="number" aria-label="抽帧频率" min={0.2} max={5} step={0.2} value={fps} onChange={event => setFps(Number(event.target.value))} /></label>
          <fieldset><legend>分析维度</legend>
            <label><input type="checkbox" checked={storyboard} onChange={event => setStoryboard(event.target.checked)} />分镜维度</label>
            <label><input type="checkbox" checked={motion} onChange={event => setMotion(event.target.checked)} />动态维度</label>
            <label><input type="checkbox" disabled checked={false} readOnly />音乐维度</label>
            <p>{frameAnalysisMusicReason}</p>
          </fieldset>
          <p>本地预计 1 积分；官方输入 ¥6/百万 token、输出 ¥30/百万 token，最终以 usage 和账单为准。视频需小于50MB，格式 MP4/MOV/AVI。</p>
        </> : <>
          <label>输出清晰度<select aria-label="输出清晰度" value={resolution} onChange={event => setResolution(event.target.value)}>{resolutionOptions.map(value => <option key={value}>{value}</option>)}</select></label>
          {provider.id === 'cinematic-lighting-api' ? <fieldset><legend>局部光影</legend>
            <label><input type="checkbox" checked={useBox} onChange={event => setUseBox(event.target.checked)} />指定光影区域</label>
            {useBox ? <div className="ark-image-edit-dialog__fields">{([['editX1', '左边界'], ['editY1', '上边界'], ['editX2', '右边界'], ['editY2', '下边界']] as const).map(([key, label]) => <label key={key}>{label}<input aria-label={label} type="number" min={0} max={999} value={box[key]} onChange={event => setBox({ ...box, [key]: Number(event.target.value) })} /></label>)}</div> : null}
          </fieldset> : null}
          {plan ? <>
            <p>实际请求尺寸 {plan.width} × {plan.height} · 串行 {plan.count} 次 · {plan.count} 张 · {plan.credits} 积分 · 官方预计 ¥{plan.costCny.toFixed(2)}</p>
            <details><summary>查看逐格提示词（{plan.count}）</summary><ol>{plan.prompts.map((text, index) => <li key={index}>{text}</li>)}</ol></details>
          </> : null}
        </>}
        <p>确认后调用真实 API。失败不自动重试；取消不能撤销服务端已发生的费用。结果写入项目版本、资产与历史，URL 有效期以服务商为准。</p>
        {error ? <p role="status" id={errorId}>{error}</p> : null}
        <footer><button type="button" onClick={onClose}>取消</button><button type="button" disabled={Boolean(error) || submitted || uploadBusy} aria-describedby={error ? errorId : undefined} onClick={() => { if (submittedRef.current) return; submittedRef.current = true; setSubmitted(true); onSubmit({ prompt, parameters, source }) }}>{frame ? '确认分析' : '确认生成'}</button></footer>
    </ConfirmDialog>
  )
}
