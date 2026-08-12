import { useState } from 'react'

import type { TimelineProject } from './timeline-project'
import {
  downloadBlob,
  serializeTimelineEdl,
  serializeTimelineJson,
  type PreviewRecordingSession,
} from './timeline-export'

interface TimelineExportPanelProps {
  timeline: TimelineProject
  recordingSupported: boolean
  onDownload?: (blob: Blob, filename: string) => void
  onStartRecording?: () => PreviewRecordingSession
}

export function TimelineExportPanel({
  timeline,
  recordingSupported,
  onDownload = downloadBlob,
  onStartRecording,
}: TimelineExportPanelProps) {
  const [recording, setRecording] = useState<PreviewRecordingSession>()
  const [feedback, setFeedback] = useState<string>()

  const download = (kind: 'json' | 'edl') => {
    const content =
      kind === 'json'
        ? serializeTimelineJson(timeline)
        : serializeTimelineEdl(timeline)
    onDownload(
      new Blob([content], {
        type: kind === 'json' ? 'application/json' : 'text/plain',
      }),
      `${timeline.title}.${kind}`,
    )
    setFeedback(kind === 'json' ? 'JSON 已开始下载' : 'EDL 已开始下载')
  }

  const toggleRecording = () => {
    if (recording) {
      recording.stop()
      setRecording(undefined)
      setFeedback('预览录制已完成')
      return
    }
    if (!onStartRecording) return
    setRecording(onStartRecording())
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
          <button type="button" onClick={toggleRecording}>
            {recording ? '停止录制预览' : '开始录制预览'}
          </button>
        ) : (
          <p>当前浏览器不支持预览流录制，可继续导出 JSON / EDL。</p>
        )}
      </div>
      <p className="timeline-export__note">
        MediaRecorder 仅录制预览画布；本阶段不做 FFmpeg 合成与音频混流。
      </p>
      {feedback ? <p role="status">{feedback}</p> : null}
    </section>
  )
}

