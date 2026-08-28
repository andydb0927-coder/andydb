import { Eye, Heart } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PublishedWork } from './community-model'
import { WorkLocalActions, type WorkSettingsRepository } from './WorkLocalActions'
import { formatWorkDate, getWorkModels, workCreatedAt } from './work-portfolio'

export function WorkPortfolioCard({ work, settings }: {
  work: PublishedWork
  settings?: { repository: WorkSettingsRepository; onChange(work: PublishedWork): void }
}) {
  const models = getWorkModels(work)
  return (
    <article className="published-work-card" aria-label={work.title}>
      <Link to={`/view/${work.id}`} aria-label={`查看作品 ${work.title}`} className="published-work-card__cover focus-visible">
        <img src={work.coverUrl} alt="" loading="lazy" />
        <span>本地发布</span>
      </Link>
      <div>
        <h2>{work.title}</h2>
        <p>{work.description || '暂无作品简介'}</p>
        <ul className="community-tags work-model-tags" aria-label={`${work.title} 模型标签`}>
          {(models.length ? models : ['未记录模型']).map((model) => <li key={model}>{model}</li>)}
        </ul>
        <ul className="community-tags" aria-label={`${work.title} 标签`}>{work.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
        <time dateTime={workCreatedAt(work)}>创作于 {formatWorkDate(workCreatedAt(work))}</time>
        <div className="community-metrics">
          <span aria-label={`${work.metrics.views} 次浏览`}><Eye aria-hidden="true" />{work.metrics.views}</span>
          <span aria-label={`${work.metrics.likes} 次点赞`}><Heart aria-hidden="true" />{work.metrics.likes}</span>
        </div>
        {settings ? <WorkLocalActions work={work} {...settings} /> : null}
      </div>
    </article>
  )
}
