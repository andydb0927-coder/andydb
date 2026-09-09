import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DUBBING_REPLACEMENT_CATEGORIES, formatDubbingEpisodeNumber } from './dubbing-localization-plan'
import { DUBBING_QA_CATEGORIES, DUBBING_QA_LEVELS, loadDubbingQaTemplate } from './dubbing-qa-standard'
import { dubbingTimecode, type DubbingMedia, type DubbingWorkbenchShot, type DubbingWorkspace } from './dubbing-workbench-model'

export function DubbingMediaPreview({ media }: { media: DubbingMedia }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <p className="dubbing-muted">预览不可用，资产引用已保留：{media.id}</p>
  return <figure className="dubbing-media">
    {media.kind === 'image' ? <img src={media.url} alt={`引用资产 ${media.id}`} onError={() => setFailed(true)} />
      : media.kind === 'video' ? <video src={media.url} controls preload="metadata" onError={() => setFailed(true)} />
        : media.kind === 'audio' ? <audio src={media.url} controls preload="metadata" onError={() => setFailed(true)} /> : <p>文本资产</p>}
    <figcaption>{media.id}</figcaption>
  </figure>
}

export function DubbingShotTable({ shots, selectedId, select, busy }: { shots: DubbingWorkbenchShot[]; selectedId: string; select(id: string): void; busy: boolean }) {
  const episodes = [...new Set(shots.map(shot => shot.record.episodeNumber))].sort((a, b) => a - b)
  return <section className="dubbing-panel dubbing-shot-list" aria-label="剧集与镜头表">
    <h2>剧集与镜头 <span>{shots.length}</span></h2>
    {!shots.length && <p className="dubbing-muted">暂无镜头。请从画布节点或生成历史选择“送审到工作台”。</p>}
    {episodes.map(episode => <section key={episode}><h3>{formatDubbingEpisodeNumber(episode)}</h3><div className="dubbing-table-scroll" tabIndex={0} aria-label={`${formatDubbingEpisodeNumber(episode)} 镜头列表`}>
      <table><thead><tr><th>镜号</th><th>时间码</th><th>台词摘要</th><th>状态</th><th>返修</th><th>操作</th></tr></thead><tbody>
        {shots.filter(shot => shot.record.episodeNumber === episode).sort((a, b) => a.record.shotNumber - b.record.shotNumber).map(({ record }) => <tr key={record.id} data-selected={selectedId === record.id}>
          <td>{record.shotNumber}</td><td>{dubbingTimecode(record.sourceTimecode.startMs)}<br />{dubbingTimecode(record.sourceTimecode.endMs)}</td>
          <td className="dubbing-dialogue-summary" title={record.content.originalDialogue}>{record.content.originalDialogue || '无台词'}</td>
          <td><span className="dubbing-badge" data-status={record.status}>{record.status}</span></td><td>{record.revisionCount}/3</td>
          <td><button type="button" disabled={busy} aria-pressed={selectedId === record.id} aria-label={`查看 ${formatDubbingEpisodeNumber(episode)} 镜头 ${record.shotNumber}`} onClick={() => select(record.id)}>查看</button></td>
        </tr>)}
      </tbody></table></div></section>)}
  </section>
}

export function DubbingShotDetails({ shot, projectId, busy, action }: { shot?: DubbingWorkbenchShot; projectId: string; busy: boolean; action(type: 'submit' | 'approve' | 'revise' | 'deliver' | 'edit'): void }) {
  const p0 = loadDubbingQaTemplate().rules.filter(rule => rule.level === 'P0')
  const record = shot?.record
  const p0Remaining = p0.filter(rule => !shot?.qa.checkedIds.includes(rule.standardId)).length
  return <section className="dubbing-panel dubbing-detail" aria-label="镜头详情与审核">
    <h2>镜头详情与审核</h2>
    {!record || !shot ? <p className="dubbing-muted">选择一个镜头，开始核对与审核。</p> : <>
      <header className="dubbing-detail-heading"><h3>{formatDubbingEpisodeNumber(record.episodeNumber)} · 镜头 {record.shotNumber}</h3><span className="dubbing-badge" data-status={record.status}>{record.status}</span></header>
      <p className="dubbing-muted">原片 {dubbingTimecode(record.sourceTimecode.startMs)} — {dubbingTimecode(record.sourceTimecode.endMs)} · 返修 {record.revisionCount}/3</p>
      <p className="dubbing-muted">原片引用：{record.sourceAssetId}（人工登记）</p>
      <dl><dt>台词原文</dt><dd>{record.content.originalDialogue || '无台词'}</dd><dt>本地化台词</dt><dd>{record.content.localizedDialogue || '尚未填写'}</dd>
        <dt>景别 / 机位</dt><dd>{record.content.framing || '未标注'} / {record.content.camera || '未标注'}</dd></dl>
      <div className="dubbing-actions">
        {['待生成', '待返修'].includes(record.status) && <><button disabled={busy || !shot.pending} type="button" className="dubbing-primary" onClick={() => action('submit')}>提交生成</button>
          <button disabled={busy} type="button" onClick={() => action('edit')}>编辑镜头资料</button></>}
        {record.status === '待自审' && <button className="dubbing-primary" type="button" disabled={busy || p0Remaining > 0} onClick={() => action('approve')}>标记自审通过</button>}
        {['待自审', '已通过'].includes(record.status) && <button type="button" disabled={busy || record.revisionCount >= 3} title={record.revisionCount >= 3 ? '每镜头最多返修 3 次，第四次不可提交。' : undefined} onClick={() => action('revise')}>请求返修</button>}
        {record.status === '已通过' && <button type="button" className="dubbing-primary" disabled={busy} onClick={() => action('deliver')}>交付</button>}
      </div>
      {record.revisionCount >= 3 && <p className="dubbing-limit">已达 3 次返修上限，不能发起第 4 次返修；当前版本仍可完成自审与交付。</p>}
      {record.status === '待自审' && <p className="dubbing-muted">还有 {p0Remaining} 项 P0 待核对。勾选表示人工确认符合或不适用，不是 AI 自动通过。</p>}
      {['待生成', '待返修'].includes(record.status) && <p className="dubbing-muted">{shot.pending ? '提交已有生成结果，不发起 API 请求。' : '请从画布或生成历史送入新的返修结果。'}</p>}
      <Link to={`/project/${encodeURIComponent(projectId)}`}>返回画布补充结果</Link>
      <h3>待提交结果与引用资产</h3><div className="dubbing-media-grid">{shot.assets.map(asset => <DubbingMediaPreview key={asset.id} media={asset} />)}</div>
      <h3>生成版本 · {record.generationVersions.length}</h3>{record.generationVersions.map((version, index) => <details key={version.id}><summary>版本 {index + 1} · {version.createdAt}</summary>
        <p>结果资产：{version.assetIds.join('、')}</p><p>{version.contentSnapshot.localizedDialogue || '无本地化台词'}</p><p>关联返修：{version.revisionId ?? '首次提交'}</p></details>)}
      <h3>返修记录 · 只追加保留</h3>{record.revisions.length ? record.revisions.map(revision => <article className="dubbing-revision" key={revision.id}><strong>第 {revision.round} 次 · {revision.at}</strong><p>{revision.feedback}</p><small>{revision.standardIds.join('、')}</small></article>) : <p className="dubbing-muted">暂无返修记录</p>}
      {record.approval && <p>自审通过：{record.approval.at} · {record.approval.actorId}</p>}
      {record.delivery && <p>本地交付记录：{record.delivery.reference}（不代表客户签收）</p>}
    </>}
  </section>
}

