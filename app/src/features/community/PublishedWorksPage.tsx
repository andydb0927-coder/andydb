import { Image as ImageIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { WirelessCanvasDatabase } from '../project/project-repository'
import type { PublishedWork } from './community-model'
import { CommunityRepository, type CommunityWorkRepository } from './community-repository'
import { filterPortfolio, getWorkModels, personalWorks, type PortfolioFilter } from './work-portfolio'
import { WorkPortfolioCard } from './WorkPortfolioCard'
import { WorkStatistics } from './WorkStatistics'

type WorksRepository = Pick<CommunityWorkRepository, 'listMine' | 'toggleFavorite' | 'setVisibility'>

const defaultRepository = new CommunityRepository(new WirelessCanvasDatabase())

export function PublishedWorksPage({ repository = defaultRepository }: { repository?: WorksRepository }) {
  const [works, setWorks] = useState<PublishedWork[]>()
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<PortfolioFilter>({ query: '', model: '全部', visibility: 'all', favoritesOnly: false, sort: 'newest' })

  useEffect(() => {
    let active = true
    setWorks(undefined)
    setFailed(false)
    void repository.listMine().then((items) => {
      if (active) setWorks(personalWorks(items))
    }).catch(() => {
      if (active) setFailed(true)
    })
    return () => { active = false }
  }, [repository])

  const models = useMemo(() => [...new Set((works ?? []).flatMap(getWorkModels))].sort(), [works])
  const visible = useMemo(() => filterPortfolio(works ?? [], filter), [works, filter])
  const updateWork = (next: PublishedWork) => setWorks((current) => current?.map((work) => work.id === next.id ? next : work))

  return (
    <main className="platform-page published-works-page">
      <header className="platform-page__header published-works-page__header">
        <div>
          <p className="platform-page__eyebrow">LOCAL WORKS</p>
          <h1>作品</h1>
          <p>这里展示保存在当前浏览器中的已发布作品。</p>
          <p>仅当前浏览器有效，不会上传云端，也不提供访问权限控制。</p>
        </div>
      </header>
      {failed ? <p className="platform-page__state" role="alert">本地作品读取失败，请刷新后重试。</p> : null}
      {!failed && !works ? <p className="platform-page__state" role="status">正在读取本地作品…</p> : null}
      {works ? <WorkStatistics works={works} /> : null}
      {works?.length === 0 ? (
        <section className="platform-page__empty">
          <ImageIcon aria-hidden="true" />
          <h2>还没有发布作品</h2>
          <p>进入任意画布，在“发布与分享”中完成一次本地发布。</p>
          <Link to="/projects">前往项目</Link>
        </section>
      ) : null}
      {works && works.length > 0 ? (
        <>
        <section className="work-portfolio-filters" aria-label="筛选作品">
          <label>搜索作品<input type="search" aria-label="搜索作品" placeholder="标题、摘要、标签或模型" value={filter.query} onChange={(event) => setFilter({ ...filter, query: event.target.value })} /></label>
          <label>模型<select aria-label="筛选模型" value={filter.model} onChange={(event) => setFilter({ ...filter, model: event.target.value })}><option>全部</option>{models.map((model) => <option key={model}>{model}</option>)}</select></label>
          <label>公开标记<select aria-label="筛选公开标记" value={filter.visibility} onChange={(event) => setFilter({ ...filter, visibility: event.target.value as PortfolioFilter['visibility'] })}><option value="all">全部状态</option><option value="public">公开 · 本地</option><option value="private">私密 · 本地</option></select></label>
          <label>排序<select aria-label="作品排序" value={filter.sort} onChange={(event) => setFilter({ ...filter, sort: event.target.value as PortfolioFilter['sort'] })}><option value="newest">最新创作</option><option value="oldest">最早创作</option><option value="title">标题排序</option></select></label>
          <label className="work-portfolio-filters__favorite"><input type="checkbox" checked={filter.favoritesOnly} onChange={(event) => setFilter({ ...filter, favoritesOnly: event.target.checked })} />只看收藏</label>
          <span role="status">显示 {visible.length} / {works.length} 个作品</span>
        </section>
        <section className="published-works-grid" aria-label="已发布作品列表">
          {visible.map((work) => <WorkPortfolioCard key={work.id} work={work} settings={{ repository, onChange: updateWork }} />)}
        </section>
        {visible.length === 0 ? <div className="platform-page__empty"><h2>没有匹配的作品</h2><p>调整搜索或筛选条件后重试。</p></div> : null}
        </>
      ) : null}
    </main>
  )
}
