import { ArrowLeft, Bookmark, Eye, Heart } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { WirelessCanvasDatabase } from '../project/project-repository'
import { PreviewPlayer } from '../timeline/PreviewPlayer'
import { resolveTimelineClips } from '../timeline/timeline-project'
import {
  CommunityRepository,
  type CommunityWorkRepository,
} from './community-repository'
import type { PublishedWork } from './community-model'
import { WorkCard } from './WorkCard'

type DetailRepository = Pick<
  CommunityWorkRepository,
  'get' | 'recordView' | 'toggleLike' | 'toggleFavorite' | 'listPublished'
>

export interface WorkDetailPageProps {
  repository?: DetailRepository
}

const defaultRepository = new CommunityRepository(new WirelessCanvasDatabase())

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; work: PublishedWork }
  | { status: 'unavailable' }

function recommendationsFor(
  work: PublishedWork,
  candidates: PublishedWork[],
): PublishedWork[] {
  const tags = new Set(work.tags)
  return candidates
    .filter((candidate) => candidate.id !== work.id && candidate.status === 'published')
    .map((candidate) => ({
      candidate,
      overlap: candidate.tags.filter((tag) => tags.has(tag)).length,
    }))
    .sort(
      (left, right) =>
        right.overlap - left.overlap ||
        right.candidate.publishedAt.localeCompare(left.candidate.publishedAt),
    )
    .slice(0, 3)
    .map(({ candidate }) => candidate)
}

export function WorkDetailPage({
  repository = defaultRepository,
}: WorkDetailPageProps) {
  const { workId } = useParams<{ workId: string }>()
  const [detail, setDetail] = useState<DetailState>({ status: 'loading' })
  const [recommendations, setRecommendations] = useState<PublishedWork[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [selectedClipId, setSelectedClipId] = useState<string>()
  const [interactionError, setInteractionError] = useState('')
  const viewedWorkIdRef = useRef<string | undefined>(undefined)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!workId) {
      setDetail({ status: 'unavailable' })
      return
    }
    let active = true
    setDetail({ status: 'loading' })
    void Promise.all([
      repository.get(workId),
      repository.listPublished({ query: '', tag: 'all', sort: 'latest' }),
    ])
      .then(([work, candidates]) => {
        if (!active) return
        if (!work || work.status !== 'published') {
          setDetail({ status: 'unavailable' })
          return
        }
        setDetail({ status: 'ready', work })
        setRecommendations(recommendationsFor(work, candidates))
        if (viewedWorkIdRef.current === workId) return
        viewedWorkIdRef.current = workId
        void repository
          .recordView(workId)
          .then((viewed) => {
            if (active && viewed) {
              setDetail({ status: 'ready', work: viewed })
            }
          })
          .catch(() => undefined)
      })
      .catch(() => {
        if (active) setDetail({ status: 'unavailable' })
      })
    return () => {
      active = false
    }
  }, [repository, workId])

  const work = detail.status === 'ready' ? detail.work : undefined
  const resolved = useMemo(
    () =>
      work
        ? resolveTimelineClips(work.timelineSnapshot, work.projectSnapshot)
        : undefined,
    [work],
  )

  const interact = async (
    action: 'like' | 'favorite',
  ) => {
    if (!work) return
    setInteractionError('')
    try {
      const next =
        action === 'like'
          ? await repository.toggleLike(work.id)
          : await repository.toggleFavorite(work.id)
      if (next) setDetail({ status: 'ready', work: next })
    } catch {
      setInteractionError('互动状态暂时无法保存，请重试。')
    }
  }

  if (detail.status === 'loading') {
    return <main className="platform-page"><p className="platform-page__state" role="status">正在载入作品…</p></main>
  }

  if (!work || !resolved) {
    return (
      <main className="platform-page">
        <section className="platform-page__empty">
          <h1>作品暂不可用</h1>
          <p>作品可能已经下架，或本地数据已被清理。</p>
          <Link to="/discover">返回作品墙</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="platform-page work-detail">
      <header className="work-detail__header">
        <Link className="work-detail__back focus-visible" to="/discover">
          <ArrowLeft aria-hidden="true" />返回作品墙
        </Link>
        <div>
          <p className="platform-page__eyebrow">PUBLISHED SNAPSHOT</p>
          <h1>{work.title}</h1>
          <p>由 {work.author} 发布 · 本地作品快照</p>
        </div>
      </header>

      <section className="work-detail__viewer">
        <PreviewPlayer
          timeline={work.timelineSnapshot}
          resolved={resolved}
          currentTime={currentTime}
          selectedClipId={selectedClipId}
          canvasRef={canvasRef}
          onCurrentTimeChange={setCurrentTime}
          onSelectedClipChange={setSelectedClipId}
        />
        <aside className="work-detail__info" aria-label="作品信息">
          <ul className="community-tags" aria-label="作品标签">
            {work.tags.map((tag) => <li key={tag}>{tag}</li>)}
          </ul>
          <span aria-label={`${work.metrics.views} 次浏览`} className="work-detail__views">
            <Eye aria-hidden="true" />{work.metrics.views} 次浏览
          </span>
          <div className="work-detail__actions">
            <button
              type="button"
              aria-pressed={work.viewer.liked}
              onClick={() => void interact('like')}
            >
              <Heart aria-hidden="true" />
              {work.viewer.liked ? '取消点赞' : '点赞'} {work.metrics.likes}
            </button>
            <button
              type="button"
              aria-pressed={work.viewer.favorited}
              onClick={() => void interact('favorite')}
            >
              <Bookmark aria-hidden="true" />
              {work.viewer.favorited ? '取消收藏' : '收藏'} {work.metrics.favorites}
            </button>
          </div>
          {interactionError ? <p role="alert">{interactionError}</p> : null}
        </aside>
      </section>

      {recommendations.length > 0 ? (
        <section className="work-detail__related" aria-label="相关推荐">
          <h2>相关推荐</h2>
          <div className="community-grid">
            {recommendations.map((candidate) => <WorkCard key={candidate.id} work={candidate} />)}
          </div>
        </section>
      ) : null}
    </main>
  )
}
