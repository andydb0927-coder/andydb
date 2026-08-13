import { ArrowLeft, BadgeCheck, Bookmark, Eye, Heart } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { WirelessCanvasDatabase } from '../project/project-repository'
import {
  CommunityRepository,
  type CommunityWorkRepository,
} from './community-repository'
import type { PublishedWork } from './community-model'
import { WorkCard } from './WorkCard'

type CreatorRepository = Pick<CommunityWorkRepository, 'listPublished'>

export interface CreatorProfilePageProps {
  repository?: CreatorRepository
}

type ProfileState =
  | { status: 'loading' }
  | { status: 'ready'; works: PublishedWork[] }
  | { status: 'unavailable' }
  | { status: 'error' }

const defaultRepository = new CommunityRepository(new WirelessCanvasDatabase())

function popularTags(works: PublishedWork[]): string[] {
  const counts = new Map<string, number>()
  for (const work of works) {
    for (const tag of work.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts]
    .sort(([leftTag, leftCount], [rightTag, rightCount]) =>
      rightCount - leftCount || leftTag.localeCompare(rightTag, 'zh-CN'),
    )
    .slice(0, 8)
    .map(([tag]) => tag)
}

export function CreatorProfilePage({
  repository = defaultRepository,
}: CreatorProfilePageProps) {
  const { author } = useParams<{ author: string }>()
  const [profile, setProfile] = useState<ProfileState>({ status: 'loading' })

  useEffect(() => {
    if (!author) {
      setProfile({ status: 'unavailable' })
      return
    }
    let active = true
    setProfile({ status: 'loading' })
    void repository
      .listPublished({ query: '', tag: 'all', sort: 'latest' })
      .then((works) => {
        if (!active) return
        const matches = works.filter(
          (work) => work.status === 'published' && work.author === author,
        )
        setProfile(
          matches.length > 0
            ? { status: 'ready', works: matches }
            : { status: 'unavailable' },
        )
      })
      .catch(() => {
        if (active) setProfile({ status: 'error' })
      })
    return () => {
      active = false
    }
  }, [author, repository])

  const summary = useMemo(() => {
    const works = profile.status === 'ready' ? profile.works : []
    return {
      verified: works.some(({ authorVerified }) => authorVerified),
      views: works.reduce((total, work) => total + work.metrics.views, 0),
      likes: works.reduce((total, work) => total + work.metrics.likes, 0),
      favorites: works.reduce((total, work) => total + work.metrics.favorites, 0),
      tags: popularTags(works),
    }
  }, [profile])

  if (profile.status === 'loading') {
    return <main className="platform-page"><p className="platform-page__state" role="status">正在载入创作者主页…</p></main>
  }

  if (profile.status === 'error') {
    return <main className="platform-page"><p className="platform-page__state" role="alert">无法读取创作者主页。</p></main>
  }

  if (profile.status === 'unavailable' || !author) {
    return (
      <main className="platform-page">
        <section className="platform-page__empty">
          <h1>创作者暂不可用</h1>
          <p>该创作者还没有可见的本地发布作品。</p>
          <Link to="/discover">返回作品墙</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="platform-page creator-profile">
      <header className="creator-profile__header">
        <Link className="work-detail__back focus-visible" to="/discover">
          <ArrowLeft aria-hidden="true" />返回作品墙
        </Link>
        <div className="creator-profile__identity">
          <p className="platform-page__eyebrow">CREATOR PROFILE</p>
          <div className="creator-profile__title">
            <h1>{author}</h1>
            {summary.verified ? <BadgeCheck aria-label={`${author} 已认证`} /> : null}
          </div>
          <p><span>{profile.works.length} 件作品</span> · 本地发布档案</p>
        </div>
      </header>

      <dl className="creator-profile__metrics" aria-label="创作者数据">
        <div><dt><Eye aria-hidden="true" />总浏览</dt><dd>{summary.views} 次浏览</dd></div>
        <div><dt><Heart aria-hidden="true" />总点赞</dt><dd>{summary.likes} 次点赞</dd></div>
        <div><dt><Bookmark aria-hidden="true" />总收藏</dt><dd>{summary.favorites} 次收藏</dd></div>
      </dl>

      {summary.tags.length > 0 ? (
        <ul className="community-tags creator-profile__tags" aria-label={`${author}常用标签`}>
          {summary.tags.map((tag) => <li key={tag}>{tag}</li>)}
        </ul>
      ) : null}

      <section className="creator-profile__works" aria-label={`${author}的作品`}>
        <h2>已发布作品</h2>
        <div className="community-grid">
          {profile.works.map((work) => <WorkCard key={work.id} work={work} />)}
        </div>
      </section>
    </main>
  )
}
