import { useEffect, useRef, useState } from 'react'

import type { MembershipPlanId } from '../membership/membership-model'
import type { TimelineProject } from './timeline-project'
import { downloadBlob } from '../../shared/browser-download'
import { buildTimelineDownload } from './timeline-serialization'
import type { PreviewRecordingSession } from './timeline-export'
import { compositionErrorMessage, type CompositionProgress } from './timeline-render-export'

interface TimelineExportPanelProps {
  timeline: TimelineProject
  recordingSupported: boolean
  onDownload?: (blob: Blob, filename: string) => void
  onStartRecording?: () => PreviewRecordingSession
  membershipPlan?: MembershipPlanId
  onCompose?: (signal: AbortSignal, progress: (value: CompositionProgress) => void) => Promise<Blob>
}

export function TimelineExportPanel({
  timeline,
  recordingSupported,
  onDownload = downloadBlob,
  onStartRecording,
  onCompose,
}: TimelineExportPanelProps) {
  const [recording, setRecording] = useState<PreviewRecordingSession>()
  const [feedback, setFeedback] = useState<string>()
  const [progress, setProgress] = useState<CompositionProgress>()
  const [composing, setComposing] = useState(false)
  const controllerRef = useRef<AbortController | undefined>(undefined)
  const recordingRef = useRef<PreviewRecordingSession | undefined>(undefined)
  useEffect(() => () => { controllerRef.current?.abort(); controllerRef.current = undefined; recordingRef.current?.stop() }, [])

  const compose = async () => {
    if (!onCompose || controllerRef.current) return
    const controller = new AbortController(); controllerRef.current = controller
    setComposing(true); setFeedback(undefined); setProgress({ phase: 'preparing', fraction: 0 })
    try {
      const blob = await onCompose(controller.signal, value => { if (controllerRef.current === controller && !controller.signal.aborted) setProgress(value) })
      if (controllerRef.current !== controller || controller.signal.aborted) return
      onDownload(blob, `${timeline.title}-合成.webm`)
      setProgress({ phase: 'complete', fraction: 1 })
      setFeedback('合成视频已下载，含转场、字幕和音轨混流。')
    } catch (error) {
      if (controllerRef.current === controller) { setFeedback(compositionErrorMessage(error)); setProgress(undefined) }
    } finally {
      if (controllerRef.current === controller) { controllerRef.current = undefined; setComposing(false) }
    }
  }

  const download = (kind: 'json' | 'edl') => {
    const artifact = buildTimelineDownload(timeline, kind)
    onDownload(new Blob([artifact.content], { type: artifact.mimeType }), artifact.filename)
    setFeedback(artifact.feedback)
  }

  const toggleRecording = () => {
    if (recording) {
      recording.stop()
      recordingRef.current = undefined
      setRecording(undefined)
      setFeedback('预览录制已完成')
      return
    }
    if (!onStartRecording) return
    const session = onStartRecording()
    recordingRef.current = session
    setRecording(session)
    setFeedback('正在录制预览；播放时间线后点击停止。')
  }

  return (
    <section className="timeline-export" aria-labelledby="timeline-export-title">
      <div>
        <p>浏览器端交付</p>
        <h2 id="timeline-export-title">导出剪辑决策</h2>
        <p>未调用云端合成或消耗积分。</p>
      </div>
      <div className="timeline-export__actions">
        <button type="button" onClick={() => download('json')}>
          下载时间线 JSON
        </button>
        <button type="button" onClick={() => download('edl')}>
          下载 EDL
        </button>
        {recordingSupported ? (
          <button type="button" disabled={composing} onClick={toggleRecording}>
            {recording ? '停止录制预览' : '开始录制预览'}
          </button>
        ) : (
          <p>当前浏览器不支持预览流录制，可继续导出 JSON / EDL。</p>
        )}
        <button type="button" disabled={!onCompose || composing || Boolean(recording)} onClick={() => { void compose() }}>导出合成视频</button>
        {composing && <button type="button" onClick={() => controllerRef.current?.abort()}>取消导出</button>}
      </div>
      {progress && <div><progress aria-label="合成导出进度" max={1} value={progress.fraction} /> <span>{{ preparing: '正在准备素材', rendering: '正在合成', encoding: '正在封装', complete: '导出完成' }[progress.phase]} {Math.round(progress.fraction * 100)}%</span></div>}
      <p className="timeline-export__note">
        合成导出按时间戳逐帧编码并离线混音，生成 WebM；耗时取决于片长与设备性能。视频原声需显式提取到音频轨。手动预览录制仅录画面。
      </p>
      {!onCompose && <p>当前浏览器或媒体状态不支持合成导出，可下载 JSON / EDL。</p>}
      {feedback ? <p role="status">{feedback}</p> : null}
    </section>
  )
}
