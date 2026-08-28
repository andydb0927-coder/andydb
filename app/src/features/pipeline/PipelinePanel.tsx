import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import type { Project, PipelineNodeConfig } from '../project/model'
import type { ProviderRegistry } from '../generation/model-provider-registry'
import { generationErrorMessage } from '../generation/generation-errors'
import { isActiveTask } from '../generation/task-status'
import { createPipelineRun, pipelineSummary, pipelineStatusCopy, type PipelinePolicy, type PipelineRun } from './pipeline-model'
import { pipelineEstimate } from './pipeline-executor'
import type { PipelineTemplate } from './pipeline-template'
import './pipeline.css'

interface PipelinePanelProps {
  project: Project; registry: ProviderRegistry; startNodeId: string
  run?: PipelineRun; history: PipelineRun[]; templates: PipelineTemplate[]; error: string; loading: boolean
  actions: {
    close(): void; setStartNodeId(id: string): void; start(run: PipelineRun): void
    pause(): void; resume(): void; cancel(): void; skip(id: string): void; retry(id: string): void
    updateConfig(id: string, config: PipelineNodeConfig): void
    saveTemplate(name: string): void; renameTemplate(template: PipelineTemplate, name: string): void
    deleteTemplate(id: string): void; instantiate(template: PipelineTemplate): void
  }
}
const focusable = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href]'
const modalProps = { portal: true, restoreFocus: true, initialFocus: 'button', focusableSelector: focusable, overlayClassName: 'pipeline-overlay', className: 'pipeline-panel' } as const

