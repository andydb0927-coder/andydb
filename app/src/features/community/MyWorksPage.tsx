import { Bookmark, Eye, Heart } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
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
import {
  CommunityRepository,
  type CommunityWorkRepository,
} from './community-repository'
import {
  deriveWorkCover,
  type PublishedWork,
} from './community-model'

type MyCommunityRepository = Pick<
  CommunityWorkRepository,
  'listMine' | 'publish' | 'setStatus'
>
type MyTimelineRepository = Pick<TimelineRepository, 'list'>
type MyProjectRepository = Pick<ProjectRepository, 'load'>

export interface MyWorksPageProps {
  communityRepository?: MyCommunityRepository
  timelineRepository?: MyTimelineRepository
  projectRepository?: MyProjectRepository
}

interface MyWorkEntry {
  project: Project
  timeline: TimelineProject
  work?: PublishedWork
}

interface WorkDraft {
  title: string
  author: string
  tags: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; entries: MyWorkEntry[] }
  | { status: 'error' }

const defaultDatabase = new WirelessCanvasDatabase()
const defaultCommunityRepository = new CommunityRepository(defaultDatabase)
const defaultTimelineRepository = new TimelineRepository(defaultDatabase)
const defaultProjectRepository = new ProjectRepository(defaultDatabase)

