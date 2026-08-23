import { ArrowLeft, ArrowRight, Bookmark, Eye, Heart, Play, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'

import { WirelessCanvasDatabase } from '../project/project-repository'
import { PreviewPlayer } from '../timeline/PreviewPlayer'
import { resolveTimelineClips } from '../timeline/timeline-project'
import { CommunityRepository, type CommunityWorkRepository } from './community-repository'
import type { PublishedWork } from './community-model'

type DetailRepository = Pick<
  CommunityWorkRepository,
  'get' | 'recordView' | 'toggleLike' | 'toggleFavorite' | 'listPublished'
> & Partial<Pick<CommunityWorkRepository, 'ensureDemoWorks'>>

export interface WorkDetailPageProps {
  repository?: DetailRepository
}

const defaultRepository = new CommunityRepository(new WirelessCanvasDatabase())

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; work: PublishedWork }
  | { status: 'unavailable' }

function orderedRecommendations(work: PublishedWork, candidates: PublishedWork[]) {
  const tags = new Set(work.tags)
  return candidates
    .filter((candidate) => candidate.id !== work.id && candidate.status === 'published')
    .map((candidate) => ({
      candidate,
      overlap: candidate.tags.filter((tag) => tags.has(tag)).length,
    }))
    .sort((left, right) =>
      right.overlap - left.overlap ||
      right.candidate.publishedAt.localeCompare(left.candidate.publishedAt),
    )
    .map(({ candidate }) => candidate)
}

function elevenThumbnailStrip(work: PublishedWork, recommendations: PublishedWork[]) {
  const source = [work, ...recommendations]
  if (source.length === 0) return []
  return Array.from({ length: 11 }, (_, index) => source[index % source.length])
}