export function PipelinePanel({ project, registry, startNodeId, run, history, templates, error, loading, actions }: PipelinePanelProps) {
  const [tab, setTab] = useState<'run' | 'templates' | 'history'>('run')
  const [policy, setPolicy] = useState<PipelinePolicy>({ mode: 'stop', retries: 1 })
  const [confirmation, setConfirmation] = useState<PipelineRun>()
  const [retryId, setRetryId] = useState<string>()
  const [templateName, setTemplateName] = useState('')
  const [deleting, setDeleting] = useState<string>()
  const [selectedHistory, setSelectedHistory] = useState<string>()
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    // A terminal status removes pause/skip buttons; keep Escape and Tab inside the modal.
    if (document.activeElement === document.body && !confirmation && !retryId && !deleting) closeButton.current?.focus()
  }, [run, confirmation, retryId, deleting])
  const busy = Boolean(run && isActiveTask(run.status))
  const preview = useMemo(() => {
    if (!startNodeId) return { error: '请选择脚本、文本或图片起点，按连线执行全部下游节点。' }
    try {
      const planned = createPipelineRun(project, startNodeId, policy)
      return { planned, estimate: pipelineEstimate(project, planned, registry) }
    } catch (cause) { return { error: generationErrorMessage(cause, '管线拓扑无效。') } }
  }, [project, registry, startNodeId, policy])
  const confirmedEstimate = confirmation && pipelineEstimate(project, confirmation, registry)
  const retryStep = run?.steps.find(step => step.nodeId === retryId)
  const historyRun = history.find(item => item.id === selectedHistory)

  function steps(value: PipelineRun, editable: boolean) {
    const summary = pipelineSummary(value)
    return <section className="pipeline-run" aria-label={editable ? '当前管线运行' : '运行详情'}>
      <h3>{value.title}</h3>
      <p role="status">{value.pausedReason ? ({ manual: '已暂停', failure: '失败暂停', interrupted: '运行已中断，等待手动继续' }[value.pausedReason]) : pipelineStatusCopy[value.status]} · 成功 {summary.succeeded} / {summary.total} · 失败 {summary.failed} · 跳过 {summary.skipped} · 耗时 {(summary.elapsedMs / 1000).toFixed(1)} 秒</p>
      <progress aria-label="管线总进度" value={summary.progress} max={100} />
      <ol className="pipeline-steps">
        {value.steps.map((step, index) => <li key={step.nodeId} data-status={step.status}>
          <div className="pipeline-step__heading"><strong>{index + 1}. {step.title}</strong><span>{step.skipped ? '已跳过' : pipelineStatusCopy[step.status]}{step.status === 'running' ? ` ${Math.round(step.progress)}%` : ''}</span></div>
          <small>尝试 {step.attempts} 次 · {(step.elapsedMs / 1000).toFixed(1)} 秒</small>
          {step.error && <p className={step.status === 'failed' ? 'pipeline-error' : ''}>{step.error}</p>}
          {editable && value.status !== 'cancelled' && <div className="pipeline-buttons">
            {step.status === 'failed' && <button type="button" disabled={value.status === 'running' && !value.pausedReason} aria-label={`重试 ${step.title}`} onClick={() => setRetryId(step.nodeId)}>重试单步</button>}
            {(step.status === 'queued' || step.status === 'failed') && <button type="button" aria-label={`跳过 ${step.title}`} onClick={() => actions.skip(step.nodeId)}>跳过（使用已有结果）</button>}
          </div>}
        </li>)}
      </ol>
      {editable && isActiveTask(value.status) && <div className="pipeline-buttons">
        {value.pausedReason ? <button type="button" disabled={value.steps.some(step => step.status === 'failed') && value.policy.mode !== 'continue'} onClick={actions.resume}>继续管线</button> : <button type="button" disabled={value.pauseRequested} onClick={actions.pause}>{value.pauseRequested ? '当前步骤结束后暂停' : '暂停管线'}</button>}
        <button type="button" onClick={actions.cancel}>取消管线（保留已完成）</button>
      </div>}
    </section>
  }

  return <>
    <ConfirmDialog {...modalProps} label="管线自动化" onClose={actions.close}>
      <header className="pipeline-panel__header"><div><h2>管线自动化</h2><p>按依赖串行执行 · 本地保存记录与模板</p></div><button ref={closeButton} type="button" aria-label="关闭管线面板" onClick={actions.close}><X size={18} /></button></header>
      <div className="pipeline-tabs" role="tablist" aria-label="管线面板内容">
        {([['run', '执行管线'], ['templates', '管线模板'], ['history', '执行历史']] as const).map(([key, label]) => <button type="button" role="tab" key={key} aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      {error && <p role="alert" className="pipeline-error">{error}</p>}
      {loading && <p role="status">正在读取本地管线记录…</p>}
      {tab === 'run' && <>
        {run && steps(run, true)}
        <details open={!run} className="pipeline-setup"><summary>配置新管线</summary>
          <label>管线起点<select aria-label="管线起点" disabled={busy} value={startNodeId} onChange={event => actions.setStartNodeId(event.target.value)}><option value="">请选择起点</option>{project.nodes.filter(node => ['text', 'script', 'image'].includes(node.kind)).map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label>
          <div className="pipeline-fields"><label>失败策略<select aria-label="失败策略" disabled={busy} value={policy.mode} onChange={event => setPolicy({ ...policy, mode: event.target.value as PipelinePolicy['mode'] })}><option value="stop">失败即暂停</option><option value="continue">继续独立分支</option><option value="retry">自动重试后暂停</option></select></label>{policy.mode === 'retry' && <label>自动重试次数<select aria-label="自动重试次数" disabled={busy} value={policy.retries} onChange={event => setPolicy({ ...policy, retries: Number(event.target.value) })}>{[1, 2, 3].map(n => <option key={n} value={n}>{n} 次</option>)}</select></label>}</div>
          <p>失败分支的下游不会使用旧结果继续生成。暂停在当前步骤完成后生效；刷新恢复后不自动重发。</p>
          {preview.error && <p>{preview.error}</p>}
          {preview.planned && <ol className="pipeline-steps">{preview.planned.steps.map(step => {
            const node = project.nodes.find(node => node.id === step.nodeId)!
            return <li key={step.nodeId}><label>{step.title}<select aria-label={`${step.title}执行方式`} disabled={busy} value={step.config.action} onChange={event => actions.updateConfig(step.nodeId, { action: event.target.value as PipelineNodeConfig['action'], mirrorHorizontal: true })}><option value="generate">按节点模型生成</option><option value="reuse">使用现有结果</option>{node.kind === 'image' && <option value="image-transform">本地图片后处理</option>}</select></label>
              {step.config.action === 'image-transform' && <div className="pipeline-fields"><label><input type="checkbox" disabled={busy} checked={step.config.mirrorHorizontal ?? false} onChange={event => actions.updateConfig(step.nodeId, { ...step.config, mirrorHorizontal: event.target.checked })} />水平镜像</label><label><input type="checkbox" disabled={busy} checked={step.config.mirrorVertical ?? false} onChange={event => actions.updateConfig(step.nodeId, { ...step.config, mirrorVertical: event.target.checked })} />垂直镜像</label><label>旋转<select aria-label={`${step.title}旋转`} disabled={busy} value={step.config.rotationQuarterTurns ?? 0} onChange={event => actions.updateConfig(step.nodeId, { ...step.config, rotationQuarterTurns: Number(event.target.value) })}>{[0, 1, 2, 3].map(n => <option key={n} value={n}>{n * 90}°</option>)}</select></label></div>}
            </li>
          })}</ol>}
          {preview.estimate && <><p>预计总成本 {preview.estimate.amount} 积分{policy.mode === 'retry' ? `；含自动重试最高 ${preview.estimate.maximum} 积分` : ''}。本地后处理不消耗积分。</p>{preview.estimate.issues.map(issue => <p key={issue} className="pipeline-error">{issue}</p>)}</>}
          <button type="button" disabled={busy || loading || !preview.planned || Boolean(preview.estimate?.issues.length)} onClick={() => setConfirmation(preview.planned)}>执行整条管线</button>
          {busy && <p>当前管线尚未结束，请先继续或取消。</p>}
        </details>
      </>}
      {tab === 'templates' && <section><h3>管线模板</h3><p>只保存节点类型、输入参数和连线，不包含生成结果、资产或外部引用。创建后请补充所需参考素材。</p><label>模板名称<input aria-label="模板名称" value={templateName} maxLength={60} onChange={event => setTemplateName(event.target.value)} /></label><button type="button" disabled={!startNodeId || !templateName.trim()} onClick={() => actions.saveTemplate(templateName)}>保存当前管线为模板</button>
        {!templates.length && <p>尚无管线模板</p>}
        {templates.map(template => <article className="pipeline-template" key={template.id}><input aria-label={`重命名模板 ${template.name}`} defaultValue={template.name} maxLength={60} onBlur={event => { if (event.target.value.trim() !== template.name) actions.renameTemplate(template, event.target.value) }} /><p>{template.nodes.length} 个节点 · {template.edges.length} 条连线</p><div className="pipeline-buttons"><button type="button" onClick={() => { actions.instantiate(template); setTab('run') }}>创建管线：{template.name}</button><button type="button" onClick={() => setDeleting(template.id)}>删除模板：{template.name}</button></div></article>)}
      </section>}
      {tab === 'history' && <section><h3>执行历史</h3>{!history.length && <p>暂无管线运行记录</p>}<ul className="pipeline-history">{history.map(item => { const summary = pipelineSummary(item); return <li key={item.id}><button type="button" aria-pressed={item.id === selectedHistory} onClick={() => setSelectedHistory(item.id)}>{item.title} · {new Date(item.createdAt).toLocaleString('zh-CN')}<br />{summary.total} 个节点 · 成功 {summary.succeeded} · 失败 {summary.failed} · {(summary.elapsedMs / 1000).toFixed(1)} 秒</button></li> })}</ul>{historyRun && steps(historyRun, false)}</section>}
    </ConfirmDialog>
    {confirmation && confirmedEstimate && <ConfirmDialog {...modalProps} role="alertdialog" label="确认执行管线" onClose={() => setConfirmation(undefined)}><h2>确认执行管线</h2><p>将顺序处理 {confirmation.steps.length} 个节点，预计总成本 {confirmedEstimate.amount} 积分。</p><p>{confirmation.policy.mode === 'retry' ? `含自动重试最高 ${confirmedEstimate.maximum} 积分。` : confirmation.policy.mode === 'continue' ? '失败后跳过依赖分支，继续独立分支；已完成结果保留。' : '失败后暂停，已完成结果保留。'} 配置为真实模型时会向所选供应商提交请求。</p><button type="button" onClick={() => setConfirmation(undefined)}>返回检查</button><button type="button" disabled={Boolean(confirmedEstimate.issues.length)} onClick={() => { actions.start(confirmation); setConfirmation(undefined) }}>确认执行</button></ConfirmDialog>}
    {retryStep && run && <ConfirmDialog {...modalProps} role="alertdialog" label="确认重试步骤" onClose={() => setRetryId(undefined)}><h2>确认重试步骤</h2><p>重试“{retryStep.title}”并继续其未完成下游。可能重新计费，已完成结果保留。</p><p>本次剩余步骤预计 {pipelineEstimate(project, { ...run, steps: run.steps.filter(step => step.status !== 'succeeded' && step.skipped !== 'user') }, registry).amount} 积分。</p><button type="button" onClick={() => setRetryId(undefined)}>取消</button><button type="button" onClick={() => { actions.retry(retryStep.nodeId); setRetryId(undefined) }}>确认重试</button></ConfirmDialog>}
    {deleting && <ConfirmDialog {...modalProps} role="alertdialog" label="删除管线模板" onClose={() => setDeleting(undefined)}><h2>删除管线模板</h2><p>只删除模板，已创建的画布节点和运行记录不受影响。</p><button type="button" onClick={() => setDeleting(undefined)}>保留模板</button><button type="button" onClick={() => { actions.deleteTemplate(deleting); setDeleting(undefined) }}>确认删除模板</button></ConfirmDialog>}
  </>
}
