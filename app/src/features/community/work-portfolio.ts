import type { GenerationJob } from '../project/model'
import type { PublishedWork, WorkVisibility } from './community-model'
import { isDemoWorkId } from './demo-works'

export interface PortfolioFilter {
  query: string
  model: string
  visibility: WorkVisibility | 'all'
  favoritesOnly: boolean
  sort: 'newest' | 'oldest' | 'title'
}

export function getWorkVisibility(work: PublishedWork): WorkVisibility {
  return work.visibility ?? 'private'
}

export function personalWorks(works: readonly PublishedWork[]) {
  return works.filter((work) => work.status === 'published' && !isDemoWorkId(work.id))
}

function jobModel(job: GenerationJob) {
  return job.modelName?.trim() || job.providerName?.trim() || job.providerId || '未记录模型'
}

export function getWorkModels(work: PublishedWork): string[] {
  return [...new Set(work.projectSnapshot.jobs.filter((job) => job.status === 'succeeded').map(jobModel))].sort()
}

export function workCreatedAt(work: PublishedWork) {
  return work.projectSnapshot.createdAt || work.publishedAt
}

export function formatWorkDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间未记录' : date.toLocaleDateString('zh-CN')
}

export function filterPortfolio(works: readonly PublishedWork[], filter: PortfolioFilter): PublishedWork[] {
  const query = filter.query.trim().toLocaleLowerCase()
  return personalWorks(works).filter((work) => {
    const models = getWorkModels(work)
    return (!filter.favoritesOnly || work.viewer.favorited) &&
      (filter.visibility === 'all' || getWorkVisibility(work) === filter.visibility) &&
      (filter.model === '全部' || models.includes(filter.model)) &&
      (!query || [work.title, work.description, work.author, ...work.tags, ...models].join(' ').toLocaleLowerCase().includes(query))
  }).sort((a, b) => {
    const order = filter.sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN') :
      workCreatedAt(a).localeCompare(workCreatedAt(b)) * (filter.sort === 'newest' ? -1 : 1)
    return order || a.id.localeCompare(b.id)
  })
}

export function relatedWorks(work: PublishedWork, candidates: readonly PublishedWork[]) {
  const ownTags = new Set([...work.tags, ...getWorkModels(work)])
  const score = (candidate: PublishedWork) => [...candidate.tags, ...getWorkModels(candidate)].filter((tag) => ownTags.has(tag)).length
  return personalWorks(candidates).filter((candidate) => candidate.id !== work.id)
    .sort((a, b) => score(b) - score(a) || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))
    .slice(0, 3)
}

function finiteCost(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** Count frozen successful jobs, not selected models, output image count or demo metrics. */
export function summarizePortfolio(works: readonly PublishedWork[]) {
  const personal = personalWorks(works)
  const projects = new Map<string, PublishedWork['projectSnapshot']>()
  for (const work of personal) {
    const project = work.projectSnapshot
    const previous = projects.get(project.id)
    if (!previous || previous.updatedAt < project.updatedAt) projects.set(project.id, project)
  }
  const models = new Map<string, number>()
  let estimatedCredits = 0
  let successfulJobs = 0
  let unknownCostJobs = 0
  for (const project of projects.values()) {
    const seen = new Set<string>()
    for (const job of project.jobs) {
      if (seen.has(job.id)) continue
      seen.add(job.id)
      if (job.status === 'succeeded') {
        successfulJobs++
        const model = jobModel(job)
        models.set(model, (models.get(model) ?? 0) + 1)
      }
      if (finiteCost(job.creditsSpent)) estimatedCredits += job.creditsSpent
      else if (job.status === 'succeeded') {
        if (finiteCost(job.estimatedCost)) estimatedCredits += job.estimatedCost
        else unknownCostJobs++
      }
    }
  }
  return {
    total: personal.length,
    favorites: personal.filter((work) => work.viewer.favorited).length,
    successfulJobs,
    estimatedCredits: Math.round(estimatedCredits * 100) / 100,
    unknownCostJobs,
    models: [...models].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  }
}
