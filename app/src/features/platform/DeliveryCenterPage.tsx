import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type { PublishedWork } from '../community/community-model'
import { CommunityRepository } from '../community/community-repository'
import type { JobStatus, Project } from '../project/model'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import type { TimelineProject } from '../timeline/timeline-project'
import { TimelineRepository } from '../timeline/timeline-repository'

type DeliveryFilter = 'all' | 'published' | 'awaiting'

type LoadState =
  | { status: 'loading' }
  | {
      status: 'loaded'
      projects: Project[]
      timelines: TimelineProject[]
      works: PublishedWork[]
    }
  | { status: 'error' }

export interface DeliveryCenterPageProps {
  projectRepository?: Pick<ProjectRepository, 'listAll'>
  timelineRepository?: Pick<TimelineRepository, 'list'>
  communityRepository?: Pick<CommunityRepository, 'listMine'>
  copyText?: (value: string) => Promise<void>
}

const defaultDatabase = new WirelessCanvasDatabase()
const defaultProjectRepository = new ProjectRepository(defaultDatabase)
const defaultTimelineRepository = new TimelineRepository(defaultDatabase)
const defaultCommunityRepository = new CommunityRepository(defaultDatabase)

const filters: Array<{ value: DeliveryFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'published', label: '已发布' },
  { value: 'awaiting', label: '待发布' },
]

const exportStatusCopy: Record<JobStatus, string> = {
  queued: '等待中',
  running: '导出中',
  succeeded: '已完成',
  failed: '已失败',
  cancelled: '已取消',
}

function latestExport(project: Project) {
  return [...project.exportJobs].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      right.createdAt.localeCompare(left.createdAt) ||
      right.id.localeCompare(left.id),
  )[0]
}

async function writeClipboard(value: string) {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
  await navigator.clipboard.writeText(value)
}

export function DeliveryCenterPage({
  projectRepository = defaultProjectRepository,
  timelineRepository = defaultTimelineRepository,
  communityRepository = defaultCommunityRepository,
  copyText = writeClipboard,
}: DeliveryCenterPageProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<DeliveryFilter>('all')
  const [feedback, setFeedback] = useState<{ kind: 'status' | 'alert'; text: string }>()

  useEffect(() => {
    let active = true
    void Promise.all([
      projectRepository.listAll(),
      timelineRepository.list(),
      communityRepository.listMine(),
    ]).then(
      ([projects, timelines, works]) => {
        if (active) setLoadState({ status: 'loaded', projects, timelines, works })
      },
      () => {
        if (active) setLoadState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [communityRepository, projectRepository, timelineRepository])

  const timelineIds = useMemo(
    () => new Set(
      loadState.status === 'loaded'
        ? loadState.timelines.map(({ projectId }) => projectId)
        : [],
    ),
    [loadState],
  )
  const workByProject = useMemo(
    () => new Map(
      loadState.status === 'loaded'
        ? loadState.works.map((work) => [work.projectId, work])
        : [],
    ),
    [loadState],
  )
  const visibleProjects = useMemo(() => {
    if (loadState.status !== 'loaded') return []
    const normalized = query.trim().toLocaleLowerCase()
    return loadState.projects.filter((project) => {
      const published = workByProject.get(project.id)?.status === 'published'
      if (filter === 'published' && !published) return false
      if (filter === 'awaiting' && published) return false
      return !normalized || [project.title, project.intent]
        .some((value) => value.toLocaleLowerCase().includes(normalized))
    })
  }, [filter, loadState, query, workByProject])

  const copyShareLink = async (work: PublishedWork) => {
    setFeedback(undefined)
    try {
      await copyText(new URL(`/discover/${work.id}`, window.location.origin).toString())
      setFeedback({ kind: 'status', text: '已复制本地分享链接' })
    } catch {
      setFeedback({ kind: 'alert', text: '无法复制本地分享链接' })
    }
  }

  return (
    <main className="platform-page delivery-center-page">
      <header className="platform-page__header delivery-center-page__header editor-projects-page__header">
        <div>
          <p className="platform-page__eyebrow">DELIVERY CENTER</p>
          <h1>交付与发布</h1>
          <p>统一查看剪辑、导出、发布与本地分享状态。</p>
        </div>
        <Link to="/discover/mine">管理发布</Link>
      </header>

      {feedback ? <p role={feedback.kind}>{feedback.text}</p> : null}
      {loadState.status === 'loading' ? (
        <p className="platform-page__state" role="status">正在读取交付记录</p>
      ) : null}
      {loadState.status === 'error' ? (
        <section className="platform-page__empty" role="alert">
          <h2>无法读取交付与发布记录</h2>
          <p>本地项目记录暂时不可用。</p>
        </section>
      ) : null}
      {loadState.status === 'loaded' && loadState.projects.length === 0 ? (
        <section className="platform-page__empty">
          <h2>尚无可交付项目</h2>
          <Link to="/">创建项目</Link>
        </section>
      ) : null}
      {loadState.status === 'loaded' && loadState.projects.length > 0 ? (
        <div className="platform-page__body">
          <section className="delivery-center-page__controls editor-projects-page__controls" aria-label="交付项目筛选">
            <label>
              <span>搜索交付项目</span>
              <input
                aria-label="搜索交付项目"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </label>
            <fieldset>
              <legend>发布状态</legend>
              {filters.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="delivery-filter"
                    checked={filter === option.value}
                    onChange={() => setFilter(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
          </section>

          {visibleProjects.length === 0 ? (
            <p className="platform-section__empty">没有匹配的交付项目</p>
          ) : (
            <section className="delivery-center-page__grid editor-projects-page__grid" aria-label="交付项目目录">
              {visibleProjects.map((project) => {
                const exportJob = latestExport(project)
                const work = workByProject.get(project.id)
                const published = work?.status === 'published'
                return (
                  <article aria-label={project.title} className="delivery-project-card editor-project-card" key={project.id}>
                    <h2>{project.title}</h2>
                    <p>{project.intent || '尚未填写创作意图'}</p>
                    <dl>
                      <div><dt>剪辑</dt><dd>{timelineIds.has(project.id) ? '已剪辑' : '待剪辑'}</dd></div>
                      <div><dt>导出</dt><dd>{exportJob ? exportStatusCopy[exportJob.status] : '尚无导出任务'}</dd></div>
                      <div><dt>发布</dt><dd>{published ? '已发布' : work?.status === 'unlisted' ? '已下架' : '待发布'}</dd></div>
                    </dl>
                    <div className="delivery-project-card__actions">
                      <Link
                        aria-label={`打开剪辑与导出 ${project.title}`}
                        to={`/project/${project.id}/preview`}
                      >
                        打开剪辑与导出
                      </Link>
                      {published && work ? (
                        <>
                          <Link to={`/discover/${work.id}`}>查看作品</Link>
                          <button type="button" onClick={() => void copyShareLink(work)}>
                            复制本地分享链接
                          </button>
                        </>
                      ) : null}
                    </div>
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
