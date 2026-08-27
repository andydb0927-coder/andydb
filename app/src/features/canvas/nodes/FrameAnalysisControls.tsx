import { useId } from 'react'
import { defaultProviderRegistry } from '../../generation/model-provider-registry'
import { frameAnalysisId, frameAnalysisMusicReason, parseFrameAnalysisReport, type FrameAnalysisReport } from '../../generation/ark-frame-analysis-provider'
import type { CreativeNodeData } from '../node-types'

export function FrameAnalysisControls({ data }: { data: CreativeNodeData }) {
  const provider = (data.providerRegistry ?? defaultProviderRegistry).require(frameAnalysisId)
  const reasonId = useId()
  const reason = provider.disabledReason ?? (!data.onOpenAnalysisTool ? '分析入口未连接。' : undefined)
  const version = data.node.versions.find(v => v.id === data.node.activeVersionId)
  let report: FrameAnalysisReport | undefined
  try { if (version?.textContent) report = parseFrameAnalysisReport(version.textContent) } catch { /* Old text versions are not analysis reports. */ }
  return <div className="frame-analysis-controls">
    <strong>火山方舟 · 豆包视频理解</strong>
    <p>选择上游视频或上传视频，按时间段分析分镜与动态；抽帧结果需人工复核。</p>
    <p>{frameAnalysisMusicReason}</p>
    <button type="button" className="specialized-node-details__primary" disabled={Boolean(reason) || data.job?.status === 'running' || data.job?.status === 'queued'} aria-describedby={reason ? reasonId : undefined} onClick={() => data.onOpenAnalysisTool?.(frameAnalysisId)}>开始拉片</button>
    {reason ? <p id={reasonId}>{reason}</p> : <p>本地预计 1 积分；确认页展示 token 计费与素材限制。</p>}
    {report ? <section aria-label="拉片分析结果"><p>{report.summary}</p><ol>{report.shots.map((shot, index) => <li key={index}><strong>{shot.start}s–{shot.end}s</strong><p>{shot.description}</p><p>{shot.motion}</p></li>)}</ol><a download={`${data.node.title}-分析.json`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(report, null, 2))}`}>下载分析报告</a></section> : null}
  </div>
}
