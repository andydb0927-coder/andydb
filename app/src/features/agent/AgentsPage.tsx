import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Send, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { createDefaultProjectStorage, type ProjectRepository, WirelessCanvasDatabase } from '../project/project-repository'
import { defaultProviderRegistry, groupProvidersForMenu, isProviderEnabled, type ProviderRegistry } from '../generation/model-provider-registry'
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
  providerRegistry?: ProviderRegistry
  repository?: AgentProjectRepository
  timelineRepository?: Pick<TimelineProjectRepository, 'load'>
  enablementStore?: SkillEnablementStore
  environment?: SkillResultEnvironment
  runtime?: AgentSkillRuntime
  workspaceClient?: WorkspaceManifestClient
}

const database = new WirelessCanvasDatabase()
const defaultRepository = createDefaultProjectStorage(database)
const defaultTimelineRepository = new TimelineRepository(database)

const skillCategories = [
  '全部',
  '专业影视',
  '商业广告',
  '短剧漫剧',
  '动漫游戏',
  '音乐MV',
  '自媒体创作',
  '通用技能',
] as const

type SkillCategory = (typeof skillCategories)[number]
type SkillCatalogView = 'skills' | 'favorites' | 'mine'

interface SkillPresentation {
  author: string
  category: Exclude<SkillCategory, '全部'>
  coverLabel: string
  tone: string
  usage: string
}

const skillPresentationById: Record<string, SkillPresentation> = {
  'storyboard.prompt-batch': {
    author: '无线导演', category: '专业影视', coverLabel: 'SHOT', tone: 'violet', usage: '1.8K',
  },
  'assets.organize-report': {
    author: '素材管家', category: '通用技能', coverLabel: 'ASSET', tone: 'cyan', usage: '936',
  },
  'timeline.duration-stats': {
    author: '剪辑助手', category: '通用技能', coverLabel: 'TIME', tone: 'amber', usage: '684',
  },
  'publishing.copywriter': {
    author: '发布主理人', category: '自媒体创作', coverLabel: 'COPY', tone: 'rose', usage: '2.1K',
  },
  'project.backup-check': {
    author: '项目守护者', category: '通用技能', coverLabel: 'SAFE', tone: 'emerald', usage: '512',
  },
}

function skillPresentation(skill: AgentSkillDefinition): SkillPresentation {
  return skillPresentationById[skill.id] ?? {
    author: '本地创作者',
    category: skill.category === 'writing' ? '自媒体创作' : '通用技能',
    coverLabel: 'SKILL',
    tone: 'violet',
    usage: '本地',
  }
}

function initialInput(definition: AgentSkillDefinition): AgentSkillInput {
  return Object.fromEntries(
    Object.entries(definition.inputSchema.properties).flatMap(([key, property]) =>
      property.default === undefined ? [] : [[key, property.default]],
    ),
  )
}

