import { useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import type { Project } from '../project/model'
import { useProjectStore } from '../project/project-store'
import type { ProjectRepository } from '../project/project-repository'
import type { SubjectRepository } from '../subjects/subject-repository'
import { generationErrorMessage } from '../generation/generation-errors'
import { isProviderEnabled, providerGenerationCost, type ProviderRegistry } from '../generation/model-provider-registry'
import { isActiveTask } from '../generation/task-status'
import { subjectExtractionId } from '../generation/ark-subject-extraction-provider'
import { ScriptWorkflowRunner } from './script-workflow-runner'
import { scriptBreakdownProviderId, scriptStoryboardProviderId } from './script-workflow'
import { ScriptStoryboardCards } from './ScriptStoryboardCards'
import { SimilarSubjectsReview } from '../subjects/SimilarSubjectsReview'
import type { SimilarSubject } from '../subjects/subject-consistency'
import './script-workspace.css'

type PendingAction = { kind: 'breakdown' | 'storyboard' | 'images'; cost: number } | { kind: 'subject'; characterId: string; assetId: string; cost: number }

export function ScriptWorkspace({ project, nodeId, registry, repository, subjects, onClose, onSent }: {
  project: Project
  nodeId: string
  registry: ProviderRegistry
  repository: Pick<ProjectRepository, 'save'>
  subjects: Pick<SubjectRepository, 'create' | 'get' | 'list'> & Partial<Pick<SubjectRepository, 'merge'>>
  onClose(): void
  onSent(nodeId: string): void
}) {
  const node = project.nodes.find(node => node.id === nodeId)
  const details = node?.details?.type === 'script' ? node.details : undefined
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<PendingAction>()
  const [start, setStart] = useState(1)
  const [end, setEnd] = useState(details?.shots?.length || 1)
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [resolution, setResolution] = useState('2K')
  const closeButton = useRef<HTMLButtonElement>(null)
  const previousPending = useRef(false)
  const active = useRef(true)
  const submission = useRef(false)
  const [similarSubjects, setSimilarSubjects] = useState<SimilarSubject[]>()
  const similarityDecision = useRef<((value: string | undefined) => void) | undefined>(undefined)
  const decideSimilarity = (value?: string) => { similarityDecision.current?.(value); similarityDecision.current = undefined; setSimilarSubjects(undefined) }
  const runner = useMemo(() => new ScriptWorkflowRunner({
    projectId: project.id, canvasId: project.activeCanvasId, registry, repository, subjects,
    onChange: state => { if (active.current) { setBusy(state.busy); if (state.message) setMessage(state.message) } },
    onSimilarSubjects: (_input, candidates) => new Promise(resolve => {
      if (!active.current) { resolve(undefined); return }
      similarityDecision.current = resolve; setSimilarSubjects(candidates)
    }),
  }), [project.id, project.activeCanvasId, registry, repository, subjects])
  useEffect(() => {
    active.current = true
    runner.resume()
    return () => { active.current = false; similarityDecision.current?.(undefined); similarityDecision.current = undefined; runner.dispose() }
  }, [runner])
  useEffect(() => { if (details?.shots?.length) setEnd(details.shots.length) }, [details?.shots?.length])
  useEffect(() => {
    // The initiating button may become disabled while the task runs. Return focus to
    // a stable workspace control instead of leaving it on the document body.
    if (previousPending.current && !pending) closeButton.current?.focus({ preventScroll: true })
    previousPending.current = Boolean(pending)
  }, [pending])
  const sourceBusy = busy || project.jobs.some(job => job.nodeId === nodeId && isActiveTask(job.status))
  const breakdownProvider = registry.list().find(p => p.id === scriptBreakdownProviderId)
  const storyboardProvider = registry.list().find(p => p.id === scriptStoryboardProviderId)
  const subjectProvider = registry.list().find(p => p.id === subjectExtractionId)
  const imageProvider = registry.list().find(p => p.id === 'seedream-5-pro-api')
  let quote: ReturnType<ScriptWorkflowRunner['quote']> | undefined
  let quoteError = ''
  if (details?.shots?.length && imageProvider) {
    try { quote = runner.quote(nodeId, start, end, { aspectRatio, resolution }) }
    catch (error) { quoteError = generationErrorMessage(error) }
  }
  const submit = async () => {
    if (!pending || submission.current || sourceBusy) return
    submission.current = true
    const action = pending
    setPending(undefined)
    setMessage('任务准备中…')
    try {
      if (action.kind === 'images') {
        const result = await runner.generateShots(nodeId, start, end, { aspectRatio, resolution })
        if (active.current) setMessage(`本轮完成 ${result.completed} 镜，失败 ${result.failed} 镜；结果已保存。${result.failed ? '失败镜头可再次批量生成，成功镜头自动跳过。' : ''}`)
      } else if (action.kind === 'subject') {
        const subject = await runner.extractCharacter(nodeId, action.characterId, action.assetId)
        if (active.current) setMessage(`主体“${subject.name}”已保存到主体库，可在角色库跨项目复用。`)
      } else {
        await runner.analyze(nodeId, action.kind, details?.outline)
        if (active.current) setMessage(action.kind === 'breakdown' ? '剧本拆解完成，章节、场景、角色和道具已保存。' : '分镜故事板已保存，可编辑后批量生成。')
      }
    } catch (error) { if (active.current) setMessage(generationErrorMessage(error, '脚本任务未完成，请重试。')) }
    finally { submission.current = false }
  }

  if (!node || !details) return null
  const updateOutline = (outline: string) => useProjectStore.getState().updateNode(nodeId, { details: { ...details, outline } })
  const imageDisabled = !imageProvider || !isProviderEnabled(imageProvider) ? imageProvider?.disabledReason ?? 'Seedream 未配置' : undefined
  const analysisDisabled = !breakdownProvider || !isProviderEnabled(breakdownProvider) ? breakdownProvider?.disabledReason ?? '豆包未配置' : undefined
  const shotDisabled = !storyboardProvider || !isProviderEnabled(storyboardProvider) ? storyboardProvider?.disabledReason ?? '豆包未配置' : undefined
  const hasScenes = details.chapters.some(chapter => chapter.scenes?.length)
  const aspectSchema = imageProvider?.parameterSchema.aspectRatio
  const resolutionSchema = imageProvider?.parameterSchema.resolution

  return <>
    <ConfirmDialog portal label="脚本 v2 工作台" className="script-v2-workspace" overlayClassName="script-v2-overlay nodrag nowheel"
      initialFocus="textarea" focusableSelector="button:not(:disabled),textarea:not(:disabled),input:not(:disabled),select:not(:disabled),summary" restoreFocus
      onClose={() => { if (pending) setPending(undefined); else onClose() }}>
      <header><div><h2>{node.title} · 脚本 v2</h2><p>剧本拆解 → 可编辑分镜 → 串行出图 → 发送画布</p></div><button ref={closeButton} type="button" aria-label="关闭脚本工作台" onClick={onClose}>关闭</button></header>
      <label>剧本原文<textarea aria-label="剧本原文" maxLength={12000} rows={5} disabled={sourceBusy} value={details.outline ?? ''} onChange={event => updateOutline(event.currentTarget.value)} /></label>
      <div className="script-v2-actions">
        <button type="button" disabled={sourceBusy || !details.outline?.trim() || Boolean(analysisDisabled)} title={analysisDisabled || (!details.outline?.trim() ? '请填写剧本原文' : undefined)} onClick={() => setPending({ kind: 'breakdown', cost: providerGenerationCost(breakdownProvider!) })}>AI拆解</button>
        <button type="button" disabled={sourceBusy || !hasScenes || Boolean(shotDisabled)} title={shotDisabled || (!hasScenes ? '请先AI拆解剧本' : undefined)} onClick={() => setPending({ kind: 'storyboard', cost: providerGenerationCost(storyboardProvider!) })}>生成分镜故事板</button>
        {busy ? <button type="button" onClick={() => runner.cancel()}>停止本轮任务</button> : null}
      </div>
      {analysisDisabled ? <p role="note">{analysisDisabled}</p> : null}
      {message ? <p role="status" className="script-v2-status">{message}</p> : null}
      <section aria-label="剧本拆解结果"><h3>章节与场景</h3>{details.chapters.map(chapter => <details key={chapter.id} open><summary>{chapter.title}</summary><p>{chapter.summary}</p><ol>{chapter.scenes?.map(scene => <li key={scene.id}><strong>{scene.title}</strong>：{scene.summary}</li>)}</ol></details>)}</section>
      <section aria-label="剧本角色"><h3>角色与主体</h3><p>选择上传图或分镜结果作为样本，再提取可见外貌与服装；没有图片时不会虚构视觉识别。</p>
        {details.characters?.map(character => {
          const selected = character.referenceAssetId ?? ''
          const reason = !subjectProvider || !isProviderEnabled(subjectProvider) ? subjectProvider?.disabledReason ?? '主体提取未配置' : !selected ? '请选择角色参考图，或先生成分镜。' : undefined
          return <article key={character.id} aria-label={`角色 ${character.name}`}><strong>{character.name}</strong><p>{character.description}</p>
            <label>参考图<select aria-label={`${character.name}参考图`} disabled={sourceBusy} value={selected} onChange={event => { try { runner.setCharacterReference(nodeId, character.id, event.currentTarget.value) } catch (error) { setMessage(generationErrorMessage(error)) } }}><option value="">请选择参考图</option>{project.assets.filter(asset => asset.kind === 'image').map((asset, index) => <option key={asset.id} value={asset.id}>{details.shots?.find(shot => shot.assetId === asset.id)?.title ?? `图片 ${index + 1}`}</option>)}</select></label>
            <button type="button" disabled={sourceBusy || Boolean(reason)} title={reason} onClick={() => setPending({ kind: 'subject', characterId: character.id, assetId: selected, cost: providerGenerationCost(subjectProvider!) })}>{character.subjectId ? '复用已提取主体' : '提取主体'}</button>
            {reason ? <small>{reason}</small> : null}
            {character.subjectId ? <span>已入主体库</span> : null}
          </article>
        })}
      </section>
      <section aria-label="剧本道具"><h3>道具</h3>{details.props?.length ? <ul>{details.props.map(prop => <li key={prop.id}>{prop.name}：{prop.description}</li>)}</ul> : <p>暂无拆解道具</p>}</section>
      <section aria-label="分镜批量生成"><h3>分镜批量生成</h3>
        <fieldset className="script-v2-range" disabled={sourceBusy}>
          <label>起始镜头<input aria-label="起始镜头" type="number" min={1} max={details.shots?.length || 1} value={start} onChange={event => setStart(Number(event.currentTarget.value))} /></label>
          <label>结束镜头<input aria-label="结束镜头" type="number" min={1} max={details.shots?.length || 1} value={end} onChange={event => setEnd(Number(event.currentTarget.value))} /></label>
          <label>画面比例<select aria-label="分镜画面比例" value={aspectRatio} onChange={event => setAspectRatio(event.currentTarget.value)}>{(aspectSchema?.type === 'enum' ? aspectSchema.options.filter(v => v !== '自定义' && v !== '自适应') : ['16:9']).map(value => <option key={value}>{value}</option>)}</select></label>
          <label>清晰度<select aria-label="分镜清晰度" value={resolution} onChange={event => setResolution(event.currentTarget.value)}>{(resolutionSchema?.type === 'enum' ? resolutionSchema.options : ['2K']).map(value => <option key={value}>{value}</option>)}</select></label>
        </fieldset>
        {quote ? <p>Seedream · {quote.size ? `${quote.size.width} × ${quote.size.height} · ` : ''}待生成 {quote.count} 镜 · 总预计成本 {quote.cost} 积分</p> : null}
        <p>每镜一张，串行请求；自动跳过已有结果。角色参考与提示词会提交给官方模型，结果一致性仍需人工复核。</p>
        {imageDisabled || quoteError ? <p role="note">{imageDisabled || quoteError}</p> : null}
        <button type="button" disabled={sourceBusy || Boolean(imageDisabled || quoteError) || !quote?.count} onClick={() => setPending({ kind: 'images', cost: quote!.cost })}>批量生成分镜</button>
      </section>
      <ScriptStoryboardCards details={details} assets={project.assets} busy={sourceBusy}
        onEdit={(shotId, changes) => { try { runner.updateShot(nodeId, shotId, changes) } catch (error) { setMessage(generationErrorMessage(error)) } }}
        onSend={shotId => { try { onSent(runner.sendShot(nodeId, shotId)) } catch (error) { setMessage(generationErrorMessage(error)) } }} />
    </ConfirmDialog>
    {pending ? <ConfirmDialog portal label="确认脚本任务费用" className="script-v2-confirm" overlayClassName="script-v2-overlay script-v2-overlay--confirm nodrag nowheel"
      initialFocus="button" focusableSelector="button" restoreFocus onClose={() => setPending(undefined)}>
      <h2>确认脚本任务费用</h2><p>本次总预计成本 {pending.cost} 积分。</p>
      {pending.kind === 'images' ? <p>串行 {quote?.count} 次；每成功一镜即保存。失败可重试，已完成镜头不会重复扣费请求。</p> : <p>豆包按实际 token 计费，积分是产品估算，以服务商账单为准。</p>}
      {pending.kind === 'subject' ? <p>若主体库仍有同一参考图的提取结果则直接复用，不再次请求或计费。</p> : null}
      {pending.kind === 'breakdown' || pending.kind === 'storyboard' ? <p>将替换当前{pending.kind === 'breakdown' ? '拆解与分镜表' : '分镜表'}；旧结果资产与生成历史保留。</p> : null}
      <p>确认后调用已配置的真实API；取消不能撤销服务端已发生的费用。</p>
      <button type="button" onClick={() => setPending(undefined)}>取消</button><button type="button" onClick={() => void submit()}>确认并执行</button>
    </ConfirmDialog> : null}
    {similarSubjects ? <ConfirmDialog portal label="确认相似主体" className="subject-details-dialog" overlayClassName="subject-details-backdrop nodrag nowheel" initialFocus="button" focusableSelector="button" onClose={() => decideSimilarity()}>
      <SimilarSubjectsReview candidates={similarSubjects} onMerge={decideSimilarity} onCreate={() => decideSimilarity('create')} onCancel={() => decideSimilarity()} />
    </ConfirmDialog> : null}
  </>
}
