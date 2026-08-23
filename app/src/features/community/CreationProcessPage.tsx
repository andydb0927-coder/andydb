import { ArrowLeft, Copy, Eye, EyeOff, GitBranch, LockKeyhole } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import type { Project } from '../project/model'
import { ProjectRepository, WirelessCanvasDatabase } from '../project/project-repository'
import { CommunityRepository, type CommunityWorkRepository } from './community-repository'
import type { PublishedWork } from './community-model'

type ProcessCommunityRepository = Pick<CommunityWorkRepository, 'get'> &
  Partial<Pick<CommunityWorkRepository, 'ensureDemoWorks'>>
type ProcessProjectRepository = Pick<ProjectRepository, 'save'>

interface ProcessEnvironment {
  now(): string
  randomId(): string
}

export interface CreationProcessPageProps {
  communityRepository?: ProcessCommunityRepository
  projectRepository?: ProcessProjectRepository
  environment?: ProcessEnvironment
}

const database = new WirelessCanvasDatabase()
const defaultCommunityRepository = new CommunityRepository(database)
const defaultProjectRepository = new ProjectRepository(database)
const defaultEnvironment: ProcessEnvironment = {
  now: () => new Date().toISOString(),
  randomId: () => crypto.randomUUID(),
}

type ProcessState =
  | { status: 'loading' }
  | { status: 'ready'; work: PublishedWork }
  | { status: 'unavailable' }

function nodeTimestamp(project: Project, nodeId: string) {
  const node = project.nodes.find((candidate) => candidate.id === nodeId)
  const active = node?.versions.find((version) => version.id === node.activeVersionId)
  return active?.createdAt ?? node?.versions.at(-1)?.createdAt ?? project.updatedAt
}

function readableDay(timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.valueOf())) return '创作记录'
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(date)
}

export function CreationProcessPage({
  communityRepository = defaultCommunityRepository,
  projectRepository = defaultProjectRepository,
  environment = defaultEnvironment,
}: CreationProcessPageProps) {
  const { workId } = useParams<{ workId: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<ProcessState>({ status: 'loading' })
  const [connectionsVisible, setConnectionsVisible] = useState(true)
  const [copying, setCopying] = useState(false)
  const [copyError, setCopyError] = useState('')

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    if (!workId) {
      setState({ status: 'unavailable' })
      return () => { active = false }
    }
    void Promise.resolve(communityRepository.ensureDemoWorks?.()).then(() => communityRepository.get(workId)).then((work) => {
      if (!active) return
      setState(work?.status === 'published' ? { status: 'ready', work } : { status: 'unavailable' })
    }).catch(() => {
      if (active) setState({ status: 'unavailable' })
    })
    return () => { active = false }
  }, [communityRepository, workId])

  const groupedNodes = useMemo(() => {
    if (state.status !== 'ready') return []
    const groups = new Map<string, typeof state.work.projectSnapshot.nodes>()
    for (const node of state.work.projectSnapshot.nodes) {
      const day = readableDay(nodeTimestamp(state.work.projectSnapshot, node.id))
      groups.set(day, [...(groups.get(day) ?? []), node])
    }
    return [...groups.entries()]
  }, [state])

  if (state.status === 'loading') {
    return <main className="creation-process-page"><p role="status">正在载入创作过程…</p></main>
  }

  if (state.status === 'unavailable') {
    return (
      <main className="creation-process-page creation-process-page--empty">
        <h1>创作过程暂不可用</h1>
        <Link to="/">返回首页</Link>
      </main>
    )
  }

  const { work } = state
  const project = work.projectSnapshot
  const titleByNodeId = new Map(project.nodes.map((node) => [node.id, node.title]))

  const copyProject = async () => {
    if (copying) return
    setCopying(true)
    setCopyError('')
    const timestamp = environment.now()
    const copiedProjectId = environment.randomId()
    const copy: Project = {
      ...structuredClone(project),
      id: copiedProjectId,
      title: `${work.title} 副本`,
      createdAt: timestamp,
      updatedAt: timestamp,
      jobs: project.jobs.map((job) => ({ ...structuredClone(job), projectId: copiedProjectId })),
    }
    try {
      await projectRepository.save(copy)
      navigate(`/project/${copy.id}`)
    } catch {
      setCopyError('复制项目失败，请重试。')
      setCopying(false)
    }
  }

  return (
    <main className="creation-process-page">
      <header className="creation-process-page__header">
        <Link className="focus-visible" to={`/detail/${work.id}`}><ArrowLeft aria-hidden="true" />返回作品</Link>
        <div>
          <p>CREATION PROCESS</p>
          <h1>{work.title} · 创作过程</h1>
        </div>
        <button className="focus-visible" type="button" disabled={copying} onClick={() => void copyProject()}>
          <Copy aria-hidden="true" />{copying ? '正在复制…' : '复制项目'}
        </button>
      </header>

      <div className="creation-process-page__notice" role="note">
        <LockKeyhole aria-hidden="true" />
        <span>只读模式；复制会在当前浏览器创建一个新项目</span>
      </div>
      {copyError ? <p role="alert">{copyError}</p> : null}

      <div className="creation-process-page__toolbar">
        <span>{project.nodes.length} 个节点 · {project.edges.length} 条连接</span>
        <button type="button" aria-pressed={connectionsVisible} onClick={() => setConnectionsVisible((value) => !value)}>
          {connectionsVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          {connectionsVisible ? '隐藏连线' : '显示连线'}
        </button>
      </div>

      <div className="creation-process-page__workspace">
        <section className="creation-process-page__timeline" aria-label="时间分组节点列表" role="region">
          {groupedNodes.map(([day, nodes]) => (
            <section key={day} className="creation-process-group" aria-label={day}>
              <h2><time>{day}</time><span>{nodes.length} 个节点</span></h2>
              <div>
                {nodes.map((node, index) => (
                  <article key={node.id} className="creation-process-node">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div><small>{node.kind}</small><h3>{node.title}</h3><p>{node.versions.find((version) => version.id === node.activeVersionId)?.prompt || '暂无提示词'}</p></div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </section>

        {connectionsVisible ? (
          <section className="creation-process-page__connections" aria-label="依赖连线" role="region">
            <h2><GitBranch aria-hidden="true" />依赖连线</h2>
            {project.edges.length ? (
              <ol>
                {project.edges.map((edge) => (
                  <li key={edge.id}>
                    <span>{titleByNodeId.get(edge.sourceNodeId) ?? edge.sourceNodeId}</span>
                    <i aria-hidden="true">→</i>
                    <span>{titleByNodeId.get(edge.targetNodeId) ?? edge.targetNodeId}</span>
                  </li>
                ))}
              </ol>
            ) : <p>该作品没有依赖连线。</p>}
          </section>
        ) : null}
      </div>
    </main>
  )
}
