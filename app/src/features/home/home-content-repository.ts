import type { WirelessCanvasDatabase } from '../project/project-repository'
import { buildHomeContentSeed, type HomeContentRecord } from './home-content'

export interface PlatformHomeContentRepository {
  ensureSeed(): Promise<boolean>
  list(): Promise<HomeContentRecord[]>
}

export class HomeContentRepository implements PlatformHomeContentRepository {
  private readonly database: WirelessCanvasDatabase

  constructor(database: WirelessCanvasDatabase) {
    this.database = database
  }

  async ensureSeed(): Promise<boolean> {
    return this.database.transaction('rw', this.database.homeContent, async () => {
      const seed = buildHomeContentSeed()
      const existing = await this.database.homeContent.bulkGet(
        seed.map(({ id }) => id),
      )
      const missing = seed.filter((_, index) => !existing[index])
      const refreshed = seed.filter((record, index) => {
        if (record.kind !== 'mode' && record.kind !== 'capability') return false
        const current = existing[index]
        return current !== undefined && JSON.stringify(current) !== JSON.stringify(record)
      })
      const writes = [...missing, ...refreshed]
      if (writes.length === 0) return false
      await this.database.homeContent.bulkPut(writes)
      return true
    })
  }

  async list(): Promise<HomeContentRecord[]> {
    return this.database.homeContent.orderBy('order').toArray()
  }
}
