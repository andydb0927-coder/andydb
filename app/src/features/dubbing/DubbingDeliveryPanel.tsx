import { useState } from 'react'
import { downloadBlob } from '../../shared/browser-download'
import { DubbingDialog } from './DubbingDialog'
import { checkDubbingDelivery, DUBBING_EXTERNAL_CHECKS, type DubbingDeliveryPackage, type DubbingDeliveryScope, type DubbingExternalEvidenceInput } from './dubbing-delivery'
import { dubbingUiError, type DubbingWorkbenchShot, type DubbingWorkspace } from './dubbing-workbench-model'

export function DubbingDeliveryHistory({ packages }: { packages: DubbingDeliveryPackage[] }) {
  const [error, setError] = useState('')
  return <section aria-label="交付版本台账" className="dubbing-delivery-history"><h3>交付版本台账 · {packages.length}</h3>
    <p>只追加保存。重新下载的是原始清单，不会重新交付、覆盖媒体或上传飞书。</p>
    {error && <p role="alert">{error}</p>}
    {packages.map(item => <details key={item.id}><summary>{item.reference} · {item.createdAt} · {item.shots.length} 镜头</summary>
      <p>清单 ID：{item.id}</p>{item.shots.map(shot => <p key={shot.shotId}>EP{String(shot.episodeNumber).padStart(3, '0')} / 镜头{shot.shotNumber} / 版本 {shot.versionId} / 自审 {shot.selfReviewId} / 修改 {shot.revisionCount}/3 / 交付引用 {shot.deliveryReference}</p>)}
      <button type="button" onClick={() => { try { downloadBlob(new Blob([JSON.stringify(item, null, 2)], { type: 'application/json' }), `dubbing-delivery-${item.id}.json`); setError('') } catch (failure) { setError(dubbingUiError(failure, '清单下载失败，已归档记录仍保留，请重试。')) } }}>下载交付清单 JSON</button>
    </details>)}
  </section>
}
function ExternalEvidenceForm({ shot, save, busy }: { shot: DubbingWorkbenchShot; save(value: DubbingExternalEvidenceInput): Promise<void>; busy: boolean }) {
  const prior = shot.deliveryEvidence
  const [reportReference, setReport] = useState(prior?.reportReference ?? ''), [fileReference, setFile] = useState(prior?.fileReference ?? '')
  const [reviewer, setReviewer] = useState(prior?.reviewer ?? ''), [checkedIds, setChecked] = useState(prior?.checkedIds ?? [])
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const disabled = busy || saving || shot.record.status !== '已通过'
  return <details><summary>镜头{shot.record.shotNumber} · 外部检测报告与人工核验</summary>
    <p>请先通过右侧自审区登记测量数据并完成自审。这里仅记录已完成检测的报告引用；不会运行 ffprobe、识别口型或验证报告真伪。禁止将未检测项勾选为已核验。</p>
    <form onSubmit={event => { event.preventDefault(); if (disabled) return; setSaving(true); setError(''); void save({ reportReference, fileReference, reviewer, checkedIds }).catch(failure => setError(dubbingUiError(failure))).finally(() => setSaving(false)) }}>
      <fieldset disabled={disabled}><legend>当前版本 {shot.record.generationVersions.at(-1)?.id ?? '尚未生成'}</legend>
        <label>检测报告引用<input required maxLength={2000} value={reportReference} onChange={e => setReport(e.target.value)} /></label>
        <label>实际交付文件引用<input required maxLength={2000} value={fileReference} onChange={e => setFile(e.target.value)} /></label>
        <label>外部核验人<input required maxLength={2000} value={reviewer} onChange={e => setReviewer(e.target.value)} /></label>
        {DUBBING_EXTERNAL_CHECKS.map(check => <label className="dubbing-check" key={check.id}><input type="checkbox" checked={checkedIds.includes(check.id)} onChange={e => setChecked(e.target.checked ? [...checkedIds, check.id] : checkedIds.filter(id => id !== check.id))} /><span>{check.label}</span></label>)}
        <button disabled={checkedIds.length !== DUBBING_EXTERNAL_CHECKS.length || ![reportReference, fileReference, reviewer].every(v => v.trim())} type="submit">保存外部检测记录</button>
      </fieldset>
      {prior && <p>已登记：{prior.at} · {prior.reviewer}（版本或方案变更后须重新核验）</p>}{error && <p role="alert">{error}</p>}
    </form>
  </details>
}
interface Props {
  workspace: DubbingWorkspace; selectedId: string; onClose(): void
  saveEvidence(shotId: string, value: DubbingExternalEvidenceInput): Promise<void>
  exportPackage(scope: DubbingDeliveryScope, expectedEpisodeCount: number, reference: string): Promise<void>
}
export function DubbingDeliveryPanel({ workspace, selectedId, onClose, saveEvidence, exportPackage }: Props) {
  const selected = workspace.shots.find(shot => shot.record.id === selectedId)
  const [scopeType, setScopeType] = useState<'shot' | 'episode'>('shot'), [expectedCount, setCount] = useState('')
  const [reference, setReference] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false)
  const scope: DubbingDeliveryScope = scopeType === 'shot' ? { type: 'shot', shotId: selectedId } : { type: 'episode', episodeNumber: selected?.record.episodeNumber ?? 0 }
  const count = Number(expectedCount || selected?.qa.evidence?.expectedEpisodeCount || 0)
  const check = checkDubbingDelivery(workspace, scope, count)
  const perform = async (operation: () => Promise<void>) => { setBusy(true); setError(''); try { await operation() } finally { setBusy(false) } }
  return <DubbingDialog title="交付包检查与导出" onClose={onClose} busy={busy}>
    <p>生成本地交付清单，不含媒体文件，不转码、不自动上传、不代表客户签收。自动检查只验证已提供的数据，实际文件须外部检测与人工复核。</p>
    <label>交付范围<select disabled={busy || saved} value={scopeType} onChange={e => setScopeType(e.target.value === 'episode' ? 'episode' : 'shot')}><option value="shot">当前镜头</option><option value="episode">当前整集（包含所有镜头）</option></select></label>
    <label>全剧预期总集数<input type="number" min={1} max={999} step={1} disabled={busy || saved} value={expectedCount || selected?.qa.evidence?.expectedEpisodeCount || ''} onChange={e => setCount(e.target.value)} /></label>
    <p>实际工作台集号：{check.episodeNames.join('、') || '无'}。须从 EP001 连续且数量与全剧预期一致。</p>
    {saved ? <p role="status">交付清单已归档，可在下方下载。记录交付不代表客户签收。</p> : check.blockers.length ? <div role="alert" className="dubbing-error"><strong>交付检查未通过，禁止导出</strong><ul>{check.blockers.map((reason, i) => <li key={i}>{reason}</li>)}</ul></div> : <p role="status">交付数据检查已通过；人工核验原始状态保留，不改写为自动 PASS。</p>}
    {!saved && check.shots.map(item => { const shot = workspace.shots.find(s => s.record.id === item.shotId)!; return <ExternalEvidenceForm key={`${shot.record.id}:${shot.deliveryEvidence?.at ?? ''}`} shot={shot} busy={busy} save={value => perform(() => saveEvidence(item.shotId, value))} /> })}
    <details><summary>本次检查依据（自动 / 人工分别保留）</summary>{check.shots.map(item => <section key={item.shotId}><h3>{item.shotId}</h3><ul className="dubbing-qa-results">{item.results.map(result => <li key={result.checkId}>{result.checkId} · {result.result} · {result.evidence}</li>)}</ul></section>)}</details>
    <label>交付包名称或引用<input maxLength={2000} disabled={busy || saved} value={reference} onChange={e => setReference(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy || saved || check.blockers.length > 0 || !reference.trim()} onClick={() => { void perform(async () => { await exportPackage(scope, count, reference.trim()); setSaved(true) }).catch(failure => setError(dubbingUiError(failure))) }}>生成交付清单并记录交付</button>
    <DubbingDeliveryHistory packages={workspace.deliveryPackages ?? []} />
  </DubbingDialog>
}
