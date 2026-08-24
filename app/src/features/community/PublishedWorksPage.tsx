import { Eye, Heart, Image as ImageIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { WirelessCanvasDatabase } from '../project/project-repository'
import type { PublishedWork } from './community-model'
import { CommunityRepository, type CommunityWorkRepository } from './community-repository'

type WorksRepository = Pick<CommunityWorkRepository, 'listMine'>

const defaultRepository = new CommunityRepository(new WirelessCanvasDatabase())

export function PublishedWorksPage({ repository = defaultRepository }: { repository?: WorksRepository }) {
  const [works, setWorks] = useState<PublishedWork[]>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    void repository.listMine().then((items) => {
      if (active) setWorks(items.filter(({ status }) => status === 'published'))
    }).catch(() => {
      if (active) setFailed(true)
    })
    return () => { active = false }
  }, [repository])

  return (
    <main className="platform-page published-works-page">
      <header className="platform-page__header published-works-page__header">
        <div>
          <p className="platform-page__eyebrow">LOCAL WORKS</p>
          <h1>作品</h1>
          <p>这里展示保存在当前浏览器中的已发布作品。</p>
        </div>
      </header>
      {failed ? <p className="platform-page__state" role="alert">本地作品读取失败，请刷新后重试。</p> : null}
      {!failed && !works ? <p className="platform-page__state" role="status">正在读取本地作品…</p> : null}
      {works?.length === 0 ? (
        <section className="platform-page__empty">
          <ImageIcon aria-hidden="true" />
          <h2>还没有发布作品</h2>
          <p>进入任意画布，在“发布与分享”中完成一次本地发布。</p>
          <Link to="/projects">前往项目</Link>
        </section>
      ) : null}
      {works && works.length > 0 ? (
        <section className="published-works-grid" aria-label="已发布作品列表">
          {works.map((work) => (
            <article key={work.id} className="published-work-card" aria-label={work.title}>
              <Link to={`/view/${work.id}`} aria-label={`查看作品 ${work.title}`} className="published-work-card__cover focus-visible">
                <img src={work.coverUrl} alt="" />
                <span>本地发布</span>
              </Link>
              <div>
                <h2>{work.title}</h2>
                <p>{work.description || '暂无作品简介'}</p>
                <ul className="community-tags" aria-label={`${work.title} 标签`}>
                  {work.tags.map((tag) => <li key={tag}>{tag}</li>)}
                </ul>
                <div className="community-metrics">
                  <span aria-label={`${work.metrics.views} 次浏览`}><Eye aria-hidden="true" />{work.metrics.views}</span>
                  <span aria-label={`${work.metrics.likes} 次点赞`}><Heart aria-hidden="true" />{work.metrics.likes}</span>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  )
}
