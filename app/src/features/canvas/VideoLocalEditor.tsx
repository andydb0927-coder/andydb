import { useRef, useState } from 'react'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import type { Asset } from '../project/model'
import { videoProcessingPlan } from '../media/video-processing-plan'
import type { VideoSegmentOptions } from '../media/browser-media-processing'
import { useVideoMetadata } from './use-video-metadata'
import './nodes/video-enhancements.css'

export function VideoLocalEditor({ asset, candidates, onClose, onSubmit }: {
  asset: Asset
  candidates: Array<{ title: string; asset: Asset }>
  onClose(): void
  onSubmit(options: VideoSegmentOptions): Promise<void> | void
}) {
  const { metadata, error: metadataError } = useVideoMetadata(asset.url)
  const duration = metadata?.duration ?? 0
  const [endDraft, setEndDraft] = useState<number>()
  const [options, setOptions] = useState<VideoSegmentOptions>({ startSeconds: 0, endSeconds: 0, playbackRate: 1, rotationQuarterTurns: 0, layout: 'single', mirrorHorizontal: false, mirrorVertical: false })
  const effectiveOptions = { ...options, endSeconds: endDraft ?? duration }
  const [urls, setUrls] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const secondaryCount = options.layout === 'pip' ? 1 : options.layout === 'triple' ? 2 : 0
  let reason = ''
  let summary = ''
  try {
    if (!metadata) throw new Error(metadataError ?? '正在读取视频真实尺寸与时长…')
    const plan = videoProcessingPlan(metadata, effectiveOptions)
    summary = `${plan.width} × ${plan.height} · ${plan.durationSeconds.toFixed(2)}s`
  } catch (error) { reason = error instanceof Error ? error.message : '视频元数据尚未读取。' }
  if (urls.slice(0, secondaryCount).filter(Boolean).length !== secondaryCount) reason = `请选择 ${secondaryCount} 个副视频。`
  return <ConfirmDialog portal restoreFocus dismissOnBackdrop initialFocus="button" focusableSelector="button:not(:disabled), select, input" onClose={onClose} label="本地视频变换与合成" overlayClassName="video-local-overlay" className="video-local-editor">
    <header><h2>本地视频变换与合成</h2><button type="button" onClick={onClose}>{busy ? '取消处理' : '关闭'}</button></header>
    <div className="video-local-editor__body">
    <video src={asset.url} controls muted preload="metadata" aria-label="原视频预览" onError={() => setError('视频读取失败，请检查媒体地址。')} />
    <fieldset disabled={busy || !metadata}>
      <label>入点（秒）<input aria-label="合成入点" type="number" min={0} max={duration} step={0.01} value={options.startSeconds} onChange={event => setOptions({ ...options, startSeconds: Number(event.target.value) })} /></label>
      <label>出点（秒）<input aria-label="合成出点" type="number" min={0} max={duration} step={0.01} value={effectiveOptions.endSeconds} onChange={event => setEndDraft(Number(event.target.value))} /></label>
      <label>播放速度<select aria-label="播放速度" value={options.playbackRate} onChange={event => setOptions({ ...options, playbackRate: Number(event.target.value) })}>{[0.25, 0.5, 1, 1.5, 2, 3, 4].map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
      <label>旋转<select aria-label="旋转" value={options.rotationQuarterTurns} onChange={event => setOptions({ ...options, rotationQuarterTurns: Number(event.target.value) })}>{[0, 1, 2, 3].map(turn => <option key={turn} value={turn}>{turn * 90}°</option>)}</select></label>
      <label><input type="checkbox" aria-label="水平镜像" checked={options.mirrorHorizontal} onChange={event => setOptions({ ...options, mirrorHorizontal: event.target.checked })} />水平镜像</label>
      <label><input type="checkbox" aria-label="垂直镜像" checked={options.mirrorVertical} onChange={event => setOptions({ ...options, mirrorVertical: event.target.checked })} />垂直镜像</label>
      <label>合成布局<select aria-label="合成布局" value={options.layout} onChange={event => setOptions({ ...options, layout: event.target.value as VideoSegmentOptions['layout'] })}><option value="single">单画面</option><option value="pip">画中画</option><option value="triple">三分屏</option></select></label>
      {Array.from({ length: secondaryCount }, (_, index) => <label key={index}>副视频 {index + 1}<select aria-label={`副视频 ${index + 1}`} value={urls[index] ?? ''} onChange={event => setUrls(previous => { const next = [...previous]; next[index] = event.target.value; return next })}><option value="">请选择视频</option>{candidates.map(candidate => <option key={candidate.asset.id} value={candidate.asset.url}>{candidate.title}</option>)}</select></label>)}
    </fieldset>
    <p>原视频保持不变，生成新节点与资产。镜像/旋转作用于主片；副视频不足时循环。不含音轨，输出 WebM；不调用 AI、不扣积分。</p>
    {reason ? <p role="status">{reason}</p> : null}{error ? <p role="alert">{error}</p> : null}
    </div>
    <footer>
    <output aria-label="本地视频输出规格">{summary}</output>
    <button type="button" disabled={busy || Boolean(reason)} onClick={async () => {
      if (busyRef.current) return
      busyRef.current = true; setBusy(true); setError('')
      try { await onSubmit({ ...effectiveOptions, secondaryUrls: urls.slice(0, secondaryCount) }); onClose() }
      catch (error) { setError(error instanceof Error ? error.message : '视频处理失败，请重试。') }
      finally { busyRef.current = false; setBusy(false) }
    }}>{busy ? '正在编码…' : '导出处理视频'}</button>
    </footer>
  </ConfirmDialog>
}
