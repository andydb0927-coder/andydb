import { BadgeCheck, Bookmark, Eye, Heart } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { PublishedWork } from './community-model'

function readableDuration(seconds: number) {
  const rounded = Math.round(seconds)
  if (rounded < 60) return `${rounded} 秒`
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}

export function WorkCard({ work }: { work: PublishedWork }) {
  return (
    <article className="community-card" aria-label={work.title}>
      <Link className="community-card__cover focus-visible" aria-label={`查看作品 ${work.title}`} to={`/detail/${work.id}`}>
        <img src={work.coverUrl} alt={work.title} />
        <span>{readableDuration(work.durationSeconds)}</span>
      </Link>
      <div className="community-card__body">
        <div className="community-card__title">
          <h2>{work.title}</h2>
          <span className="community-card__creator">
            {work.author}
            {work.authorVerified ? (
              <BadgeCheck aria-label={`${work.author} 已认证`} />
            ) : null}
          </span>
        </div>
        <ul className="community-tags" aria-label={`${work.title} 标签`}>
          {work.tags.map((tag) => <li key={tag}>{tag}</li>)}
        </ul>
        <div className="community-metrics">
          <span aria-label={`${work.metrics.views} 次浏览`}><Eye aria-hidden="true" />{work.metrics.views} 播放</span>
          <span aria-label={`${work.metrics.likes} 次点赞`}><Heart aria-hidden="true" />{work.metrics.likes}</span>
          <span aria-label={`${work.metrics.favorites} 次收藏`}><Bookmark aria-hidden="true" />{work.metrics.favorites}</span>
        </div>
        <Link
          className="community-card__process focus-visible"
          to={`/detail/${work.id}/process`}
          aria-label={`查看 ${work.title} 的创作过程`}
        >
          查看创作过程
        </Link>
      </div>
    </article>
  )
}