export function DubbingPlanPanel({ workspace, shot, busy, editPlan, checkQa }: { workspace: DubbingWorkspace; shot?: DubbingWorkbenchShot; busy: boolean; editPlan(): void; checkQa(ids: string[]): void }) {
  const plan = workspace.plan, rules = loadDubbingQaTemplate().rules
  return <aside className="dubbing-panel" aria-label="本地化方案与QA清单">
    <header className="dubbing-panel-heading"><h2>本地化方案</h2><button type="button" disabled={busy} onClick={editPlan}>编辑本地化方案</button></header>
    <p>{plan ? `目标语种：${plan.targetLanguage}` : '尚未设置目标语种与本地化方案。'}</p>
    <h3>姓名映射</h3>{plan?.names.length ? <ul>{plan.names.map(name => <li key={name.characterId}>{name.originalName} → {name.givenName} {name.familyName}</li>)}</ul> : <p className="dubbing-muted">暂无姓名映射</p>}
    <details><summary>元素替换 · 十二类</summary>{DUBBING_REPLACEMENT_CATEGORIES.map(category => <section key={category}><h4>{category}</h4>{plan?.replacements.filter(item => item.category === category).map(item => <p key={item.id}>{item.sourceText} → {item.targetText}</p>)}
      {!plan?.replacements.some(item => item.category === category) && <p className="dubbing-muted">未填写</p>}</section>)}</details>
    <details><summary>字幕、花字与特殊规则</summary>{plan?.textReplacements.map(item => <p key={item.id}>{item.kind}：{item.sourceText} → {item.targetText}</p>)}
      {plan?.specialRules.map(rule => <p key={rule.id}>{rule.requirement}</p>)}
      {plan && <p>数字规则：{plan.numberRules.mode}；边界包含：{plan.numberRules.thresholdInclusive === null ? '待确认' : plan.numberRules.thresholdInclusive ? '是' : '否'}</p>}
    </details>
    <h2>镜头级 QA 清单</h2><p className="dubbing-muted">按客户 PDF 核对。勾选仅针对当前生成版本，返修新版本须重新核对；历史自审记录保留。</p>
    {!shot ? <p>请先选择镜头。</p> : <><p>已勾选 {shot.qa.checkedIds.length}/{rules.length} · 历史自审 {shot.qaHistory.length} 次</p>
      {DUBBING_QA_CATEGORIES.map(category => <fieldset key={category}><legend>{category}</legend>{rules.filter(rule => rule.category === category).map(rule => <label key={rule.standardId} className="dubbing-check">
        <input type="checkbox" disabled={busy || shot.record.status !== '待自审'} checked={shot.qa.checkedIds.includes(rule.standardId)} onChange={event => checkQa(event.target.checked ? [...shot.qa.checkedIds, rule.standardId] : shot.qa.checkedIds.filter(id => id !== rule.standardId))} />
        <span><span className="dubbing-qa-level" data-level={rule.level}>{rule.level} {DUBBING_QA_LEVELS[rule.level].color}</span> {rule.standardId}<br />{rule.requirement}<small>计划检查方式：{rule.checkMethod} · 客户 PDF 第 {rule.source.pages.join('、')} 页</small></span>
      </label>)}</fieldset>)}
    </>}
  </aside>
}
