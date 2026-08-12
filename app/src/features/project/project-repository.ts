import Dexie, { type Table } from 'dexie'

import type { Project } from './model'
import {
  deriveLibraryRecord,
  type LibraryAssetRecord,
} from '../assets/library-model'
import type { WorkflowRun } from '../workflow/workflow-model'

export class WirelessCanvasDatabase extends Dexie {
  projects!: Table<Project, string>
  libraryAssets!: Table<LibraryAssetRecord, string>
  workflowRuns!: Table<WorkflowRun, string>

  constructor(name = 'wireless-canvas-v1') {
    super(name)
    this.version(1).stores({ projects: 'id, updatedAt' })
    this.version(2).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, fingerprint',
    })
    this.version(3).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, &fingerprint',
    })
    this.version(4).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, &fingerprint',
      workflowRuns: 'id, projectId, updatedAt, status',
    })
  }
}

export class ProjectRepository {
  private readonly database: WirelessCanvasDatabase

  constructor(database: WirelessCanvasDatabase = new WirelessCanvasDatabase()) {
    this.database = database
  }

  async save(project: Project): Promise<void> {
    await this.database.transaction(
      'rw',
      this.database.libraryAssets,
      this.database.projects,
      async () => {
        const existing = await this.database.libraryAssets.bulkGet(
          project.assets.map(({ id }) => id),
        )
        const missing = project.assets.filter((_, index) => !existing[index])

        if (missing.length > 0) {
          await this.database.libraryAssets.bulkPut(
            missing.map((asset) => deriveLibraryRecord(project, asset)),
          )
        }

        await this.database.projects.put(project)
      },
    )
  }

  async load(projectId: string): Promise<Project | undefined> {
    return this.database.projects.get(projectId)
  }

  async listRecent(limit: number): Promise<Project[]> {
    return this.database.projects.orderBy('updatedAt').reverse().limit(limit).toArray()
  }
}