export function AgentsPage({
  providerRegistry = defaultProviderRegistry,
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
  const [catalogView, setCatalogView] = useState<SkillCatalogView>('skills')
  const [skillCategory, setSkillCategory] = useState<SkillCategory>('全部')
  const [skillQuery, setSkillQuery] = useState('')
  const [selectedSkillId, setSelectedSkillId] = useState('')
  const [focusRunner, setFocusRunner] = useState(false)
  const [creativePrompt, setCreativePrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState<string>()
  const model = providerRegistry.defaultFor(['text-to-video', 'image-to-video'], selectedModel)
  const modelGroups = groupProvidersForMenu(providerRegistry.menuProvidersFor(['text-to-video', 'image-to-video']))
  const [generationMode, setGenerationMode] = useState('smart')
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
  const runPanelRef = useRef<HTMLElement>(null)

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

  useEffect(() => {
    if (!focusRunner) return
    runPanelRef.current?.focus()
    setFocusRunner(false)
  }, [focusRunner, selectedSkillId])

  const selectedProject = projects.find(({ id }) => id === selectedProjectId)
  const selectedSkill = agentSkills.find(({ id }) => id === selectedSkillId)
  const visibleSkills = useMemo(() => {
    const normalizedQuery = skillQuery.trim().toLocaleLowerCase()
    return agentSkills.filter((skill) => {
      const presentation = skillPresentation(skill)
      if (catalogView === 'favorites' && !enablementStore.isEnabled(skill.id)) return false
      if (skillCategory !== '全部' && presentation.category !== skillCategory) return false
      if (!normalizedQuery) return true
      return `${skill.name} ${skill.description} ${presentation.author} ${presentation.category}`
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    })
  }, [agentSkills, catalogView, enablementStore, enablementVersion, skillCategory, skillQuery])

  const selectSkill = (skillId: string) => {
    if (runningSkillId) return
    setSelectedSkillId(skillId)
    setFocusRunner(true)
  }

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

  const selectedSkillInput = selectedSkill ? inputs[selectedSkill.id] ?? {} : {}
  const selectedSkillEnabled = selectedSkill
    ? enablementStore.isEnabled(selectedSkill.id)
    : false

  return (
    <main className="platform-page agents-page">
      <header className="platform-page__header">
        <p className="platform-page__eyebrow">LOCAL SKILLS · AGENT REGISTRY</p>
        <h1>Skill 全开，故事走起</h1>
        <p>浏览并筛选本地创作 Skill；全部能力使用确定性逻辑，不调用外部 LibTV、不消耗积分，也不会上传项目数据。</p>
      </header>

      <section className="agent-creation-composer" role="region" aria-label="Skill 创作输入">
        <div className="agent-creation-composer__intro">
          <Sparkles aria-hidden="true" />
          <div><strong>让 Skill 接住你的灵感</strong><span>先选择模型与生成模式，再描述希望完成的内容。</span></div>
        </div>
        <textarea
          aria-label="描述创作目标"
          rows={3}
          value={creativePrompt}
          placeholder="例如：用三个镜头讲述雨夜重逢，保持角色和环境连续性……"
          onChange={(event) => setCreativePrompt(event.target.value)}
        />
        <div className="agent-creation-composer__controls">
          <label>
            <span>选择模型</span>
            <select aria-label="选择模型" value={model?.id ?? ''} onChange={(event) => setSelectedModel(event.target.value)}>
              {modelGroups.map((group) => (
                <optgroup key={group.id} label={group.label}>
                  {group.providers.map((provider) => (
                    <option key={provider.id} value={provider.id} disabled={!isProviderEnabled(provider)}>
                      {provider.name} · {provider.modelName}{provider.disabledReason ? ' · ' + provider.disabledReason : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            <span>生成模式</span>
            <select aria-label="生成模式" value={generationMode} onChange={(event) => setGenerationMode(event.target.value)}>
              <option value="smart">智能生成</option>
              <option value="fast">快速生成</option>
              <option value="precise">精细生成</option>
            </select>
          </label>
          <button
            type="button"
            disabled={!model || !isProviderEnabled(model)}
            title={model?.disabledReason}
            onClick={() => setFeedback(creativePrompt.trim()
              ? `已准备 ${model?.modelName} · ${generationMode} 的创作草稿；请在画布提交生成。`
              : '请先描述创作目标')}
          >
            <Send aria-hidden="true" />开始创作
          </button>
        </div>
        {model?.disabledReason ? <p role="note">{model.disabledReason}</p> : null}
      </section>

      <section className="agent-catalog-scope" aria-label="Skill 本地浏览范围">
        <div className="agent-catalog-view-tabs" role="tablist" aria-label="Skill 浏览范围">
          {([
            ['skills', 'Skill'],
            ['favorites', '收藏'],
            ['mine', '我的'],
          ] as const).map(([view, label]) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={catalogView === view}
              onClick={() => setCatalogView(view)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="agent-catalog-boundary" role="note">
          {catalogView === 'favorites'
            ? '“收藏”映射为当前设备已启用的 Skill。'
            : catalogView === 'mine'
              ? '“我的”映射为本地工作区已注册的 Skill。'
              : 'Skill 列表来自当前本地运行时，不包含远程账户数据。'}
        </p>
      </section>

      <section className="agent-catalog-tools" role="region" aria-label="Skill 分类与搜索">
        <div className="agent-catalog-tabs" aria-label="Skill 分类">
          {skillCategories.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={skillCategory === category}
              onClick={() => setSkillCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
        <label className="agent-catalog-search">
          <span>搜索 Skill</span>
          <span>
            <Search aria-hidden="true" />
            <input
              type="search"
              aria-label="搜索 Skill"
              value={skillQuery}
              placeholder="搜索名称、描述或作者"
              onChange={(event) => setSkillQuery(event.target.value)}
            />
          </span>
        </label>
      </section>

      {selectedSkill ? (
        <section
          ref={runPanelRef}
          className="agent-skill-runner"
          role="region"
          aria-label="Skill 运行面板"
          tabIndex={-1}
        >
          <header className="agent-skill-runner__header">
            <div>
              <p className="platform-page__eyebrow">SELECTED LOCAL SKILL</p>
              <h2>{selectedSkill.name}</h2>
              <p>{selectedSkill.description}</p>
            </div>
            <span data-enabled={selectedSkillEnabled}>
              {selectedSkillEnabled ? '当前设备已启用' : '当前设备已停用'}
            </span>
          </header>

          <label className="platform-page__project-picker">
            执行项目
            <select value={selectedProjectId} onChange={(event) => selectProject(event.target.value)}>
              {projects.length ? null : <option value="">暂无本地项目</option>}
              {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
          </label>

          <div className="agent-skill-fields">
            {Object.entries(selectedSkill.inputSchema.properties).length ? (
              Object.entries(selectedSkill.inputSchema.properties).map(([key, property]) => (
                <label key={key}>
                  {property.label}
                  {property.enum ? (
                    <select
                      value={String(selectedSkillInput[key] ?? '')}
                      onChange={(event) => setInputs((current) => ({
                        ...current,
                        [selectedSkill.id]: {
                          ...selectedSkillInput,
                          [key]: event.target.value,
                        },
                      }))}
                    >
                      {property.enum.map((value) => <option key={value}>{value}</option>)}
                    </select>
                  ) : (
                    <input
                      type={property.type === 'number' ? 'number' : 'text'}
                      value={String(selectedSkillInput[key] ?? '')}
                      min={property.minimum}
                      max={property.maximum}
                      onChange={(event) => setInputs((current) => ({
                        ...current,
                        [selectedSkill.id]: {
                          ...selectedSkillInput,
                          [key]: property.type === 'number'
                            ? Number(event.target.value)
                            : event.target.value,
                        },
                      }))}
                    />
                  )}
                </label>
              ))
            ) : (
              <p className="agent-skill-runner__empty-fields">此 Skill 无需额外参数。</p>
            )}
          </div>

          <div className="agent-skill-runner__actions">
            {runningSkillId === selectedSkill.id ? (
              <button type="button" onClick={cancelSkill}>取消执行</button>
            ) : (
              <button
                type="button"
                aria-label="运行技能"
                disabled={!selectedSkillEnabled || !selectedProject || Boolean(runningSkillId)}
                onClick={() => void runSkill(selectedSkill)}
              >
                运行 Skill
              </button>
            )}
            {!selectedSkillEnabled ? <p>请先在浏览卡上启用该 Skill。</p> : null}
            {!selectedProject ? <p>需要一个真实本地项目才能运行。</p> : null}
          </div>
        </section>
      ) : null}

      <section className="agent-skill-grid" aria-label="已注册技能">
        {visibleSkills.map((skill) => {
          const enabled = enablementStore.isEnabled(skill.id)
          const presentation = skillPresentation(skill)
          return (
            <article
              key={skill.id}
              className="agent-skill-card"
              aria-label={skill.name}
              data-selected={selectedSkill?.id === skill.id}
            >
              <div
                className="agent-skill-card__cover"
                data-tone={presentation.tone}
                role="img"
                aria-label={`${skill.name}封面`}
              >
                <span>{presentation.category}</span>
                <strong>{presentation.coverLabel}</strong>
              </div>
              <div className="agent-skill-card__summary">
                <div className="agent-skill-card__heading">
                  <span>{presentation.category} · v{skill.version}</span>
                  <h2>{skill.name}</h2>
                </div>
                <p>{skill.description}</p>
                <div className="agent-skill-card__meta">
                  <span>{presentation.author}</span>
                  <span aria-hidden="true">·</span>
                  <span>{presentation.usage} 次使用</span>
                </div>
              </div>
              <div className="agent-skill-card__actions">
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
                <button
                  type="button"
                  aria-label={`使用${skill.name}`}
                  disabled={Boolean(runningSkillId)}
                  onClick={() => selectSkill(skill.id)}
                >
                  使用
                </button>
              </div>
            </article>
          )
        })}
      </section>
      {visibleSkills.length === 0 ? (
        <div className="agent-catalog-empty" role="status">
          <strong>没有匹配的 Skill</strong>
          <span>换一个分类或搜索关键词试试。</span>
        </div>
      ) : null}

      <section id="workspace-bridge" className="agent-cli-status" role="region" aria-labelledby="agent-cli-heading">
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
