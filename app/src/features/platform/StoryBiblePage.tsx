import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  creativeCardSummary,
  isCreativeCardKind,
} from '../project/creative-card'
import type {
  CanvasNode,
  CreativeCardKind,
  Project,
} from '../project/model'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'

type StoryKindFilter = 'all' | CreativeCardKind

interface StoryCardEntry {
  project: Project
  node: CanvasNode & { card: NonNullable<CanvasNode['card']> }
  summary: string
  imageUrl?: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; projects: Project[] }
  | { status: 'error' }

export interface StoryBiblePageProps {
  repository?: Pick<ProjectRepository, 'listAll'>
}

const defaultRepository = new ProjectRepository(new WirelessCanvasDatabase())

const filters: Array<{ value: StoryKindFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'script', label: '剧本' },
  { value: 'character-card', label: '角色' },
  { value: 'worldview', label: '世界观' },
]

const kindLabels: Record<CreativeCardKind, string> = {
  script: '剧本卡',
  'character-card': '角色卡',
  worldview: '世界观卡',
}

function collectStoryCards(projects: readonly Project[]): StoryCardEntry[] {
  return projects.flatMap((project) =>
    project.nodes.flatMap((node) => {
      if (
        !isCreativeCardKind(node.kind) ||
        !node.card ||
        node.card.kind !== node.kind
      ) return []
      const imageUrl = node.card.imageAssetId
        ? project.assets.find((asset) => asset.id === node.card?.imageAssetId)?.url
        : undefined
      return [{
        project,
        node: node as StoryCardEntry['node'],
        summary: creativeCardSummary(node.card),
        ...(imageUrl ? { imageUrl } : {}),
      }]
    }),
  )
}

export function StoryBiblePage({
  repository = defaultRepository,
}: StoryBiblePageProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [loadRevision, setLoadRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<StoryKindFilter>('all')

  useEffect(() => {
    let active = true
    setLoadState({ status: 'loading' })
    void repository.listAll().then(
      (projects) => {
        if (active) setLoadState({ status: 'loaded', projects })
      },
      () => {
        if (active) setLoadState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [loadRevision, repository])

  const projects = useMemo(
    () => loadState.status === 'loaded' ? loadState.projects : [],
    [loadState],
  )
  const cards = useMemo(() => collectStoryCards(projects), [projects])
  const visibleCards = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return cards.filter((entry) => {
      if (kindFilter !== 'all' && entry.node.kind !== kindFilter) return false
      if (!normalizedQuery) return true
      return [entry.node.title, entry.project.title, entry.summary]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
    })
  }, [cards, kindFilter, query])

  return (
    <main className="platform-page story-bible-page">
      <header className="platform-page__header story-bible-page__header">
        <div>
          <p className="platform-page__eyebrow">STORY BIBLE</p>
          <h1>故事设定</h1>
          <p>跨项目汇总剧本、角色与世界观卡，统一检查叙事设定。</p>
        </div>
        {loadState.status === 'loaded' ? (
          <strong>{cards.length} 张创作卡</strong>
        ) : null}
      </header>

      {loadState.status === 'loading' ? (
        <p className="platform-page__state" role="status">正在读取故事设定</p>
      ) : null}

      {loadState.status === 'error' ? (
        <section className="platform-page__empty" role="alert">
          <h2>无法读取故事设定</h2>
          <p>本地项目暂时不可用，请重试。</p>
          <button type="button" onClick={() => setLoadRevision((value) => value + 1)}>
            重试
          </button>
        </section>
      ) : null}

      {loadState.status === 'loaded' && projects.length === 0 ? (
        <section className="platform-page__empty">
          <h2>尚无项目</h2>
          <p>创建项目并在画布中添加结构化创作卡后，这里会自动汇总。</p>
          <Link to="/">创建项目</Link>
        </section>
      ) : null}

      {loadState.status === 'loaded' && projects.length > 0 ? (
        <div className="platform-page__body">
          <section className="story-bible-page__controls" aria-label="故事设定筛选">
            <label>
              <span>搜索故事设定</span>
              <input
                aria-label="搜索故事设定"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </label>
            <fieldset>
              <legend>创作卡类型</legend>
              {filters.map((filter) => (
                <label key={filter.value}>
                  <input
                    type="radio"
                    name="story-kind"
                    checked={kindFilter === filter.value}
                    onChange={() => setKindFilter(filter.value)}
                  />
                  <span>{filter.label}</span>
                </label>
              ))}
            </fieldset>
          </section>

          {cards.length === 0 ? (
            <section className="platform-page__empty">
              <h2>尚无结构化创作卡</h2>
              <p>请在任一项目画布中创建剧本卡、角色卡或世界观卡。</p>
              <Link to="/projects">打开项目空间</Link>
            </section>
          ) : visibleCards.length === 0 ? (
            <p className="platform-section__empty">没有匹配的故事设定</p>
          ) : (
            <section className="story-bible-page__grid" aria-label="创作卡目录">
              {visibleCards.map((entry) => (
                <article
                  aria-label={entry.node.title}
                  className="story-bible-card"
                  key={`${entry.project.id}:${entry.node.id}`}
                >
                  {entry.imageUrl ? (
                    <img
                      alt={`${entry.node.title}引用图片`}
                      src={entry.imageUrl}
                    />
                  ) : null}
                  <div className="story-bible-card__copy">
                    <div className="story-bible-card__meta">
                      <span>{kindLabels[entry.node.kind as CreativeCardKind]}</span>
                      <span>{entry.project.title}</span>
                    </div>
                    <h2>{entry.node.title}</h2>
                    <p>{entry.summary || '尚无可展示的结构化字段'}</p>
                    <Link to={`/project/${entry.project.id}?focus=${entry.node.id}`}>
                      在画布中查看 {entry.node.title}
                    </Link>
                  </div>
                </article>
              ))}
            </section>
          )}
        </div>
      ) : null}
    </main>
  )
}
