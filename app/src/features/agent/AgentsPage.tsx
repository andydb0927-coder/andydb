import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { ProjectRepository, WirelessCanvasDatabase } from '../project/project-repository'
import type { Project } from '../project/model'
import { TimelineRepository } from '../timeline/timeline-repository'
import type { TimelineProjectRepository } from '../timeline/timeline-repository'
import {
  AgentSkillExecutionCancelledError,
  AgentSkillOutputError,
  AgentSkillValidationError,
  createSkillEnablementStore,
  type AgentSkillDefinition,
  type AgentSkillInput,
  type AgentSkillResult,
  type SkillEnablementStore,
} from './agent-skill'
import { defaultAgentSkillRuntime, type AgentSkillRuntime } from './skill-loader'
import { appendSkillResultNode, type SkillResultEnvironment } from './skill-result-node'
import {
  defaultWorkspaceManifestClient,
  type WorkspaceManifestClient,
  type WorkspaceManifestSummary,
} from './workspace-manifest-client'

type AgentProjectRepository = Pick<ProjectRepository, 'listRecent' | 'save'>

export interface AgentsPageProps {
  repository?: AgentProjectRepository
  timelineRepository?: Pick<TimelineProjectRepository, 'load'>
  enablementStore?: SkillEnablementStore
  environment?: SkillResultEnvironment
  runtime?: AgentSkillRuntime
  workspaceClient?: WorkspaceManifestClient
}

const database = new WirelessCanvasDatabase()
const defaultRepository = new ProjectRepository(database)
const defaultTimelineRepository = new TimelineRepository(database)
function initialInput(definition: AgentSkillDefinition): AgentSkillInput {
  return Object.fromEntries(
    Object.entries(definition.inputSchema.properties).flatMap(([key, property]) =>
      property.default === undefined ? [] : [[key, property.default]],
    ),
  )
}

