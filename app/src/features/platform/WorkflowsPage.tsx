import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type { Project } from '../project/model'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import {
  RECIPE_QUERY_PARAM,
  recipeDefinitions,
} from '../project/recipe-catalog'
import {
  workflowProgress,
  type WorkflowRun,
  type WorkflowStatus,
} from '../workflow/workflow-model'
import { WorkflowRepository } from '../workflow/workflow-repository'

type WorkflowFilter = 'all' | 'active' | 'failed' | 'succeeded'

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; projects: Project[]; runs: WorkflowRun[] }
  | { status: 'error' }

export interface WorkflowsPageProps {
  projectRepository?: Pick<ProjectRepository, 'listAll'>
  workflowRepository?: Pick<WorkflowRepository, 'listAll'>
}

const defaultDatabase = new WirelessCanvasDatabase()
const defaultProjectRepository = new ProjectRepository(defaultDatabase)
const defaultWorkflowRepository = new WorkflowRepository(defaultDatabase)

const workflowSteps = [
  { label: '角色参考', field: 'characterPrompt' as const },
  { label: '场景设定', field: 'scenePrompt' as const },
  { label: '首个分镜', field: 'storyboardPrompt' as const },
]

const statusCopy: Record<WorkflowStatus, string> = {
  pending: '等待中',
  running: '运行中',
  succeeded: '已成功',
  failed: '已失败',
  cancelled: '已取消',
}

const filters: Array<{ value: WorkflowFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '运行中' },
  { value: 'failed', label: '失败' },
  { value: 'succeeded', label: '已成功' },
]

function matchesFilter(run: WorkflowRun, filter: WorkflowFilter) {
  if (filter === 'all') return true
  if (filter === 'active') return run.status === 'pending' || run.status === 'running'
  return run.status === filter
}

export function WorkflowsPage({
  projectRepository = defaultProjectRepository,
  workflowRepository = defaultWorkflowRepository,
}: WorkflowsPageProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [filter, setFilter] = useState<WorkflowFilter>('all')

  useEffect(() => {
    let active = true
    setLoadState({ status: 'loading' })
    void Promise.all([
      projectRepository.listAll(),
      workflowRepository.listAll(),
    ]).then(
      ([projects, runs]) => {
        if (active) setLoadState({ status: 'loaded', projects, runs })
      },
      () => {
        if (active) setLoadState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [projectRepository, workflowRepository])

  const visibleRuns = useMemo(
    () => loadState.status === 'loaded'
      ? loadState.runs.filter((run) => matchesFilter(run, filter))
      : [],
    [filter, loadState],
  )
  const projectTitles = useMemo(
    () => new Map(
      loadState.status === 'loaded'
        ? loadState.projects.map((project) => [project.id, project.title])
        : [],
    ),
    [loadState],
  )

  return (
    <main className="platform-page workflow-center-page">
      <header className="platform-page__header">
        <p className="platform-page__eyebrow">WORKFLOW OPERATIONS</p>
        <h1>工作流与模板</h1>
        <p>预览任务图、启动创作配方，并跨项目查看本地运行。</p>
      </header>

      <section className="platform-page__body" aria-labelledby="workflow-recipes-title">
        <header className="platform-section__heading">
          <div>
            <p className="platform-page__eyebrow">TEMPLATES</p>
            <h2 id="workflow-recipes-title">可用创作配方</h2>
          </div>
        </header>
        <div className="platform-card-grid workflow-template-grid">
          {recipeDefinitions.map((recipe) => (
            <article className="platform-card workflow-template-card" key={recipe.id}>
              <p>创作配方</p>
              <h3>{recipe.title}</h3>
              <p>{recipe.description}</p>
              <ol aria-label={`${recipe.title}任务图`} className="workflow-template-card__graph">
                {workflowSteps.map((step) => (
                  <li key={step.field}>
                    <strong>{step.label}</strong>
                    <span>{recipe[step.field]}</span>
                  </li>
                ))}
              </ol>
              <Link to={`/projects/new?${RECIPE_QUERY_PARAM}=${recipe.id}`}>
                使用{recipe.title}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="platform-page__body workflow-operations" aria-labelledby="workflow-runs-title">
        <header className="platform-section__heading workflow-operations__heading">
          <div>
            <p className="platform-page__eyebrow">RUN HISTORY</p>
            <h2 id="workflow-runs-title">运行中心</h2>
          </div>
          {loadState.status === 'loaded' ? <strong>{loadState.runs.length} 条运行</strong> : null}
        </header>

        {loadState.status === 'loading' ? (
          <p className="platform-page__state" role="status">正在读取运行记录</p>
        ) : null}
        {loadState.status === 'error' ? (
          <div className="platform-page__empty" role="alert">
            <h3>无法读取运行记录</h3>
            <p>本地工作流数据暂时不可用，请稍后重试。</p>
          </div>
        ) : null}
        {loadState.status === 'loaded' ? (
          <>
            <fieldset className="workflow-operations__filters">
              <legend>运行状态</legend>
              {filters.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="workflow-filter"
                    checked={filter === option.value}
                    onChange={() => setFilter(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
            {loadState.runs.length === 0 ? (
              <p className="platform-section__empty">暂无运行记录</p>
            ) : visibleRuns.length === 0 ? (
              <p className="platform-section__empty">没有匹配的运行</p>
            ) : (
              <div className="workflow-operations__list">
                {visibleRuns.map((run) => (
                  <article aria-label={`运行 ${run.id}`} className="workflow-operation-card" key={run.id}>
                    <header>
                      <div>
                        <strong>{projectTitles.get(run.projectId) ?? '未知项目'}</strong>
                        <span>{statusCopy[run.status]}</span>
                      </div>
                      <time dateTime={run.updatedAt}>
                        {new Date(run.updatedAt).toLocaleString('zh-CN', { hour12: false })}
                      </time>
                    </header>
                    <p>{run.mode === 'serial' ? '串行' : '并行'} · {run.nodes.length} 个节点</p>
                    <progress aria-label={`${run.id}总进度`} value={workflowProgress(run)} max={100} />
                    <span>{workflowProgress(run)}%</span>
                    <Link to={`/project/${run.projectId}`}>打开项目处理运行</Link>
                  </article>
                ))}
              </div>
            )}
          </>
        ) : null}
      </section>
    </main>
  )
}
