import { useState } from 'react'
import { DubbingDialog } from './DubbingDialog'
import { DUBBING_REPLACEMENT_CATEGORIES, type DubbingLocalizationPlan, type DubbingLocalizationPlanInput } from './dubbing-localization-plan'
import { dubbingUiError } from './dubbing-workbench-model'

export function DubbingPlanEditor({ projectId, plan, save, onClose }: { projectId: string; plan: DubbingLocalizationPlan | null; save(input: DubbingLocalizationPlanInput): Promise<void>; onClose(): void }) {
  const [draft, setDraft] = useState<DubbingLocalizationPlanInput>(() => structuredClone(plan ?? { id: crypto.randomUUID(), dramaId: projectId, targetLanguage: '', names: [], replacements: [], textReplacements: [] }))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <DubbingDialog title="编辑本地化方案" onClose={onClose} busy={busy}>
    <form onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await save(draft); onClose() } catch (failure) { setError(dubbingUiError(failure)) } finally { setBusy(false) } }}>
      <label>目标语种<select required disabled={busy} value={draft.targetLanguage} onChange={event => setDraft({ ...draft, targetLanguage: event.target.value, numberRules: undefined })}>
        <option value="">请选择</option><option value="en-US">英语（美国）</option><option value="pt-BR">葡语（巴西）</option><option value="es-MX">西语（墨西哥）</option><option value="ja-JP">日语（数字规则待配置）</option>
      </select></label>
      <h3>姓名映射 · 全剧唯一</h3>
      {draft.names.map((name, i) => <fieldset key={name.characterId}><legend>角色 {i + 1}</legend><div className="dubbing-field-pair">
        {(['originalName', 'givenName', 'familyName'] as const).map((key, index) => <label key={key}>{['原名', '目标名', '姓氏'][index]}<input required disabled={busy} value={name[key]} onChange={event => setDraft({ ...draft, names: draft.names.map((item, j) => j === i ? { ...item, [key]: event.target.value } : item) })} /></label>)}
      </div><button type="button" disabled={busy} onClick={() => setDraft({ ...draft, names: draft.names.filter((_, j) => j !== i) })}>移除角色 {i + 1}</button></fieldset>)}
      <button type="button" disabled={busy} onClick={() => setDraft({ ...draft, names: [...draft.names, { characterId: crypto.randomUUID(), originalName: '', givenName: '', familyName: '' }] })}>添加姓名映射</button>
      <h3>元素替换</h3>
      {draft.replacements.map((replacement, i) => <fieldset key={replacement.id}><legend>替换 {i + 1}</legend>
        <label>分类<select disabled={busy} value={replacement.category} onChange={event => {
          const category = DUBBING_REPLACEMENT_CATEGORIES.find(item => item === event.target.value)
          if (category) setDraft({ ...draft, replacements: draft.replacements.map((item, j) => j === i ? { ...item, category } : item) })
        }}>{DUBBING_REPLACEMENT_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
        {(['sourceText', 'targetText'] as const).map((key, index) => <label key={key}>{index === 0 ? '源元素' : '目标元素'}<input required disabled={busy} value={replacement[key]} onChange={event => setDraft({ ...draft, replacements: draft.replacements.map((item, j) => j === i ? { ...item, [key]: event.target.value } : item) })} /></label>)}
        <button type="button" disabled={busy} onClick={() => setDraft({ ...draft, replacements: draft.replacements.filter((_, j) => i !== j) })}>移除替换 {i + 1}</button>
      </fieldset>)}
      <button type="button" disabled={busy} onClick={() => setDraft({ ...draft, replacements: [...draft.replacements, { id: crypto.randomUUID(), category: '建筑', sourceText: '', targetText: '' }] })}>添加替换项</button>
      <h3>字幕与花字</h3>
      {draft.textReplacements.map((replacement, i) => <fieldset key={replacement.id}><legend>文字 {i + 1}</legend>
        <label>文字类型<select value={replacement.kind} disabled={busy} onChange={event => setDraft({ ...draft, textReplacements: draft.textReplacements.map((item, j) => j === i ? { ...item, kind: event.target.value === '花字' ? '花字' : '中文字幕' } : item) })}><option>中文字幕</option><option>花字</option></select></label>
        {(['sourceText', 'targetText'] as const).map((key, index) => <label key={key}>{index === 0 ? '原文字' : '目标文字'}<input required disabled={busy} value={replacement[key]} onChange={event => setDraft({ ...draft, textReplacements: draft.textReplacements.map((item, j) => j === i ? { ...item, [key]: event.target.value } : item) })} /></label>)}
        <button type="button" disabled={busy} onClick={() => setDraft({ ...draft, textReplacements: draft.textReplacements.filter((_, j) => i !== j) })}>移除文字 {i + 1}</button>
      </fieldset>)}
      <button type="button" disabled={busy} onClick={() => setDraft({ ...draft, textReplacements: [...draft.textReplacements, { id: crypto.randomUUID(), kind: '中文字幕', sourceText: '', targetText: '' }] })}>添加文字替换</button>
      <p className="dubbing-muted">数字规则按语种初始化；英语/葡语的数字 10 保留待确认。修改语种会重新初始化数字规则。</p>
      {error && <p role="alert">{error}</p>}
      <footer><button type="submit" className="dubbing-primary" disabled={busy}>{busy ? '正在保存…' : '保存本地化方案'}</button></footer>
    </form>
  </DubbingDialog>
}