export function AgentsPage({
  repository = defaultRepository,
  timelineRepository = defaultTimelineRepository,
  enablementStore: suppliedEnablementStore,
  environment,
  runtime = defaultAgentSkillRuntime,
  workspaceClient = defaultWorkspaceManifestClient,
}: AgentsPageProps) {
  const agentSkills = runtime.definitions
  const agentSkillRegistry = runtime.registry
  const enablementStore = useMemo(
    () => suppliedEnablementStore ?? createSkillEnablementStore(localStorage, agentSkills),
    [agentSkills, suppliedEnablementStore],
  )
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [inputs, setInputs] = useState<Record<string, AgentSkillInput>>(() =>
    Object.fromEntries(agentSkills.map((skill) => [skill.id, initialInput(skill)])),
  )
  const [enablementVersion, setEnablementVersion] = useState(0)
  const [runningSkillId, setRunningSkillId] = useState<string>()
  const [result, setResult] = useState<{
    skill: AgentSkillDefinition
    value: AgentSkillResult
    projectId: string
  }>()
  const [writeStatus, setWriteStatus] = useState<'idle' | 'saving' | 'written'>('idle')
  const [feedback, setFeedback] = useState<string>()
  const [cliState, setCliState] = useState<
    { status: 'loading' } |
    { status: 'ready'; manifest: WorkspaceManifestSummary } |
    { status: 'unavailable' }
  >({ status: 'loading' })
  const abortControllerRef = useRef<AbortController | undefined>(undefined)
  const runTokenRef = useRef(0)

  useEffect(() => {
    let active = true
    void repository.listRecent(100).then((records) => {
      if (!active) return
      setProjects(records)
      setSelectedProjectId((current) => current || records[0]?.id || '')
    }).catch(() => { if (active) setFeedback('无法读取本地项目') })
    return () => { active = false }
  }, [repository])

  useEffect(() => {
    let active = true
    setCliState({ status: 'loading' })
    void workspaceClient.loadManifest().then((manifest) => {
      if (active) setCliState({ status: 'ready', manifest })
    }).catch(() => {
      if (active) setCliState({ status: 'unavailable' })
    })
    return () => { active = false }
  }, [workspaceClient])

  useEffect(() => () => {
    runTokenRef.current += 1
    abortControllerRef.current?.abort()
  }, [])

  const selectedProject = projects.find(({ id }) => id === selectedProjectId)

  const runSkill = async (skill: AgentSkillDefinition) => {
    if (runningSkillId || !selectedProject || !enablementStore.isEnabled(skill.id)) return
    const projectAtStart = selectedProject
    const controller = new AbortController()
    const token = runTokenRef.current + 1
    runTokenRef.current = token
    abortControllerRef.current = controller
    setRunningSkillId(skill.id)
    setResult(undefined)
    setWriteStatus('idle')
    setFeedback(undefined)
    try {
      const timeline = await timelineRepository.load(projectAtStart.id)
      if (controller.signal.aborted) throw new AgentSkillExecutionCancelledError()
      const value = await agentSkillRegistry.execute(
        skill.id,
        inputs[skill.id] ?? {},
        { project: projectAtStart, timeline, signal: controller.signal },
      )
      if (token === runTokenRef.current && !controller.signal.aborted) {
        setResult({ skill, value, projectId: projectAtStart.id })
      }
    } catch (error) {
      if (token === runTokenRef.current) {
        if (controller.signal.aborted || error instanceof AgentSkillExecutionCancelledError) {
          setFeedback('技能执行已取消')
        } else if (
          error instanceof AgentSkillValidationError ||
          error instanceof AgentSkillOutputError
        ) {
          setFeedback(error.message)
        } else {
          setFeedback('技能执行失败')
        }
      }
    } finally {
      if (token === runTokenRef.current) {
        abortControllerRef.current = undefined
        setRunningSkillId(undefined)
      }
    }
  }

  const cancelSkill = () => {
    abortControllerRef.current?.abort()
  }

  const selectProject = (projectId: string) => {
    runTokenRef.current += 1
    abortControllerRef.current?.abort()
    abortControllerRef.current = undefined
    setRunningSkillId(undefined)
    setResult(undefined)
    setWriteStatus('idle')
    setFeedback(undefined)
    setSelectedProjectId(projectId)
  }

  const writeResult = async () => {
    if (
      !selectedProject || !result || result.projectId !== selectedProject.id ||
      writeStatus !== 'idle'
    ) return
    setWriteStatus('saving')
    try {
      const next = appendSkillResultNode(selectedProject, result.value, environment)
      await repository.save(next)
      setProjects((current) => current.map((project) => project.id === next.id ? next : project))
      setWriteStatus('written')
      setFeedback('结果已写入画布文本节点')
    } catch {
      setWriteStatus('idle')
      setFeedback('无法写入本地项目')
    }
  }

  return (
    <main className="platform-page agents-page">
      <header className="platform-page__header">
        <p className="platform-page__eyebrow">LOCAL AGENT · SKILL REGISTRY</p>
        <h1>Agent、Skill 与 CLI</h1>
        <p>五个内置技能均使用本地确定性逻辑；不调用外部 LibTV、不消耗积分，也不会上传项目数据。</p>
      </header>

      <label className="platform-page__project-picker">
        执行项目
        <select value={selectedProjectId} onChange={(event) => selectProject(event.target.value)}>
          {projects.length ? null : <option value="">暂无本地项目</option>}
          {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select>
      </label>

      <section className="agent-skill-grid" aria-label="已注册技能">
        {agentSkills.map((skill) => {
          const enabled = enablementStore.isEnabled(skill.id)
          const skillInput = inputs[skill.id] ?? {}
          return (
            <article key={skill.id} className="agent-skill-card" aria-label={skill.name}>
              <div className="agent-skill-card__heading">
                <div>
                  <span>{skill.category} · v{skill.version}</span>
                  <h2>{skill.name}</h2>
                </div>
                <label className="agent-skill-toggle">
                  <input
                    type="checkbox"
                    checked={enabled}
                    aria-label={`启用${skill.name}`}
                    onChange={(event) => {
                      enablementStore.setEnabled(skill.id, event.target.checked)
                      setEnablementVersion((value) => value + 1)
                    }}
                  />
                  {enabled ? '已启用' : '已停用'}
                </label>
              </div>
              <p>{skill.description}</p>
              <div className="agent-skill-fields">
                {Object.entries(skill.inputSchema.properties).map(([key, property]) => (
                  <label key={key}>
                    {property.label}
                    {property.enum ? (
                      <select
                        value={String(skillInput[key] ?? '')}
                        onChange={(event) => setInputs((current) => ({
                          ...current,
                          [skill.id]: { ...skillInput, [key]: event.target.value },
                        }))}
                      >
                        {property.enum.map((value) => <option key={value}>{value}</option>)}
                      </select>
                    ) : (
                      <input
                        type={property.type === 'number' ? 'number' : 'text'}
                        value={String(skillInput[key] ?? '')}
                        min={property.minimum}
                        max={property.maximum}
                        onChange={(event) => setInputs((current) => ({
                          ...current,
                          [skill.id]: {
                            ...skillInput,
                            [key]: property.type === 'number' ? Number(event.target.value) : event.target.value,
                          },
                        }))}
                      />
                    )}
                  </label>
                ))}
              </div>
              {runningSkillId === skill.id ? (
                <button type="button" onClick={cancelSkill}>取消执行</button>
              ) : (
                <button
                  type="button"
                  disabled={!enabled || !selectedProject || Boolean(runningSkillId)}
                  onClick={() => void runSkill(skill)}
                >
                  运行技能
                </button>
              )}
            </article>
          )
        })}
      </section>

      <section className="agent-cli-status" role="region" aria-labelledby="agent-cli-heading">
        <div>
          <p className="platform-page__eyebrow">SAME-ORIGIN WORKSPACE BRIDGE</p>
          <h2 id="agent-cli-heading">本地工作区 CLI</h2>
        </div>
        {cliState.status === 'loading' ? <p role="status">正在检测本地 CLI 桥接…</p> : null}
        {cliState.status === 'ready' ? (
          <div>
            <strong>CLI 桥接已连接</strong>
            <ul>
              {cliState.manifest.commands.map((command) => (
                <li key={command.id}>
                  <code>{command.id}</code>
                  <span>{command.description}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {cliState.status === 'unavailable' ? (
          <div>
            <strong>当前构建未启用本地 CLI 桥接</strong>
            <p>技能仍可在浏览器内本地运行；CLI 命令只在已启动工作区桥接的开发或预览环境显示。</p>
          </div>
        ) : null}
      </section>

      {result ? (
        <section className="agent-result-card" role="region" aria-label="技能执行结果">
          <span>{result.skill.name} · 本地结果</span>
          <h2>{result.value.title}</h2>
          <p>{result.value.summary}</p>
          <pre>{result.value.content}</pre>
          <div>
            <button
              type="button"
              disabled={!selectedProject || selectedProject.id !== result.projectId || writeStatus !== 'idle'}
              onClick={() => void writeResult()}
            >
              {writeStatus === 'saving' ? '写入中…' : writeStatus === 'written' ? '已写入画布' : '写入画布节点'}
            </button>
            <Link to={`/project/${result.projectId}`}>打开项目画布</Link>
          </div>
        </section>
      ) : null}
      {feedback ? <p className="agent-feedback" role="status">{feedback}</p> : null}
      <span className="sr-only" aria-hidden="true">{enablementVersion}</span>
    </main>
  )
}
