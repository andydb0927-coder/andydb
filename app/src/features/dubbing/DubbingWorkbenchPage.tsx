import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Project } from '../project/model'
import { createDefaultProjectStorage } from '../project/project-repository'
import { defaultDubbingRepository, type DubbingWorkbenchRepository } from './dubbing-workbench-repository'
import { dubbingUiError, type DubbingWorkspace } from './dubbing-workbench-model'
import { DubbingPlanPanel, DubbingShotDetails, DubbingShotTable } from './DubbingWorkbenchPanels'
import { DubbingPlanEditor } from './DubbingPlanEditor'
import { DubbingContentDialog, DubbingReviewDialog } from './DubbingReviewDialogs'
import './dubbing-workbench.css'

const defaultProjects = createDefaultProjectStorage()
interface DubbingWorkbenchPageProps {
  repository?: DubbingWorkbenchRepository
  projectRepository?: { listAll(): Promise<Project[]> }
}
export function DubbingWorkbenchPage({ repository = defaultDubbingRepository, projectRepository = defaultProjects }: DubbingWorkbenchPageProps) {
  const [params, setParams] = useSearchParams()
  const [projects, setProjects] = useState<Project[]>(), [error, setError] = useState(''), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setError(''); setProjects(undefined)
    projectRepository.listAll().then(value => { if (active) setProjects(value) }, () => { if (active) setError('无法读取项目，请重试。') })
    return () => { active = false }
  }, [projectRepository, attempt])
  const selectedId = params.get('projectId') ?? projects?.[0]?.id
  const project = projects?.find(item => item.id === selectedId)
  return <main className="dubbing-workbench">
    <header className="dubbing-workbench-heading"><div><p className="dubbing-eyebrow">LOCAL REVIEW WORKSPACE</p><h1>出海转绘</h1><p>从已有镜头到自审、返修与交付记录 · 当前浏览器本地保存</p></div><Link to="/projects">返回项目空间</Link></header>
    {error ? <div className="dubbing-state"><p role="alert">{error}</p><button onClick={() => setAttempt(value => value + 1)}>重试</button></div>
      : !projects ? <p role="status">正在读取项目…</p>
        : !projects.length ? <div className="dubbing-state"><p>还没有项目，请先创建画布项目。</p><Link to="/projects/new">新建画布项目</Link></div>
          : <>
            <div className="dubbing-project-picker"><label>所属项目<select value={project?.id ?? ''} onChange={event => setParams({ projectId: event.target.value })}>
              {!project && <option value="">请选择项目</option>}{projects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select></label>{project && <Link to={`/project/${encodeURIComponent(project.id)}`}>打开对应画布</Link>}</div>
            {!project ? <p role="alert">项目不存在或当前浏览器没有该项目，请重新选择。</p> : <DubbingProjectWorkbench key={project.id} project={project} repository={repository} initialShotId={params.get('shotId') ?? ''} />}
          </>}
  </main>
}

function DubbingProjectWorkbench({ project, repository, initialShotId }: { project: Project; repository: DubbingWorkbenchRepository; initialShotId: string }) {
  const [workspace, setWorkspace] = useState<DubbingWorkspace>(), [selectedId, setSelectedId] = useState(initialShotId)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState<'plan' | 'revise' | 'deliver' | 'edit'>()
  const inFlight = useRef(false), mounted = useRef(true)
  const load = useCallback(async () => {
    setError('')
    try {
      const state = await repository.load(project.id)
      if (!mounted.current) return
      setWorkspace(state)
      setSelectedId(current => state.shots.some(shot => shot.record.id === current) ? current : state.shots[0]?.record.id ?? '')
    } catch { if (mounted.current) setError('无法读取工作台记录，请保留数据并重试。') }
  }, [repository, project.id])
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false } }, [load])
  const commit = async (operation: () => Promise<DubbingWorkspace>) => {
    if (inFlight.current) throw new Error('正在保存，请稍候。')
    inFlight.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const state = await operation()
      if (mounted.current) { setWorkspace(state); setMessage('已保存到本地工作台。') }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false) }
  }
  if (!workspace) return <div className="dubbing-state">{error ? <><p role="alert">{error}</p><button onClick={() => void load()}>重试</button></> : <p role="status">正在读取工作台…</p>}</div>
  const selected = workspace.shots.find(shot => shot.record.id === selectedId)
  const act = (type: 'submit' | 'approve' | 'revise' | 'deliver' | 'edit') => {
    if (!selected || busy) return
    if (type === 'submit' || type === 'approve') {
      void commit(() => repository[type](project.id, workspace.version, selectedId)).catch(failure => setError(dubbingUiError(failure)))
    } else setPanel(type)
  }
  return <>
    <div className="dubbing-workbench-summary"><span>{workspace.shots.length} 个镜头 · {workspace.shots.filter(shot => shot.record.status === '已通过').length} 已通过 · {workspace.shots.filter(shot => shot.record.status === '已交付').length} 已交付</span>
      <button type="button" disabled={busy || Boolean(panel)} onClick={() => void load()}>刷新工作台</button></div>
    {error && <p role="alert" className="dubbing-error">{error}</p>}{message && <p role="status" className="dubbing-save-state">{message}</p>}
    <div className="dubbing-columns">
      <DubbingShotTable shots={workspace.shots} selectedId={selectedId} select={setSelectedId} busy={busy} />
      <DubbingShotDetails shot={selected} projectId={project.id} busy={busy} action={act} />
      <DubbingPlanPanel workspace={workspace} shot={selected} busy={busy} editPlan={() => setPanel('plan')} checkQa={ids => {
        if (!selected || inFlight.current) return
        setWorkspace({ ...workspace, shots: workspace.shots.map(shot => shot.record.id === selectedId ? { ...shot, qa: { ...shot.qa, checkedIds: ids } } : shot) })
        void commit(() => repository.checkQa(project.id, workspace.version, selectedId, ids)).catch(failure => {
          if (mounted.current) { setWorkspace(workspace); setError(dubbingUiError(failure)) }
        })
      }} />
    </div>
    {panel === 'plan' && <DubbingPlanEditor projectId={project.id} plan={workspace.plan} onClose={() => setPanel(undefined)} save={input => commit(() => repository.savePlan(project.id, workspace.version, input))} />}
    {(panel === 'revise' || panel === 'deliver') && selected && <DubbingReviewDialog mode={panel} onClose={() => setPanel(undefined)} save={(text, ids) => commit(() => panel === 'revise' ? repository.revise(project.id, workspace.version, selectedId, text, ids) : repository.deliver(project.id, workspace.version, selectedId, text))} />}
    {panel === 'edit' && selected && <DubbingContentDialog content={selected.record.content} onClose={() => setPanel(undefined)} save={content => commit(() => repository.editContent(project.id, workspace.version, selectedId, content))} />}
  </>
}
