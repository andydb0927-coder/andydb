import { describe, expect, test } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject } from '../timeline/timeline-project'
import { createPublishedWork, type PublishedWork } from './community-model'
import { buildDemoWorks } from './demo-works'
import { filterPortfolio, getWorkModels, getWorkVisibility, personalWorks, relatedWorks, summarizePortfolio } from './work-portfolio'

function work(id: string, title = id): PublishedWork {
  const project = makeProjectFixture()
  project.id = id
  project.jobs[0] = { ...project.jobs[0], modelName: 'Seedream 5.0 Pro', estimatedCost: 18 }
  return { ...createPublishedWork(project, createTimelineProject(project), { author: '小安', tags: ['国风'], title }), id }
}

describe('local work portfolio', () => {
  test('defaults legacy visibility to private and excludes built-in examples and unlisted works', () => {
    const a = work('a')
    expect(getWorkVisibility(a)).toBe('private')
    expect(personalWorks([a, { ...work('b'), status: 'unlisted' }, ...buildDemoWorks()])).toEqual([a])
  })
  test('uses recorded successful generation models, not failed or selected model names', () => {
    const a = work('a')
    a.projectSnapshot.jobs.push({ ...a.projectSnapshot.jobs[0], id: 'bad', status: 'failed', modelName: '失败模型' })
    expect(getWorkModels(a)).toEqual(['Seedream 5.0 Pro'])
  })
  test('combines query, model, favorite and visibility filters without mutating snapshots', () => {
    const a = { ...work('a', '薄雾古桥'), description: '清晨水墨', visibility: 'public' as const, viewer: { liked: false, favorited: true } }
    const list = [work('b', '雨巷'), a]
    expect(filterPortfolio(list, { query: '水墨', model: 'Seedream 5.0 Pro', visibility: 'public', favoritesOnly: true, sort: 'newest' })).toEqual([a])
    expect(filterPortfolio(list, { query: '', model: '全部', visibility: 'all', favoritesOnly: false, sort: 'title' }).map((w) => w.title)).toEqual(['薄雾古桥', '雨巷'])
    expect(list[0].id).toBe('b')
  })
  test('sorts by creation time rather than favorite updates, with deterministic ties', () => {
    const a = work('a')
    const b = work('b')
    b.projectSnapshot.createdAt = '2026-08-28T00:00:00Z'
    a.updatedAt = '2026-08-30T00:00:00Z'
    const filter = { query: '', model: '全部', visibility: 'all' as const, favoritesOnly: false, sort: 'newest' as const }
    expect(filterPortfolio([a, b], filter).map((w) => w.id)).toEqual(['b', 'a'])
    expect(filterPortfolio([a, b], { ...filter, sort: 'oldest' }).map((w) => w.id)).toEqual(['a', 'b'])
  })
  test('deduplicates snapshot jobs and prefers charged credits, never charges pending jobs as estimates', () => {
    const a = work('a')
    a.projectSnapshot.jobs[0].creditsSpent = 12
    a.projectSnapshot.jobs.push({ ...a.projectSnapshot.jobs[0], id: 'pending', status: 'running', creditsSpent: undefined })
    const b = work('b')
    const duplicate = { ...a, id: 'a-copy' }
    const summary = summarizePortfolio([a, duplicate, b, ...buildDemoWorks()])
    expect(summary).toMatchObject({ total: 3, estimatedCredits: 30, successfulJobs: 2, unknownCostJobs: 0, models: [{ name: 'Seedream 5.0 Pro', count: 2 }] })
    b.projectSnapshot.jobs[0].estimatedCost = undefined
    expect(summarizePortfolio([b]).unknownCostJobs).toBe(1)
  })
  test('recommends other personal published works by overlapping tags/models without padding', () => {
    const a = work('a')
    const b = work('b')
    const c = { ...work('c'), tags: [], projectSnapshot: { ...work('c').projectSnapshot, jobs: [] } }
    expect(relatedWorks(a, [a, c, b, ...buildDemoWorks()]).map((w) => w.id)).toEqual(['b', 'c'])
    expect(relatedWorks(a, [a])).toEqual([])
  })
})