function readableDuration(seconds: number) {
  const rounded = Math.round(seconds)
  return rounded < 60
    ? `${rounded} 秒`
    : `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}

export function MyWorksPage({
  communityRepository = defaultCommunityRepository,
  timelineRepository = defaultTimelineRepository,
  projectRepository = defaultProjectRepository,
}: MyWorksPageProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [drafts, setDrafts] = useState<Record<string, WorkDraft>>({})
  const [busyProjectId, setBusyProjectId] = useState<string>()
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([timelineRepository.list(), communityRepository.listMine()])
      .then(async ([timelines, works]) => {
        const worksByProject = new Map(works.map((work) => [work.projectId, work]))
        const loaded = await Promise.all(
          timelines.map(async (timeline) => ({
            timeline,
            project: await projectRepository.load(timeline.projectId),
            work: worksByProject.get(timeline.projectId),
          })),
        )
        if (!active) return
        const entries = loaded.flatMap(({ project, timeline, work }) =>
          project ? [{ project, timeline, work }] : [],
        )
        setDrafts(
          Object.fromEntries(
            entries.map(({ project, work }) => [
              project.id,
              {
                title: work?.title ?? project.title,
                author: work?.author ?? '',
                tags: work?.tags.join(', ') ?? '',
              },
            ]),
          ),
        )
        setLoadState({ status: 'loaded', entries })
      })
      .catch(() => {
        if (active) setLoadState({ status: 'error' })
      })
    return () => {
      active = false
    }
  }, [communityRepository, projectRepository, timelineRepository])

  const replaceWork = (projectId: string, work: PublishedWork) => {
    setLoadState((current) =>
      current.status === 'loaded'
        ? {
            status: 'loaded',
            entries: current.entries.map((entry) =>
              entry.project.id === projectId ? { ...entry, work } : entry,
            ),
          }
        : current,
    )
  }

  const updateDraft = (
    projectId: string,
    field: keyof WorkDraft,
    value: string,
  ) => {
    setDrafts((current) => ({
      ...current,
      [projectId]: { ...current[projectId], [field]: value },
    }))
  }

  const publish = async (entry: MyWorkEntry, event: FormEvent) => {
    event.preventDefault()
    const draft = drafts[entry.project.id]
    if (!draft || !deriveWorkCover(entry.project, entry.timeline)) return
    setBusyProjectId(entry.project.id)
    setFeedback('')
    setError('')
    try {
      const work = await communityRepository.publish(entry.project, entry.timeline, {
        title: draft.title,
        author: draft.author,
        tags: draft.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
      })
      replaceWork(entry.project.id, work)
      setFeedback('作品已发布到本地作品墙。')
    } catch {
      setError('作品发布失败，请重试。')
    } finally {
      setBusyProjectId(undefined)
    }
  }

  const unlist = async (entry: MyWorkEntry) => {
    if (!entry.work) return
    setBusyProjectId(entry.project.id)
    setFeedback('')
    setError('')
    try {
      const work = await communityRepository.setStatus(entry.work.id, 'unlisted')
      if (work) replaceWork(entry.project.id, work)
      setFeedback('作品已下架，发布快照与数据仍保留在本地。')
    } catch {
      setError('作品状态无法更新，请重试。')
    } finally {
      setBusyProjectId(undefined)
    }
  }

  return (
    <main className="platform-page my-works-page">
      <header className="my-works-page__header">
        <div>
          <p className="platform-page__eyebrow">LOCAL PUBLISHING</p>
          <h1>我的作品</h1>
          <p>从已保存的专业时间线发布本地作品快照，并管理上下架与互动数据。</p>
        </div>
        <Link className="work-detail__back focus-visible" to="/discover">返回作品墙</Link>
      </header>

      {feedback ? <p className="my-works-page__feedback" role="status">{feedback}</p> : null}
      {error ? <p className="my-works-page__feedback my-works-page__feedback--error" role="alert">{error}</p> : null}
      {loadState.status === 'loading' ? <p className="platform-page__state" role="status">正在载入本地时间线…</p> : null}
      {loadState.status === 'error' ? <p className="platform-page__state" role="alert">本地时间线暂时无法载入。</p> : null}
      {loadState.status === 'loaded' && loadState.entries.length === 0 ? (
        <section className="platform-page__empty">
          <h2>还没有可发布的时间线</h2>
          <p>先在项目预览页保存专业时间线，再回到这里发布。</p>
        </section>
      ) : null}
      {loadState.status === 'loaded' && loadState.entries.length > 0 ? (
        <section className="my-works-list" aria-label="本地作品管理列表">
          {loadState.entries.map((entry) => {
            const draft = drafts[entry.project.id]
            const canPublish = Boolean(deriveWorkCover(entry.project, entry.timeline))
            const isPublished = entry.work?.status === 'published'
            const isUnlisted = entry.work?.status === 'unlisted'
            const busy = busyProjectId === entry.project.id
            return (
              <article key={entry.project.id} className="my-work-card" aria-label={entry.project.title}>
                <div className="my-work-card__summary">
                  <div>
                    <span className={`my-work-card__status my-work-card__status--${entry.work?.status ?? 'draft'}`}>
                      {isPublished ? '已发布' : isUnlisted ? '已下架' : '尚未发布'}
                    </span>
                    <h2>{entry.project.title}</h2>
                    <p><span>{readableDuration(getTimelineDuration(entry.timeline))}</span> · 更新时间 {entry.timeline.updatedAt.slice(0, 10)}</p>
                  </div>
                  {entry.work ? (
                    <div className="community-metrics my-work-card__metrics">
                      <span aria-label={`${entry.work.metrics.views} 次浏览`}><Eye aria-hidden="true" />{entry.work.metrics.views}</span>
                      <span aria-label={`${entry.work.metrics.likes} 次点赞`}><Heart aria-hidden="true" />{entry.work.metrics.likes}</span>
                      <span aria-label={`${entry.work.metrics.favorites} 次收藏`}><Bookmark aria-hidden="true" />{entry.work.metrics.favorites}</span>
                    </div>
                  ) : null}
                </div>

                {isPublished ? (
                  <div className="my-work-card__published-actions">
                    <Link to={`/discover/${entry.work?.id}`}>查看作品详情</Link>
                    <button className="ui-button launcher-button--secondary focus-visible" disabled={busy} type="button" onClick={() => void unlist(entry)}>
                      下架 {entry.project.title}
                    </button>
                  </div>
                ) : (
                  <form className="my-work-card__form" onSubmit={(event) => void publish(entry, event)}>
                    <label>
                      <span>作品标题</span>
                      <input aria-label={`作品标题 ${entry.project.title}`} value={draft?.title ?? ''} onChange={(event) => updateDraft(entry.project.id, 'title', event.target.value)} />
                    </label>
                    <label>
                      <span>作者</span>
                      <input aria-label={`作者 ${entry.project.title}`} value={draft?.author ?? ''} onChange={(event) => updateDraft(entry.project.id, 'author', event.target.value)} />
                    </label>
                    <label>
                      <span>标签</span>
                      <input aria-label={`标签 ${entry.project.title}`} placeholder="国风, 雨夜" value={draft?.tags ?? ''} onChange={(event) => updateDraft(entry.project.id, 'tags', event.target.value)} />
                    </label>
                    {!canPublish ? <p>时间线缺少可发布画面</p> : null}
                    <button className="ui-button focus-visible" disabled={!canPublish || busy} type="submit">
                      {isUnlisted ? '重新发布' : '发布'} {entry.project.title}
                    </button>
                  </form>
                )}
              </article>
            )
          })}
        </section>
      ) : null}
    </main>
  )
}
