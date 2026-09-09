import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Project } from '../project/model'
import { resolveDubbingSource, type DubbingSourceSelection } from './dubbing-canvas-adapter'
import { DubbingDialog } from './DubbingDialog'
import { defaultDubbingRepository, type DubbingWorkbenchRepository } from './dubbing-workbench-repository'
import { dubbingUiError, type DubbingWorkspace } from './dubbing-workbench-model'
import { formatDubbingEpisodeNumber } from './dubbing-localization-plan'

export function DubbingIntakeDialog({ project, selection, onClose, repository = defaultDubbingRepository }: {
  project: Project; selection: DubbingSourceSelection; onClose(): void; repository?: DubbingWorkbenchRepository
}) {
  const [workspace, setWorkspace] = useState<DubbingWorkspace>(), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [savedId, setSavedId] = useState(''), [targetId, setTargetId] = useState('')
  const inFlight = useRef(false)
  useEffect(() => {
    let active = true
    repository.load(project.id).then(value => { if (active) setWorkspace(value) }, () => { if (active) setError('无法读取工作台，请关闭后重试。') })
    return () => { active = false }
  }, [project.id, repository])
  let source
  try { source = resolveDubbingSource(project, selection) } catch (failure) {
    return <DubbingDialog title="送审到工作台" onClose={onClose}><p role="alert">{dubbingUiError(failure, '无法读取送审来源。')}</p></DubbingDialog>
  }
  return <DubbingDialog title="送审到工作台" onClose={onClose} busy={busy}>
    {savedId ? <div role="status"><p>已保存到本地工作台；未触发生成或自动审核。</p>
      <Link className="dubbing-primary" to={`/dubbing?projectId=${encodeURIComponent(project.id)}&shotId=${encodeURIComponent(savedId)}`}>打开工作台</Link></div>
      : <form onSubmit={async event => {
        event.preventDefault()
        if (inFlight.current || !workspace) return
        const form = new FormData(event.currentTarget)
        inFlight.current = true; setBusy(true); setError('')
        try {
          const result = await repository.intake(source, { episodeNumber: Number(form.get('episode')), shotNumber: Number(form.get('shot')),
            sourceAssetId: String(form.get('sourceAssetId') ?? ''),
            startMs: Number(form.get('start')), endMs: Number(form.get('end')), originalDialogue: String(form.get('original') ?? ''),
            localizedDialogue: String(form.get('localized') ?? ''), framing: String(form.get('framing') ?? ''), camera: String(form.get('camera') ?? '') }, targetId || undefined)
          setSavedId(result.shotId)
        } catch (failure) { setError(dubbingUiError(failure)) }
        finally { inFlight.current = false; setBusy(false) }
      }}>
        <p>来源：{source.title} · 已有{source.asset.kind === 'image' ? '图片' : source.asset.kind === 'video' ? '视频' : '媒体'}结果</p>
        <p className="dubbing-muted">原片时间码请人工填写，不能用生成片段时长替代。资料仅保存在当前浏览器。</p>
        <label>送审目标<select value={targetId} onChange={event => setTargetId(event.target.value)} disabled={busy}>
          <option value="">新建镜头记录</option>
          {workspace?.shots.filter(shot => ['待生成', '待返修'].includes(shot.record.status) && !shot.pending).map(shot =>
            <option key={shot.record.id} value={shot.record.id}>{formatDubbingEpisodeNumber(shot.record.episodeNumber)} 镜头 {shot.record.shotNumber} · {shot.record.status}</option>)}
        </select></label>
        {!targetId && workspace && <>
          <label>原片资产引用<input name="sourceAssetId" required disabled={busy} placeholder="原片资产 ID 或外部素材编号，不是本次生成结果" /></label>
          <div className="dubbing-field-pair"><label>集号<input name="episode" type="number" required min="1" max="999" defaultValue="1" disabled={busy} /></label>
            <label>镜号<input name="shot" type="number" required min="1" defaultValue={Math.max(0, ...(workspace?.shots.filter(shot => shot.record.episodeNumber === 1).map(shot => shot.record.shotNumber) ?? [])) + 1} disabled={busy} /></label></div>
          <div className="dubbing-field-pair"><label>原片起点（毫秒）<input name="start" type="number" min="0" step="1" required defaultValue="0" disabled={busy} /></label>
            <label>原片终点（毫秒）<input name="end" type="number" min="1" step="1" required disabled={busy} /></label></div>
          <label>台词原文<textarea name="original" disabled={busy} placeholder="无台词镜头可留空" /></label>
          <label>本地化台词<textarea name="localized" disabled={busy} /></label>
          <div className="dubbing-field-pair"><label>景别<input name="framing" disabled={busy} /></label><label>机位<input name="camera" disabled={busy} /></label></div>
        </>}
        {error && <p role="alert">{error}</p>}
        <button className="dubbing-primary" type="submit" disabled={busy || !workspace}>{busy ? '正在保存…' : '确认送审'}</button>
      </form>}
  </DubbingDialog>
}
