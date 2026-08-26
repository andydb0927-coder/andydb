import {
  Captions,
  ChevronDown,
  Download,
  Film,
  Maximize2,
  Scissors,
  ScanLine,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { withAppBase } from '../../app/public-url'
import type { Asset, CanvasNode, VideoDerivedTool } from '../project/model'
import type { VideoSegmentOptions } from '../media/browser-media-processing'

type VideoMediaSurface =
  | 'clip'
  | 'crop'
  | 'subtitle-menu'
  | 'smart-erase'
  | 'box-erase'
  | 'audio-menu'
  | 'picture-menu'
  | 'subject-remove'
  | 'subject-modify'
  | 'subject-replace'
  | 'keying'
  | 'preview'

const cropHandles = ['西北', '北', '东北', '东', '东南', '南', '西南', '西'] as const

interface VideoMediaContextBarProps {
  node: CanvasNode
  asset: Asset
  onCreateToolNode?(tool: VideoDerivedTool): void
  onSubmitDraft?(tool: string): void
  onProcessVideo?(options: VideoSegmentOptions): Promise<void> | void
  onExtractAudio?(): Promise<void> | void
}

function DerivedToolConfirmation({
  tool,
  nodeTitle,
  onCancel,
  onConfirm,
}: {
  tool: VideoDerivedTool
  nodeTitle: string
  onCancel(): void
  onConfirm(): void
}) {
  return (
    <div className="video-tool-confirm" role="alertdialog" aria-modal="true" aria-label={`添加${tool}工具节点`}>
      <div>
        <button type="button" aria-label="关闭添加工具节点提示" onClick={onCancel}><X aria-hidden="true" /></button>
        <h2>将添加工具节点</h2>
        <p>“{tool}”会连接到“{nodeTitle}”，并保留可撤销的画布记录。</p>
        <p>本地演示不会触发真实生成或消耗积分。</p>
        <div><button type="button" onClick={onCancel}>取消</button><button type="button" onClick={onConfirm}>确认添加</button></div>
      </div>
    </div>
  )
}

function ClipEditor({
  asset,
  onClose,
  onSubmit,
}: {
  asset: Asset
  onClose(): void
  onSubmit(options: VideoSegmentOptions): void
}) {
  const [snap, setSnap] = useState(false)
  const [loop, setLoop] = useState(true)
  const duration = Math.max(0.25, asset.durationSeconds ?? 3)
  const [startSeconds, setStartSeconds] = useState(0)
  const [endSeconds, setEndSeconds] = useState(duration)
  return (
    <section className="video-inline-editor" role="dialog" aria-modal="false" aria-label="剪辑内联编辑器">
      <header><div><span>节点内草稿</span><h2>剪辑</h2></div><button type="button" aria-label="关闭剪辑内联编辑器" onClick={onClose}><X aria-hidden="true" /></button></header>
      <div className="video-clip-stage"><video src={asset.url} poster={withAppBase('/demo/shot-river.png')} muted loop={loop} preload="metadata" /></div>
      <div className="video-clip-frames" aria-label="12 张缩略帧">
        {Array.from({ length: 12 }, (_, index) => <img key={index} src={withAppBase('/demo/shot-river.png')} alt={`剪辑帧 ${index + 1}`} />)}
      </div>
      <label>入点<input aria-label="视频入点" type="range" min="0" max={Math.max(0, endSeconds - 0.1)} step={snap ? 1 : 0.01} value={startSeconds} onChange={(event) => setStartSeconds(Number(event.target.value))} /></label>
      <label>出点<input aria-label="视频出点" type="range" min={Math.min(duration, startSeconds + 0.1)} max={duration} step={snap ? 1 : 0.01} value={endSeconds} onChange={(event) => setEndSeconds(Number(event.target.value))} /></label>
      <div className="video-inline-editor__readout"><span>{startSeconds.toFixed(2)}–{endSeconds.toFixed(2)} s</span><strong>{Math.max(0, endSeconds - startSeconds).toFixed(2)} s</strong></div>
      <div className="video-inline-editor__toggles">
        <button type="button" aria-label="整数秒吸附" aria-pressed={snap} onClick={() => setSnap((value) => !value)}>整数秒吸附</button>
        <button type="button" aria-label="选区循环播放" aria-pressed={loop} onClick={() => setLoop((value) => !value)}>选区循环播放</button>
      </div>
      <footer><button type="button" onClick={() => { setStartSeconds(0); setEndSeconds(duration); setSnap(false); setLoop(true) }}>取消 / 重置</button><button type="button" onClick={() => onSubmit({ startSeconds, endSeconds })}>确认剪辑并导出 WebM</button></footer>
    </section>
  )
}

function CropEditor({ asset, onClose, onSubmit }: { asset: Asset; onClose(): void; onSubmit(options: VideoSegmentOptions): void }) {
  const [width, setWidth] = useState(80)
  const [height, setHeight] = useState(80)
  const duration = Math.max(0.25, asset.durationSeconds ?? 3)
  return (
    <section className="video-inline-editor" role="dialog" aria-modal="false" aria-label="裁剪内联编辑器">
      <header><div><span>节点内草稿</span><h2>裁剪</h2></div><button type="button" aria-label="关闭裁剪内联编辑器" onClick={onClose}><X aria-hidden="true" /></button></header>
      <div className="video-crop-stage">
        <video src={asset.url} poster={withAppBase('/demo/shot-river.png')} muted preload="metadata" />
        <div className="video-crop-box">
          {cropHandles.map((handle) => <span key={handle} aria-label={`裁剪控制点 ${handle}`} data-position={handle} />)}
        </div>
      </div>
      <label>裁剪宽度<input aria-label="裁剪宽度" type="range" min="20" max="100" value={width} onChange={(event) => setWidth(Number(event.currentTarget.value))} /></label>
      <label>裁剪高度<input aria-label="裁剪高度" type="range" min="20" max="100" value={height} onChange={(event) => setHeight(Number(event.currentTarget.value))} /></label>
      <strong>{Math.round((asset.width ?? 1280) * width / 100)} × {Math.round((asset.height ?? 720) * height / 100)}</strong>
      <footer><button type="button" onClick={onClose}>退出裁剪</button><button type="button" onClick={() => onSubmit({ startSeconds: 0, endSeconds: duration, crop: { x: (100 - width) / 200, y: (100 - height) / 200, width: width / 100, height: height / 100 } })}>生成裁剪并导出 WebM</button></footer>
    </section>
  )
}

function EraseEditor({
  mode,
  onClose,
  onSubmit,
}: {
  mode: '智能擦除' | '框选擦除'
  onClose(): void
  onSubmit(): void
}) {
  const [selected, setSelected] = useState(false)
  const disabledReasonId = mode === '框选擦除' ? 'video-box-erase-disabled-reason' : 'video-smart-erase-disabled-reason'
  return (
    <section className="video-inline-editor" role="dialog" aria-modal="false" aria-label={`${mode}编辑器`}>
      <header><div><span>节点内草稿</span><h2>{mode}</h2></div><button type="button" aria-label={`关闭${mode}编辑器`} onClick={onClose}><X aria-hidden="true" /></button></header>
      {mode === '框选擦除' ? <button type="button" aria-pressed={selected} onClick={() => setSelected(true)}>框选区域</button> : <p>自动识别中英文字幕区域。</p>}
      <div className="video-inline-editor__toggles"><button type="button" disabled={!selected} aria-describedby={!selected ? disabledReasonId : undefined}>撤销</button><button type="button" disabled={!selected} aria-describedby={!selected ? disabledReasonId : undefined}>重做</button><button type="button" disabled={!selected} aria-describedby={!selected ? disabledReasonId : undefined}>重置</button></div>
      {!selected ? <p id={disabledReasonId} className="video-inline-disabled-reason">{mode === '框选擦除' ? '请先框选字幕区域。' : '智能擦除当前没有可撤销的手动选区。'}</p> : null}
      <footer><span>预计成本 {mode === '框选擦除' ? '-' : '--'}</span><button type="button" disabled={mode === '框选擦除' && !selected} aria-describedby={mode === '框选擦除' && !selected ? disabledReasonId : undefined} onClick={onSubmit}>提交{mode}</button></footer>
    </section>
  )
}

function SubjectEditor({
  mode,
  onClose,
}: {
  mode: '主体消除' | '主体修改' | '主体替换'
  onClose(): void
}) {
  const limit = mode === '主体替换' ? 2 : 4
  return (
    <section className="video-subject-editor" role="dialog" aria-modal="true" aria-label={`${mode}编辑器`}>
      <header><div><span>节点内草稿</span><h2>{mode}</h2></div><button type="button" aria-label={`关闭${mode}编辑器`} onClick={onClose}><X aria-hidden="true" /></button></header>
      <strong>已选择主体 (0/{limit})</strong>
      <div role="toolbar" aria-label="主体标注工具">{['点选', '框选', '画笔', '橡皮擦'].map((tool) => <button key={tool} type="button">{tool}</button>)}</div>
      <label>帧位置<input type="range" min="0" max="3" step="0.1" defaultValue="0" /></label>
      <p id="video-subject-disabled-reason" className="video-inline-disabled-reason">请先选择并标注主体。</p>
      <footer><span>预计成本 --</span><button type="button" disabled aria-describedby="video-subject-disabled-reason">确定</button></footer>
    </section>
  )
}

export function VideoMediaContextBar({
  node,
  asset,
  onCreateToolNode,
  onSubmitDraft,
  onProcessVideo,
  onExtractAudio,
}: VideoMediaContextBarProps) {
  const [surface, setSurface] = useState<VideoMediaSurface>()
  const [pendingTool, setPendingTool] = useState<VideoDerivedTool>()

  useEffect(() => {
    setSurface(undefined)
    setPendingTool(undefined)
  }, [node.id])
  useEffect(() => {
    if (!surface && !pendingTool) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSurface(undefined)
      setPendingTool(undefined)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [pendingTool, surface])

  const submitDraft = (tool: string) => {
    onSubmitDraft?.(tool)
    setSurface(undefined)
  }
  const downloadCurrent = () => {
    const anchor = document.createElement('a')
    anchor.href = asset.url
    anchor.download = `${node.title}.mp4`
    anchor.click()
  }

  return (
    <>
      <div className="selection-context-bar selection-context-bar--video floating-panel" role="toolbar" aria-label="视频媒体处理工具">
        <button type="button" onClick={() => setSurface('clip')}><Scissors aria-hidden="true" />剪辑</button>
        <button type="button" disabled title="片段重拍暂未开放" aria-describedby="video-reshoot-reason">片段重拍</button>
        <button type="button" onClick={() => setSurface('crop')}>裁剪</button>
        <button type="button" onClick={() => setPendingTool('视频高清')}><ScanLine aria-hidden="true" />高清</button>
        <button type="button" onClick={() => setPendingTool('逐帧拉片')}><Film aria-hidden="true" />逐帧拉片</button>
        <button type="button" disabled title="智能续写暂未开放" aria-describedby="video-extend-reason">智能续写</button>
        <button type="button" aria-haspopup="menu" aria-expanded="false" disabled title="智能去字幕暂未开放" aria-describedby="video-subtitle-reason"><Captions aria-hidden="true" />智能去字幕<ChevronDown aria-hidden="true" /></button>
        <button type="button" aria-haspopup="menu" aria-expanded={surface === 'audio-menu'} onClick={() => setSurface('audio-menu')}>音频分离<ChevronDown aria-hidden="true" /></button>
        <button type="button" aria-haspopup="menu" aria-expanded="false" disabled title="画面编辑暂未开放" aria-describedby="video-picture-reason"><Sparkles aria-hidden="true" />画面编辑<ChevronDown aria-hidden="true" /></button>
        <button type="button" data-compact="true" aria-label="下载" title="下载" onClick={downloadCurrent}><Download aria-hidden="true" /><span className="visually-hidden">下载</span></button>
        <button type="button" data-compact="true" aria-label="预览" title="预览" onClick={() => setSurface('preview')}><Maximize2 aria-hidden="true" /><span className="visually-hidden">预览</span></button>
      </div>
      <div className="video-disabled-reasons visually-hidden" role="note" aria-label="视频工具禁用原因">
        <span id="video-reshoot-reason">片段重拍暂未开放：尚未接入媒体重拍模型。</span>
        <span id="video-extend-reason">智能续写暂未开放：尚未接入续写模型能力。</span>
        <span id="video-subtitle-reason">智能去字幕暂未开放：尚未接入可持久化的擦除结果。</span>
        <span id="video-picture-reason">画面编辑暂未开放：尚未接入主体编辑结果。</span>
      </div>

      {surface === 'clip' ? <ClipEditor asset={asset} onClose={() => setSurface(undefined)} onSubmit={(options) => { void onProcessVideo?.(options); setSurface(undefined) }} /> : null}
      {surface === 'crop' ? <CropEditor asset={asset} onClose={() => setSurface(undefined)} onSubmit={(options) => { void onProcessVideo?.(options); setSurface(undefined) }} /> : null}

      {surface === 'subtitle-menu' ? (
        <div className="video-tool-menu" role="menu" aria-label="智能去字幕">
          <button type="button" role="menuitem" onClick={() => setSurface('smart-erase')}>智能擦除</button>
          <button type="button" role="menuitem" onClick={() => setSurface('box-erase')}>框选擦除</button>
        </div>
      ) : null}
      {surface === 'smart-erase' ? <EraseEditor mode="智能擦除" onClose={() => setSurface(undefined)} onSubmit={() => submitDraft('智能擦除')} /> : null}
      {surface === 'box-erase' ? <EraseEditor mode="框选擦除" onClose={() => setSurface(undefined)} onSubmit={() => submitDraft('框选擦除')} /> : null}

      {surface === 'audio-menu' ? (
        <div className="video-tool-menu video-tool-menu--with-reasons" role="menu" aria-label="音频分离">
          <div><button type="button" role="menuitem" disabled aria-describedby="voice-separation-reason">人声分离</button><span id="voice-separation-reason">人声/伴奏分轨需要独立模型，暂未开放。</span></div>
          <div><button type="button" role="menuitem" onClick={() => { void onExtractAudio?.(); setSurface(undefined) }}>音视频分离</button><span>读取当前视频音轨并导出 WAV，同时保存到资产库。</span></div>
        </div>
      ) : null}

      {surface === 'picture-menu' ? (
        <div className="video-tool-menu" role="menu" aria-label="画面编辑">
          <button type="button" role="menuitem" onClick={() => setSurface('subject-remove')}>主体消除</button>
          <button type="button" role="menuitem" onClick={() => setSurface('subject-modify')}>主体修改</button>
          <button type="button" role="menuitem" onClick={() => setSurface('subject-replace')}>主体替换</button>
          <button type="button" role="menuitem" onClick={() => setSurface('keying')}>智能抠像</button>
        </div>
      ) : null}
      {surface === 'subject-remove' ? <SubjectEditor mode="主体消除" onClose={() => setSurface(undefined)} /> : null}
      {surface === 'subject-modify' ? <SubjectEditor mode="主体修改" onClose={() => setSurface(undefined)} /> : null}
      {surface === 'subject-replace' ? <SubjectEditor mode="主体替换" onClose={() => setSurface(undefined)} /> : null}
      {surface === 'keying' ? (
        <section className="video-inline-editor" role="dialog" aria-modal="false" aria-label="智能抠像编辑器">
          <header><h2>智能抠像</h2><button type="button" aria-label="关闭智能抠像编辑器" onClick={() => setSurface(undefined)}><X aria-hidden="true" /></button></header>
          <p>节点内轻量生成器</p><footer><span>预计成本 1</span><button type="button" onClick={() => submitDraft('智能抠像')}>生成</button></footer>
        </section>
      ) : null}

      {surface === 'preview' ? (
        <div className="video-preview-dialog" role="dialog" aria-modal="true" aria-label="视频预览">
          <button type="button" aria-label="关闭视频预览" onClick={() => setSurface(undefined)}><X aria-hidden="true" /></button>
          <h2>{node.title}</h2>
          <video src={asset.url} poster={withAppBase('/demo/shot-river.png')} controls autoPlay={false} preload="metadata" />
          <span>0:00 / 0:03 · 1x</span>
        </div>
      ) : null}

      {pendingTool ? (
        <DerivedToolConfirmation
          tool={pendingTool}
          nodeTitle={node.title}
          onCancel={() => setPendingTool(undefined)}
          onConfirm={() => {
            onCreateToolNode?.(pendingTool)
            setPendingTool(undefined)
          }}
        />
      ) : null}
    </>
  )
}
