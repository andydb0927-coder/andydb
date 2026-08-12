import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { ProjectRepository, WirelessCanvasDatabase } from '../project/project-repository'
import type { Project } from '../project/model'
import { TimelineRepository } from '../timeline/timeline-repository'
import type { TimelineProjectRepository } from '../timeline/timeline-repository'
import {
  createSkillEnablementStore,
  type AgentSkillDefinition,
  type AgentSkillInput,
  type AgentSkillResult,
  type SkillEnablementStore,
} from './agent-skill'
import { defaultAgentSkillRuntime } from './skill-loader'
import { appendSkillResultNode, type SkillResultEnvironment } from './skill-result-node'

type AgentProjectRepository = Pick<ProjectRepository, 'listRecent' | 'save'>

export interface AgentsPageProps {
  repository?: AgentProjectRepository
  timelineRepository?: Pick<TimelineProjectRepository, 'load'>
  enablementStore?: SkillEnablementStore
  environment?: SkillResultEnvironment
}

const database = new WirelessCanvasDatabase()
const defaultRepository = new ProjectRepository(database)
const defaultTimelineRepository = new TimelineRepository(database)
const { definitions: agentSkills, registry: agentSkillRegistry } = defaultAgentSkillRuntime

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
}: AgentsPageProps) {
  const enablementStore = useMemo(
    () => suppliedEnablementStore ?? createSkillEnablementStore(localStorage, agentSkills),
    [suppliedEnablementStore],
  )
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [inputs, setInputs] = useState<Record<string, AgentSkillInput>>(() =>
    Object.fromEntries(agentSkills.map((skill) => [skill.id, initialInput(skill)])),
  )
  const [enablementVersion, setEnablementVersion] = useState(0)
  const [runningSkillId, setRunningSkillId] = useState<string>()
  const [result, setResult] = useState<{ skill: AgentSkillDefinition; value: AgentSkillResult }>()
  const [feedback, setFeedback] = useState<string>()

  useEffect(() => {
    let active = true
    void repository.listRecent(100).then((records) => {
      if (!active) return
      setProjects(records)
      setSelectedProjectId((current) => current || records[0]?.id || '')
    }).catch(() => { if (active) setFeedback('无法读取本地项目') })
    return () => { active = false }
  }, [repository])

  const selectedProject = projects.find(({ id }) => id === selectedProjectId)

  const runSkill = async (skill: AgentSkillDefinition) => {
    if (!selectedProject || !enablementStore.isEnabled(skill.id)) return
    setRunningSkillId(skill.id)
    setFeedback(undefined)
    try {
      const timeline = await timelineRepository.load(selectedProject.id)
      const value = await agentSkillRegistry.execute(
        skill.id,
        inputs[skill.id] ?? {},
        { project: selectedProject, timeline },
      )
      setResult({ skill, value })
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '技能执行失败')
    } finally {
      setRunningSkillId(undefined)
    }
  }

  const writeResult = async () => {
    if (!selectedProject || !result) return
    try {
      const next = appendSkillResultNode(selectedProject, result.value, environment)
      await repository.save(next)
      setProjects((current) => current.map((project) => project.id === next.id ? next : project))
      setFeedback('结果已写入画布文本节点')
    } catch {
      setFeedback('无法写入本地项目')
    }
  }

  return (
    <main className="platform-page agents-page">
      <header className="platform-page__header">
        <p className="platform-page__eyebrow">LOCAL AGENT · SKILL REGISTRY</p>
        <h1>Agent 技能中心</h1>
        <p>五个内置技能均使用本地确定性逻辑；不调用外部 LibTV、不消耗积分，也不会上传项目数据。</p>
      </header>

      <label className="platform-page__project-picker">
        执行项目
        <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
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
              <button
                type="button"
                disabled={!enabled || !selectedProject || runningSkillId === skill.id}
                onClick={() => void runSkill(skill)}
              >
                {runningSkillId === skill.id ? '执行中…' : '运行技能'}
              </button>
            </article>
          )
        })}
      </section>

      {result ? (
        <section className="agent-result-card" role="region" aria-label="技能执行结果">
          <span>{result.skill.name} · 本地结果</span>
          <h2>{result.value.title}</h2>
          <p>{result.value.summary}</p>
          <pre>{result.value.content}</pre>
          <div>
            <button type="button" disabled={!selectedProject} onClick={() => void writeResult()}>写入画布节点</button>
            {selectedProject ? <Link to={`/project/${selectedProject.id}`}>打开项目画布</Link> : null}
          </div>
        </section>
      ) : null}
      {feedback ? <p className="agent-feedback" role="status">{feedback}</p> : null}
      <span className="sr-only" aria-hidden="true">{enablementVersion}</span>
    </main>
  )
}
