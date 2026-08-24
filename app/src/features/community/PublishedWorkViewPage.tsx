import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { WirelessCanvasDatabase } from '../project/project-repository'
import type { PublishedWork } from './community-model'
import { CommunityRepository, type CommunityWorkRepository } from './community-repository'

type ViewRepository = Pick<CommunityWorkRepository, 'get'>
const defaultRepository = new CommunityRepository(new WirelessCanvasDatabase())

export function PublishedWorkViewPage({ repository = defaultRepository }: { repository?: ViewRepository }) {
  const { workId } = useParams<{ workId: string }>()
  const [work, setWork] = useState<PublishedWork | null>()

  useEffect(() => {
    let active = true
    if (!workId) {
      setWork(null)
      return
    }
    void repository.get(workId).then((result) => {
      if (active) setWork(result?.status === 'published' ? result : null)
    }).catch(() => {
      if (active) setWork(null)
    })
    return () => { active = false }
  }, [repository, workId])

  if (work === undefined) {
    return <main className="published-work-view"><p role="status">正在读取本地作品…</p></main>
  }
  if (work === null) {
    return (
      <main className="published-work-view published-work-view--empty">
        <h1>作品暂不可用</h1>
        <p>分享链接仅能在保存过该作品的浏览器中打开。</p>
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
      <section className="published-work-view__snapshot" aria-labelledby="published-canvas-title">
        <div>
          <p>CANVAS SNAPSHOT</p>
          <h2 id="published-canvas-title">画布快照</h2>
          <span>发布时冻结 · 只读</span>
        </div>
        <img src={work.canvasSnapshotUrl || work.coverUrl} alt={`${work.title}画布快照`} />
      </section>
      <p className="published-work-view__notice">本地演示，未发布到云端</p>
    </main>
  )
}
