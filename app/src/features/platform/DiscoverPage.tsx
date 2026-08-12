import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  CommunityRepository,
  type CommunityWorkRepository,
} from '../community/community-repository'
import {
  filterAndSortWorks,
  type PublishedWork,
  type WorkSort,
} from '../community/community-model'
import { WorkCard } from '../community/WorkCard'
import { WirelessCanvasDatabase } from '../project/project-repository'

type DiscoverRepository = Pick<
  CommunityWorkRepository,
  'ensureDemoWorks' | 'listPublished'
>

export interface DiscoverPageProps {
  repository?: DiscoverRepository
}

const defaultRepository = new CommunityRepository(new WirelessCanvasDatabase())

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; works: PublishedWork[] }
  | { status: 'error' }

export function DiscoverPage({
  repository = defaultRepository,
}: DiscoverPageProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('all')
  const [sort, setSort] = useState<WorkSort>('latest')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setLoadState({ status: 'loading' })
    void repository
      .ensureDemoWorks()
      .then(() =>
        repository.listPublished({ query: '', tag: 'all', sort: 'latest' }),
      )
      .then((works) => {
        if (active) setLoadState({ status: 'loaded', works })
      })
      .catch(() => {
        if (active) setLoadState({ status: 'error' })
      })
    return () => {
      active = false
    }
  }, [reload, repository])

  const works = loadState.status === 'loaded' ? loadState.works : []
  const tags = useMemo(
    () => [...new Set(works.flatMap((work) => work.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [works],
  )
  const visibleWorks = useMemo(
    () => filterAndSortWorks(works, { query, tag, sort }),
    [query, sort, tag, works],
  )

  return (
    <main className="platform-page community-page">
      <header className="platform-page__header community-page__header">
        <div>
          <p className="platform-page__eyebrow">LOCAL CREATOR SHOWCASE</p>
          <h1>发现与作品</h1>
          <p>浏览本地创作快照，所有作品与互动数据只保存在当前浏览器。</p>
        </div>
        <Link className="ui-button focus-visible" to="/discover/mine">
          管理我的作品
        </Link>
      </header>

      {loadState.status === 'loading' ? (
        <p className="platform-page__state" role="status">正在载入本地作品…</p>
      ) : null}
      {loadState.status === 'error' ? (
        <section className="community-page__error" role="alert">
          <p>作品暂时无法载入，请检查浏览器本地存储后重试。</p>
          <button className="ui-button focus-visible" type="button" onClick={() => setReload((value) => value + 1)}>
            重试
          </button>
        </section>
      ) : null}
      {loadState.status === 'loaded' ? (
        <>
          <section className="community-filters" aria-label="作品筛选">
            <label>
              <span>搜索作品</span>
              <input
                type="search"
                aria-label="搜索作品"
                placeholder="标题、作者或标签"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              <span>标签</span>
              <select
                aria-label="按标签筛选"
                value={tag}
                onChange={(event) => setTag(event.target.value)}
              >
                <option value="all">全部标签</option>
                {tags.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <fieldset>
              <legend>排序</legend>
              <label>
                <input type="radio" name="work-sort" value="latest" checked={sort === 'latest'} onChange={() => setSort('latest')} />
                最新
              </label>
              <label>
                <input type="radio" name="work-sort" value="hot" checked={sort === 'hot'} onChange={() => setSort('hot')} />
                最热
              </label>
            </fieldset>
          </section>

          {visibleWorks.length > 0 ? (
            <section className="community-grid" aria-label="作品墙">
              {visibleWorks.map((work) => <WorkCard key={work.id} work={work} />)}
            </section>
          ) : (
            <section className="platform-page__empty">
              <h2>没有匹配的作品</h2>
              <p>试试清空关键词或切换标签。</p>
            </section>
          )}
        </>
      ) : null}
    </main>
  )
}
