import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { WirelessCanvasDatabase } from '../project/project-repository'
import type { PublishedWork } from './community-model'
import { CommunityRepository, type CommunityWorkRepository } from './community-repository'
import { WorkPortfolioCard } from './WorkPortfolioCard'
import { WorkLocalActions } from './WorkLocalActions'
import { WorkShareActions } from './WorkShareActions'
import { formatWorkDate, getWorkModels, relatedWorks, workCreatedAt } from './work-portfolio'

type ViewRepository = Pick<CommunityWorkRepository, 'get' | 'listMine' | 'toggleFavorite' | 'setVisibility'>
const defaultRepository = new CommunityRepository(new WirelessCanvasDatabase())

export function PublishedWorkViewPage({ repository = defaultRepository }: { repository?: ViewRepository }) {
  const { workId } = useParams<{ workId: string }>()
  const [detail, setDetail] = useState<{ id?: string; work?: PublishedWork | null; failed?: boolean }>({})
  const [candidates, setCandidates] = useState<PublishedWork[]>([])
  const [relatedFailed, setRelatedFailed] = useState(false)

  useEffect(() => {
    let active = true
    setDetail({ id: workId })
    setCandidates([])
    setRelatedFailed(false)
    if (!workId) {
      setDetail({ id: workId, work: null })
      return
    }
    void repository.get(workId).then((result) => {
      if (active) setDetail({ id: workId, work: result?.status === 'published' ? result : null })
    }).catch(() => {
      if (active) setDetail({ id: workId, work: null, failed: true })
    })
    void repository.listMine().then((items) => {
      if (active) setCandidates(items)
    }).catch(() => { if (active) setRelatedFailed(true) })
    return () => { active = false }
  }, [repository, workId])

  const work = detail.id === workId ? detail.work : undefined
  if (work === undefined) {
    return <main className="published-work-view"><p role="status">正在读取本地作品…</p></main>
  }
  if (work === null) {
    return (
      <main className="published-work-view published-work-view--empty">
        <h1>{detail.failed ? '作品读取失败' : '作品暂不可用'}</h1>
        <p role={detail.failed ? 'alert' : undefined}>{detail.failed ? '本地作品读取失败，请刷新后重试。' : '分享链接仅能在保存过该作品的浏览器中打开。'}</p>
        <Link to="/works">返回作品页</Link>
      </main>
    )
  }

  return (
    <main className="published-work-view">
      <header>
        <Link to="/works"><ArrowLeft aria-hidden="true" />返回作品</Link>
        <span><LockKeyhole aria-hidden="true" />只读作品</span>
      </header>
      <section className="published-work-view__hero">
        <img src={work.coverUrl} alt={`${work.title}封面`} />
        <div>
          <p>LOCAL DEMO</p>
          <h1>{work.title}</h1>
          <p>{work.description || '暂无作品简介'}</p>
          <ul className="community-tags" aria-label="作品标签">{work.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
        </div>
      </section>
      <section className="published-work-view__creator" aria-label="创建者信息">
        <div><h2>创建者</h2><strong>{work.author}</strong><p>本地创作者资料 · 非云端账号认证</p></div>
        <div><time dateTime={workCreatedAt(work)}>创作于 {formatWorkDate(workCreatedAt(work))}</time><p>发布于 {formatWorkDate(work.publishedAt)}</p>
          <ul className="community-tags" aria-label="作品模型">{(getWorkModels(work).length ? getWorkModels(work) : ['未记录模型']).map((model) => <li key={model}>{model}</li>)}</ul>
        </div>
        <WorkLocalActions key={work.id} work={work} repository={repository} onChange={(next) => setDetail({ id: next.id, work: next })} />
        <p>仅当前浏览器有效，不会上传云端，也不提供访问权限控制。</p>
      </section>
      <WorkShareActions key={work.id} work={work} />
      <section className="published-work-view__snapshot" aria-labelledby="published-canvas-title">
        <div>
          <p>CANVAS SNAPSHOT</p>
          <h2 id="published-canvas-title">画布快照</h2>
          <span>发布时冻结 · 只读</span>
        </div>
        <img src={work.canvasSnapshotUrl || work.coverUrl} alt={`${work.title}画布快照`} />
      </section>
      <section className="published-work-view__related" aria-label="相关作品">
        <h2>相关作品</h2>
        {relatedFailed ? <p role="alert">相关作品读取失败，请刷新重试。</p> : relatedWorks(work, candidates).length ? (
          <div className="published-works-grid">{relatedWorks(work, candidates).map((candidate) => <WorkPortfolioCard key={candidate.id} work={candidate} />)}</div>
        ) : <p>暂无其他作品，发布更多作品后会在这里展示。</p>}
      </section>
      <p className="published-work-view__notice">本地演示，未发布到云端</p>
    </main>
  )
}
