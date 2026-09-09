import { useState } from 'react'
import { DubbingDialog } from './DubbingDialog'
import { DUBBING_QA_CATEGORIES, DUBBING_QA_LEVELS, loadDubbingQaTemplate } from './dubbing-qa-standard'
import { dubbingChecklistComplete, dubbingConfirmationCurrent, dubbingQaInput } from './dubbing-qa-checklist'
import { runDubbingQa } from './dubbing-qa-runner'
import { dubbingUiError, type DubbingWorkbenchShot, type DubbingWorkspace } from './dubbing-workbench-model'

export interface DubbingQaActions {
  checkQa(ids: string[]): void
  checkCategories(ids: string[]): void
  saveEvidence(value: unknown): Promise<void>
  confirm(): void
}
export function DubbingQaChecklist({ workspace, shot, busy, actions }: { workspace: DubbingWorkspace; shot: DubbingWorkbenchShot; busy: boolean; actions: DubbingQaActions }) {
  const [editing, setEditing] = useState(false), [copyMessage, setCopyMessage] = useState('')
  const template = loadDubbingQaTemplate(), results = runDubbingQa(template, dubbingQaInput(workspace, shot))
  const disabled = busy || shot.record.status !== '待自审', fail = results.filter(item => item.result === 'FAIL').length
  const current = dubbingConfirmationCurrent(workspace, shot)
  return <section aria-label="自审检查器">
    <h2>镜头级 QA 清单</h2>
    <p className="dubbing-muted">全部子项与九节逐集排查须人工确认符合或不适用。WARN 表示待人工确认，不是自动通过。新版本、数据或方案变更后重新自审。</p>
    <p>已勾选 {shot.qa.checkedIds.length}/{template.rules.length} · 历史自审 {shot.qaHistory.length} 次 · 自动失败 {fail} 项</p>
    <button type="button" disabled={disabled} onClick={() => setEditing(true)}>填写检测数据</button>
    <details><summary>检查结果与依据（{results.length} 项）</summary>
      <p>仅检查已提供的文本和元数据，不读取视频、识别口型或扫描画面。安全框默认5%–95%。</p>
      <ul className="dubbing-qa-results">{results.map(item => <li key={item.checkId}><strong>{item.result} · {item.standardId} · {item.checkMethod}</strong><p>{item.evidence}</p></li>)}</ul>
    </details>
    {DUBBING_QA_CATEGORIES.map(category => <fieldset key={category}><legend>{category === '修改' ? '修改底线' : category}</legend>
      {template.rules.filter(rule => rule.category === category).map(rule => <label key={rule.standardId} className="dubbing-check">
        <input type="checkbox" disabled={disabled} checked={shot.qa.checkedIds.includes(rule.standardId)} onChange={event => actions.checkQa(event.target.checked ? [...shot.qa.checkedIds, rule.standardId] : shot.qa.checkedIds.filter(id => id !== rule.standardId))} />
        <span><span className="dubbing-qa-level" data-level={rule.level}>{rule.level} {DUBBING_QA_LEVELS[rule.level].color}</span> {rule.standardId}<br />{rule.requirement}<small>检查方式：{rule.checkMethod} · 客户 PDF 第 {rule.source.pages.join('、')} 页</small></span>
      </label>)}
      <label className="dubbing-check"><input type="checkbox" disabled={disabled} checked={shot.qa.checkedCategories?.includes(category) ?? false}
        onChange={event => actions.checkCategories(event.target.checked ? [...(shot.qa.checkedCategories ?? []), category] : (shot.qa.checkedCategories ?? []).filter(id => id !== category))} />
        <span>{category === '修改' ? '修改底线' : category} · 逐集排查：已核对本集各镜头</span></label>
    </fieldset>)}
    <button type="button" disabled={disabled || !dubbingChecklistComplete(shot) || fail > 0} onClick={actions.confirm}>生成自审确认表</button>
    {fail > 0 && <p className="dubbing-error">自动检查存在 FAIL，请修正后重新自审，不能用勾选代替修复。</p>}
    {shot.qa.confirmation && <details open><summary>自审确认表 · {current ? '当前版本有效' : '已过期，须重新确认'}</summary>
      <textarea aria-label="自审确认表文本" readOnly rows={8} value={shot.qa.confirmation.text} />
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(shot.qa.confirmation!.text); setCopyMessage('已复制自审确认表。') } catch { setCopyMessage('复制失败，请从文本框手动复制。') } }}>复制自审确认表</button>
      {copyMessage && <p role="status">{copyMessage}</p>}
    </details>}
    {editing && <DubbingQaEvidenceDialog shot={shot} onClose={() => setEditing(false)} save={actions.saveEvidence} />}
  </section>
}

function DubbingQaEvidenceDialog({ shot, onClose, save }: { shot: DubbingWorkbenchShot; onClose(): void; save(value: unknown): Promise<void> }) {
  const [value, setValue] = useState(JSON.stringify(shot.qa.evidence ?? {}, null, 2)), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  return <DubbingDialog title="填写检测数据" onClose={onClose} busy={busy}>
    <p>登记已测量的数据，不自动读取媒体。未知字段请省略，不能用示例值冒充测量；保存后清空本版本勾选和确认表。</p>
    <details><summary>字段说明与示例（不会自动填入）</summary>
      <p>episodeNames 集名列表；expectedEpisodeCount 预期总集数；subtitles 字幕：startMs/endMs 毫秒、text 文本、episode 集名、box 归一化 x/y/width/height。</p>
      <p>lipSyncOffsetsSeconds 口型偏差秒数列表；volumeDeltaDb 相对音量差；volumeReference 客户确认测量基准；channels 声道数。</p>
      <p>file：width/height 像素、codec 编码、bitrateMbps 码率、container 容器、fps 帧率、colorSpace 色彩空间。numberContext 可为 ordinary/phone/official-number 等明确数字上下文；不要将普通台词伪装为号码。</p>
      <pre>{'{"episodeNames":["EP001"],"expectedEpisodeCount":1,"channels":2}'}</pre>
    </details>
    <form onSubmit={event => {
      event.preventDefault(); setError('')
      let parsed: unknown
      try { parsed = JSON.parse(value) } catch { setError('数据不是有效 JSON，请检查引号与逗号。'); return }
      setBusy(true)
      void save(parsed).then(onClose).catch(failure => setError(dubbingUiError(failure))).finally(() => setBusy(false))
    }}><label>检测数据 JSON<textarea rows={12} value={value} onChange={event => setValue(event.target.value)} /></label>
      {error && <p role="alert">{error}</p>}<button disabled={busy} type="submit">保存检测数据</button></form>
  </DubbingDialog>
}
