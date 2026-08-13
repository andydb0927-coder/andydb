import type { WirelessCanvasDatabase } from '../project/project-repository'
import type { Project } from '../project/model'
import type { TimelineProject } from '../timeline/timeline-project'
import {
  createPublishedWork,
  filterAndSortWorks,
  recordWorkView,
  setWorkStatus as updateWorkStatus,
  toggleWorkFavorite,
  toggleWorkLike,
  type CommunityEnvironment,
  type PublishedWork,
  type PublishWorkInput,
  type WorkFilter,
  type WorkStatus,
} from './community-model'
import { buildDemoWorks } from './demo-works'

const defaultEnvironment: CommunityEnvironment = {
  now: () => new Date().toISOString(),
  randomId: () => crypto.randomUUID(),
}

export interface CommunityWorkRepository {
  ensureDemoWorks(): Promise<boolean>
  listPublished(filter: WorkFilter): Promise<PublishedWork[]>
  listMine(): Promise<PublishedWork[]>
  get(workId: string): Promise<PublishedWork | undefined>
  publish(
    project: Project,
    timeline: TimelineProject,
    input: PublishWorkInput,
  ): Promise<PublishedWork>
  setStatus(workId: string, status: WorkStatus): Promise<PublishedWork | undefined>
  recordView(workId: string): Promise<PublishedWork | undefined>
  toggleLike(workId: string): Promise<PublishedWork | undefined>
  toggleFavorite(workId: string): Promise<PublishedWork | undefined>
}

export class CommunityRepository implements CommunityWorkRepository {
  private readonly database: WirelessCanvasDatabase
  private readonly environment: CommunityEnvironment

  constructor(
    database: WirelessCanvasDatabase,
    environment: CommunityEnvironment = defaultEnvironment,
  ) {
    this.database = database
    this.environment = environment
  }

  async ensureDemoWorks(): Promise<boolean> {
    return this.database.transaction('rw', this.database.publishedWorks, async () => {
      const seeds = buildDemoWorks()
      const existing = await this.database.publishedWorks.bulkGet(
        seeds.map(({ id }) => id),
      )
      const missing = seeds.filter((_, index) => !existing[index])
      const refreshed = seeds.flatMap((seed, index) => {
        const current = existing[index]
        if (!current) return []
        const tags = [...new Set([...seed.tags, ...current.tags])].slice(0, 5)
        if (
          JSON.stringify(tags) === JSON.stringify(current.tags) &&
          (current.authorVerified ?? false) === (seed.authorVerified ?? false)
        ) {
          return []
        }
        return [{
          ...current,
          tags,
          authorVerified: seed.authorVerified ?? current.authorVerified,
        }]
      })
      const writes = [...missing, ...refreshed]
      if (writes.length === 0) return false
      await this.database.publishedWorks.bulkPut(writes)
      return true
    })
  }

  async listPublished(filter: WorkFilter): Promise<PublishedWork[]> {
    const works = await this.database.publishedWorks
      .where('status')
      .equals('published')
      .toArray()
    return filterAndSortWorks(works, filter)
  }

  async listMine(): Promise<PublishedWork[]> {
    return this.database.publishedWorks.orderBy('updatedAt').reverse().toArray()
  }

  async get(workId: string): Promise<PublishedWork | undefined> {
    return this.database.publishedWorks.get(workId)
  }

  async publish(
    project: Project,
    timeline: TimelineProject,
    input: PublishWorkInput,
  ): Promise<PublishedWork> {
    return this.database.transaction('rw', this.database.publishedWorks, async () => {
      const existing = await this.database.publishedWorks
        .where('projectId')
        .equals(project.id)
        .first()
      const work = createPublishedWork(
        project,
        timeline,
        input,
        existing,
        this.environment,
      )
      await this.database.publishedWorks.put(work)
      return work
    })
  }

  private async update(
    workId: string,
    change: (work: PublishedWork) => PublishedWork,
  ): Promise<PublishedWork | undefined> {
    return this.database.transaction('rw', this.database.publishedWorks, async () => {
      const work = await this.database.publishedWorks.get(workId)
      if (!work) return undefined
      const next = change(work)
      await this.database.publishedWorks.put(next)
      return next
    })
  }

  async setStatus(
    workId: string,
    status: WorkStatus,
  ): Promise<PublishedWork | undefined> {
    return this.update(workId, (work) =>
      updateWorkStatus(work, status, this.environment),
    )
  }

  async recordView(workId: string): Promise<PublishedWork | undefined> {
    return this.update(workId, (work) => recordWorkView(work, this.environment))
  }

  async toggleLike(workId: string): Promise<PublishedWork | undefined> {
    return this.update(workId, (work) => toggleWorkLike(work, this.environment))
  }

  async toggleFavorite(workId: string): Promise<PublishedWork | undefined> {
    return this.update(workId, (work) =>
      toggleWorkFavorite(work, this.environment),
    )
  }
}
