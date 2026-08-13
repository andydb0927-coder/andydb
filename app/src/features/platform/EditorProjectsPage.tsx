import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type { Project } from '../project/model'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import {
  getTimelineDuration,
  type TimelineProject,
} from '../timeline/timeline-project'
import { TimelineRepository } from '../timeline/timeline-repository'

type EditorFilter = 'all' | 'edited' | 'waiting'

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; projects: Project[]; timelines: TimelineProject[] }
  | { status: 'error' }

export interface EditorProjectsPageProps {
  projectRepository?: Pick<ProjectRepository, 'listAll'>
  timelineRepository?: Pick<TimelineRepository, 'list'>
}

const defaultDatabase = new WirelessCanvasDatabase()
const defaultProjectRepository = new ProjectRepository(defaultDatabase)
const defaultTimelineRepository = new TimelineRepository(defaultDatabase)

const filters: Array<{ value: EditorFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'edited', label: '已剪辑' },
  { value: 'waiting', label: '待剪辑' },
]

function legacyDuration(project: Project) {
  const totals = new Map<string, number>()
  for (const item of project.timeline) {
    totals.set(item.track, (totals.get(item.track) ?? 0) + item.durationSeconds)
  }
  return Math.max(0, ...totals.values())
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.round(seconds % 60)
  return minutes > 0 ? `${minutes} 分 ${remaining} 秒` : `${remaining} 秒`
}

export function EditorProjectsPage({
  projectRepository = defaultProjectRepository,
  timelineRepository = defaultTimelineRepository,
}: EditorProjectsPageProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<EditorFilter>('all')

  useEffect(() => {
    let active = true
    void Promise.all([
      projectRepository.listAll(),
      timelineRepository.list(),
    ]).then(
      ([projects, timelines]) => {
        if (active) setLoadState({ status: 'loaded', projects, timelines })
      },
      () => {
        if (active) setLoadState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [projectRepository, timelineRepository])

  const timelineByProject = useMemo(
    () => new Map(
      loadState.status === 'loaded'
        ? loadState.timelines.map((timeline) => [timeline.projectId, timeline])
        : [],
    ),
    [loadState],
  )
  const visibleProjects = useMemo(() => {
    if (loadState.status !== 'loaded') return []
    const normalized = query.trim().toLocaleLowerCase()
    return loadState.projects.filter((project) => {
      const edited = timelineByProject.has(project.id)
      if (filter === 'edited' && !edited) return false
      if (filter === 'waiting' && edited) return false
      return !normalized || [project.title, project.intent]
        .some((value) => value.toLocaleLowerCase().includes(normalized))
    })
  }, [filter, loadState, query, timelineByProject])

  return (
    <main className="platform-page editor-projects-page">
      <header className="platform-page__header editor-projects-page__header">
        <div>
          <p className="platform-page__eyebrow">PROFESSIONAL EDITOR</p>
          <h1>剪辑项目</h1>
          <p>查看已剪辑与待剪辑项目，统一进入多轨专业时间线。</p>
        </div>
        {loadState.status === 'loaded' ? <strong>{loadState.projects.length} 个项目</strong> : null}
      </header>

      {loadState.status === 'loading' ? (
        <p className="platform-page__state" role="status">正在读取剪辑项目</p>
      ) : null}
      {loadState.status === 'error' ? (
        <section className="platform-page__empty" role="alert">
          <h2>无法读取剪辑项目</h2>
          <p>本地项目或时间线暂时不可用。</p>
        </section>
      ) : null}
      {loadState.status === 'loaded' && loadState.projects.length === 0 ? (
        <section className="platform-page__empty">
          <h2>尚无可剪辑项目</h2>
          <Link to="/projects/new">创建项目</Link>
        </section>
      ) : null}
      {loadState.status === 'loaded' && loadState.projects.length > 0 ? (
        <div className="platform-page__body">
          <section className="editor-projects-page__controls" aria-label="剪辑项目筛选">
            <label>
              <span>搜索剪辑项目</span>
              <input
                type="search"
                aria-label="搜索剪辑项目"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </label>
            <fieldset>
              <legend>剪辑状态</legend>
              {filters.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="editor-filter"
                    checked={filter === option.value}
                    onChange={() => setFilter(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
          </section>

          {visibleProjects.length === 0 ? (
            <p className="platform-section__empty">没有匹配的剪辑项目</p>
          ) : (
            <section className="editor-projects-page__grid" aria-label="剪辑项目目录">
              {visibleProjects.map((project) => {
                const timeline = timelineByProject.get(project.id)
                const duration = timeline
                  ? getTimelineDuration(timeline)
                  : legacyDuration(project)
                const trackCount = timeline?.tracks.length ?? 0
                const clipCount = timeline?.tracks.reduce(
                  (total, track) => total + track.clips.length,
                  0,
                ) ?? project.timeline.length
                return (
                  <article aria-label={project.title} className="editor-project-card" key={project.id}>
                    <div className="editor-project-card__status">
                      <span>{timeline ? '已剪辑' : '待剪辑'}</span>
                      <time dateTime={timeline?.updatedAt ?? project.updatedAt}>
                        {new Date(timeline?.updatedAt ?? project.updatedAt).toLocaleDateString('zh-CN')}
                      </time>
                    </div>
                    <h2>{project.title}</h2>
                    <p>{project.intent || '尚未填写创作意图'}</p>
                    <dl>
                      <div><dt>时长</dt><dd>{formatDuration(duration)}</dd></div>
                      <div><dt>轨道</dt><dd>{trackCount} 条轨道</dd></div>
                      <div><dt>片段</dt><dd>{clipCount} 个片段</dd></div>
                    </dl>
                    <Link
                      aria-label={`${timeline ? '继续剪辑' : '开始剪辑'} ${project.title}`}
                      to={`/project/${project.id}/preview`}
                    >
                      {timeline ? '继续剪辑' : '开始剪辑'}
                    </Link>
                  </article>
                )
              })}
            </section>
          )}
        </div>
      ) : null}
    </main>
  )
}
