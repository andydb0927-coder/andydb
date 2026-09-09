import { useState } from 'react'
import { DubbingDialog } from './DubbingDialog'
import { loadDubbingQaTemplate } from './dubbing-qa-standard'
import type { DubbingShotContent } from './dubbing-shot-record'
import { dubbingUiError } from './dubbing-workbench-model'

export function DubbingReviewDialog({ mode, save, onClose }: { mode: 'revise' | 'deliver'; save(text: string, ids: string[]): Promise<void>; onClose(): void }) {
  const [text, setText] = useState(''), [ids, setIds] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const isRevision = mode === 'revise'
  return <DubbingDialog title={isRevision ? '请求返修' : '记录交付'} onClose={onClose} busy={busy}>
    <form onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await save(text, ids); onClose() } catch (failure) { setError(dubbingUiError(failure)) } finally { setBusy(false) } }}>
      <label>{isRevision ? '返修意见' : '交付包名称或引用'}<textarea required value={text} disabled={busy} onChange={event => setText(event.target.value)} /></label>
      {isRevision ? <fieldset><legend>选择关联 QA 标准（至少一项）</legend><div className="dubbing-rule-picker">{loadDubbingQaTemplate().rules.map(rule => <label key={rule.standardId} className="dubbing-check"><input type="checkbox" disabled={busy} checked={ids.includes(rule.standardId)} onChange={event => setIds(event.target.checked ? [...ids, rule.standardId] : ids.filter(id => id !== rule.standardId))} />{rule.standardId} · {rule.requirement}</label>)}</div></fieldset>
        : <p className="dubbing-muted">仅记录本地交付状态，不代表文件已上传或客户已签收。</p>}
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="dubbing-primary" disabled={busy || !text.trim() || (isRevision && !ids.length)}>{isRevision ? '保存返修意见' : '确认记录交付'}</button>
    </form>
  </DubbingDialog>
}

export function DubbingContentDialog({ content, save, onClose }: { content: DubbingShotContent; save(content: DubbingShotContent): Promise<void>; onClose(): void }) {
  const [draft, setDraft] = useState(content), [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <DubbingDialog title="编辑镜头资料" onClose={onClose} busy={busy}><form onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true)
    try { await save(draft); onClose() } catch (failure) { setError(dubbingUiError(failure)) } finally { setBusy(false) }
  }}>
    {(['originalDialogue', 'localizedDialogue', 'framing', 'camera'] as const).map((key, index) => <label key={key}>{['台词原文', '本地化台词', '景别', '机位'][index]}<textarea disabled={busy} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
    <p className="dubbing-muted">修改当前草稿，不覆盖已有生成版本的资料快照。</p>
    {error && <p role="alert">{error}</p>}<button type="submit" disabled={busy}>保存镜头资料</button>
  </form></DubbingDialog>
}
