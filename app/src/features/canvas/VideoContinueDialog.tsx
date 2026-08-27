import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Asset } from '../project/model'
import { providerGenerationCost, type ModelProvider } from '../generation/model-provider-registry'
import { seedanceVideoTokenRateCny } from '../generation/seedance-video-provider'
import { videoContinuationSourceFailure, type ArkVideoContinueDraft } from '../generation/ark-video-continue-provider'

export function VideoContinueDialog({ asset, provider, busy = false, onSubmit, onClose }: {
  asset: Asset
  provider: ModelProvider
  busy?: boolean
  onSubmit(draft: ArkVideoContinueDraft): void
  onClose(): void
}) {
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(5)
  const [quality, setQuality] = useState('720P')
  const [sound, setSound] = useState(true)
  const [metadata, setMetadata] = useState<Pick<Asset, 'durationSeconds' | 'width' | 'height'>>({})
  const [loadError, setLoadError] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const submittedRef = useRef(false)
  useEffect(() => {
    const trigger = document.activeElement
    dialogRef.current?.querySelector('textarea')?.focus()
    return () => { if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus() }
  }, [])
  const source = { ...asset, ...metadata }
  const error = provider.disabledReason || (busy ? '当前节点已有生成任务，请等待完成。' : '') ||
    (loadError ? '源视频无法读取，请检查链接有效期或更换素材。' : '') || videoContinuationSourceFailure(source) ||
    (!prompt.trim() ? '请填写后续片段的动作、场景与运镜描述。' : '')
  const rate = seedanceVideoTokenRateCny(quality, true)
  const durationSchema = provider.parameterSchema.duration
  const qualitySchema = provider.parameterSchema.quality
  const durationOptions = durationSchema?.type === 'enum' ? durationSchema.options : []
  const qualityOptions = qualitySchema?.type === 'enum' ? qualitySchema.options : []
  const drafts = { prompt: prompt.trim(), duration, quality, sound, sourceDuration: source.durationSeconds ?? NaN, sourceWidth: source.width, sourceHeight: source.height }
  return createPortal(
    <div className="ark-video-continue-overlay nodrag nowheel" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="智能续写" className="ark-video-continue-dialog"
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') { event.preventDefault(); onClose() }
          if (event.key === 'Tab') {
            const elements = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,input,select,video[controls]') ?? [])]
            const first = elements[0], last = elements.at(-1)
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
          }
        }}>
        <header><div><h2>智能续写</h2><p>火山方舟 · Seedance 2.0 视频续写</p></div><button type="button" onClick={onClose} aria-label="关闭智能续写">关闭</button></header>
        <video aria-label="续写源视频" src={asset.url} controls preload="metadata" onError={() => setLoadError(true)}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget
            setMetadata({ durationSeconds: video.duration,
              ...(video.videoWidth > 0 && video.videoHeight > 0 ? { width: video.videoWidth, height: video.videoHeight } : {}),
            })
          }} />
        <p>源视频 {Number.isFinite(source.durationSeconds) ? source.durationSeconds!.toFixed(2) : '待加载'} 秒 · 比例自适应源视频</p>
        <p>根据原片结尾续拍，不自动拼接。结果新增版本，原视频保留；模型实际返回的内容与时长可能有差异。</p>
        <label>续写描述<textarea aria-label="续写描述" maxLength={2000} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="描述结尾之后的动作，例如镜头缓缓推向古桥" /></label>
        <div className="ark-video-continue-dialog__fields">
          <label>输出时长<select aria-label="输出时长" value={duration} onChange={event => setDuration(Number(event.target.value))}>{durationOptions.map(value => <option key={value} value={value}>{value} 秒</option>)}</select></label>
          <label>输出清晰度<select aria-label="输出清晰度" value={quality} onChange={event => setQuality(event.target.value)}>{qualityOptions.map(value => <option key={value}>{value}</option>)}</select></label>
        </div>
        <label className="ark-video-continue-dialog__sound"><input type="checkbox" aria-label="生成声音" checked={sound} onChange={event => setSound(event.target.checked)} />生成声音</label>
        <p>本地预计 {providerGenerationCost(provider, { count: 1, duration })} 积分 · 官方单价 {rate} 元/百万输出 token</p>
        <p>含视频输入有最低 token 用量限制。费用随源片、输出时长与尺寸变化，以官方用量为准；本地积分不等于人民币。</p>
        <p>仅接收官方可访问的 HTTPS MP4/MOV（源片 2–15 秒、≤200MB、24–60fps，需满足肖像授权要求）。本地素材不会自动上传。</p>
        <p>确认后会调用付费 API；取消等待不代表远程任务已取消，超时请先核对官方任务。</p>
        {error ? <p role="status" id="video-continue-reason">{error}</p> : null}
        <footer><button type="button" onClick={onClose}>取消</button><button type="button" disabled={Boolean(error) || submitted} aria-describedby={error ? 'video-continue-reason' : undefined}
          onClick={() => { if (submittedRef.current || error) return; submittedRef.current = true; setSubmitted(true); onSubmit(drafts) }}>确认续写并生成</button></footer>
      </div>
    </div>, document.body,
  )
}
