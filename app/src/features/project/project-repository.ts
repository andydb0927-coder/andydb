import Dexie, { type Table } from 'dexie'

import type { Project } from './model'

export class WirelessCanvasDatabase extends Dexie {
  projects!: Table<Project, string>

  constructor(name = 'wireless-canvas-v1') {
    super(name)
    this.version(1).stores({ projects: 'id, updatedAt' })
  }
}

export class ProjectRepository {
  private readonly database: WirelessCanvasDatabase

  constructor(database: WirelessCanvasDatabase = new WirelessCanvasDatabase()) {
    this.database = database
  }

  async save(project: Project): Promise<void> {
    await this.database.projects.put(project)
  }

  async load(projectId: string): Promise<Project | undefined> {
    return this.database.projects.get(projectId)
  }

  async listRecent(limit: number): Promise<Project[]> {
    return this.database.projects.orderBy('updatedAt').reverse().limit(limit).toArray()
  }
}