export function WorkDetailPage({ repository = defaultRepository }: WorkDetailPageProps) {
  const { workId } = useParams<{ workId: string }>()
  const [detail, setDetail] = useState<DetailState>({ status: 'loading' })
  const [recommendations, setRecommendations] = useState<PublishedWork[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [selectedClipId, setSelectedClipId] = useState<string>()
  const [interactionError, setInteractionError] = useState('')
  const viewedWorkIdRef = useRef<string | undefined>(undefined)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!workId) {
      setDetail({ status: 'unavailable' })
      return
    }
    let active = true
    setDetail({ status: 'loading' })
    setCurrentTime(0)
    setSelectedClipId(undefined)
    void Promise.resolve(repository.ensureDemoWorks?.()).then(() => Promise.all([
      repository.get(workId),
      repository.listPublished({ query: '', tag: 'all', sort: 'latest' }),
    ])).then(([work, candidates]) => {
      if (!active) return
      if (!work || work.status !== 'published') {
        setDetail({ status: 'unavailable' })
        return
      }
      setDetail({ status: 'ready', work })
      setRecommendations(orderedRecommendations(work, candidates))
      if (viewedWorkIdRef.current === workId) return
      viewedWorkIdRef.current = workId
      void repository.recordView(workId).then((viewed) => {
        if (active && viewed) setDetail({ status: 'ready', work: viewed })
      }).catch(() => undefined)
    }).catch(() => {
      if (active) setDetail({ status: 'unavailable' })
    })
    return () => { active = false }
  }, [repository, workId])

  const work = detail.status === 'ready' ? detail.work : undefined
  const resolved = useMemo(
    () => work ? resolveTimelineClips(work.timelineSnapshot, work.projectSnapshot) : undefined,
    [work],
  )
  const strip = useMemo(
    () => work ? elevenThumbnailStrip(work, recommendations) : [],
    [recommendations, work],
  )
  const previous = recommendations.at(-1)
  const next = recommendations[0]

  const interact = async (action: 'like' | 'favorite') => {
    if (!work) return
    setInteractionError('')
    try {
      const updated = action === 'like'
        ? await repository.toggleLike(work.id)
        : await repository.toggleFavorite(work.id)
      if (updated) setDetail({ status: 'ready', work: updated })
    } catch {
      setInteractionError('互动状态暂时无法保存，请重试。')
    }
  }

  if (detail.status === 'loading') {
    return <main className="work-immersive"><p className="platform-page__state" role="status">正在载入作品…</p></main>
  }

  if (!work || !resolved) {
    return (
      <main className="platform-page">
        <section className="platform-page__empty">
          <h1>作品暂不可用</h1>
          <p>作品可能已经下架，或本地数据已被清理。</p>
          <Link to="/">返回首页</Link>
        </section>
      </main>
    )
  }

  const backgroundStyle = { '--work-cover': `url("${work.coverUrl}")` } as CSSProperties

  return (
    <main className="work-immersive" style={backgroundStyle}>
      <div className="work-immersive__backdrop" aria-hidden="true" />
      <header className="work-immersive__header">
        <Link className="focus-visible" to="/"><ArrowLeft aria-hidden="true" />返回首页</Link>
        <div>
          <span className="work-immersive__ai"><Sparkles aria-hidden="true" />AI 生成作品</span>
          <h1>{work.title}</h1>
          <p>{work.author} · 更新于 {new Date(work.updatedAt).toLocaleDateString('zh-CN')}</p>
        </div>
        <Link className="work-immersive__process focus-visible" to={`/detail/${work.id}/process`}>查看制作过程</Link>
      </header>

      <section className="work-immersive__stage" aria-label="沉浸式作品播放区">
        {previous ? (
          <Link className="work-immersive__switch work-immersive__switch--previous focus-visible" aria-label="上一个作品" to={`/detail/${previous.id}`}>
            <ArrowLeft aria-hidden="true" /><span>{previous.title}</span>
          </Link>
        ) : null}
        <div ref={playerRef} className="work-immersive__player">
          <PreviewPlayer
            timeline={work.timelineSnapshot}
            resolved={resolved}
            currentTime={currentTime}
            selectedClipId={selectedClipId}
            canvasRef={canvasRef}
            onCurrentTimeChange={setCurrentTime}
            onSelectedClipChange={setSelectedClipId}
          />
          <button
            className="work-immersive__watch focus-visible"
            type="button"
            onClick={() => {
              setCurrentTime(0)
              const playButton = [...(playerRef.current?.querySelectorAll('button') ?? [])]
                .find((button) => button.textContent?.trim() === '播放')
              playButton?.click()
            }}
          >
            <Play aria-hidden="true" />立即观看
          </button>
        </div>
        {next ? (
          <Link className="work-immersive__switch work-immersive__switch--next focus-visible" aria-label="下一个作品" to={`/detail/${next.id}`}>
            <span>{next.title}</span><ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </section>

      <section className="work-immersive__meta" aria-label="作品信息">
        <ul className="community-tags" aria-label="作品标签">{work.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
        <p className="work-immersive__local-note">浏览、点赞与收藏仅保存在当前浏览器</p>
        <span aria-label={`${work.metrics.views} 次浏览`}><Eye aria-hidden="true" />{work.metrics.views} 次浏览</span>
        <button type="button" aria-pressed={work.viewer.liked} onClick={() => void interact('like')}>
          <Heart aria-hidden="true" />{work.viewer.liked ? '取消点赞' : '点赞'} {work.metrics.likes}
        </button>
        <button type="button" aria-pressed={work.viewer.favorited} onClick={() => void interact('favorite')}>
          <Bookmark aria-hidden="true" />{work.viewer.favorited ? '取消收藏' : '收藏'} {work.metrics.favorites}
        </button>
        {interactionError ? <p role="alert">{interactionError}</p> : null}
      </section>

      <section className="work-immersive__recommendations" aria-label="相关推荐" role="region">
        <div><p>KEEP WATCHING</p><h2>相关推荐</h2></div>
        <div className="work-immersive__strip">
          {strip.map((candidate, index) => (
            <Link
              key={`${candidate.id}-${index}`}
              className="work-immersive__thumbnail focus-visible"
              aria-label={`查看推荐作品 ${candidate.title}`}
              to={`/detail/${candidate.id}`}
              data-current={candidate.id === work.id}
            >
              <img src={candidate.coverUrl} alt={candidate.title} />
              <span>{String(index + 1).padStart(2, '0')}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
