import Dexie, { type Table } from 'dexie'

import type { Project } from './model'
import {
  deriveLibraryRecord,
  type LibraryAssetRecord,
} from '../assets/library-model'
import type { TimelineProject } from '../timeline/timeline-project'
import type { PublishedWork } from '../community/community-model'
import type { Collaborator, ChangeComment } from '../collaboration/collaboration-model'
import type { MembershipSubscription } from '../membership/membership-model'
import type { HomeContentRecord } from '../home/home-content'
import type {
  ProjectFolder,
  ProjectLocation,
} from '../projects/project-space-model'
import type { SubjectAsset } from '../subjects/subject-model'
import type { StyleCard, StylePreference } from '../styles/style-model'

export class WirelessCanvasDatabase extends Dexie {
  projects!: Table<Project, string>
  libraryAssets!: Table<LibraryAssetRecord, string>
  timelineProjects!: Table<TimelineProject, string>
  publishedWorks!: Table<PublishedWork, string>
  collaborators!: Table<Collaborator, string>
  changeComments!: Table<ChangeComment, string>
  membership!: Table<MembershipSubscription, string>
  homeContent!: Table<HomeContentRecord, string>
  projectFolders!: Table<ProjectFolder, string>
  projectLocations!: Table<ProjectLocation, string>
  subjects!: Table<SubjectAsset, string>
  styles!: Table<StyleCard, string>
  stylePreferences!: Table<StylePreference, string>

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
    this.version(5).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, &fingerprint',
      workflowRuns: 'id, projectId, updatedAt, status',
      timelineProjects: 'id, projectId, updatedAt',
    })
    this.version(6).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, &fingerprint',
      workflowRuns: 'id, projectId, updatedAt, status',
      timelineProjects: 'id, projectId, updatedAt',
      publishedWorks: 'id, &projectId, status, publishedAt, updatedAt',
    })
    this.version(7).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, &fingerprint',
      workflowRuns: 'id, projectId, updatedAt, status',
      timelineProjects: 'id, projectId, updatedAt',
      publishedWorks: 'id, &projectId, status, publishedAt, updatedAt',
      collaborators: 'id, projectId, role, updatedAt',
      changeComments: 'id, projectId, targetType, targetId, status, createdAt',
      membership: 'id, plan, status, updatedAt',
    })
    this.version(8).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, &fingerprint',
      workflowRuns: 'id, projectId, updatedAt, status',
      timelineProjects: 'id, projectId, updatedAt',
      publishedWorks: 'id, &projectId, status, publishedAt, updatedAt',
      collaborators: 'id, projectId, role, updatedAt',
      changeComments: 'id, projectId, targetType, targetId, status, createdAt',
      membership: 'id, plan, status, updatedAt',
      homeContent: 'id, kind, category, order',
    })
    this.version(9).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, &fingerprint',
      workflowRuns: 'id, projectId, updatedAt, status',
      timelineProjects: 'id, projectId, updatedAt',
      publishedWorks: 'id, &projectId, status, publishedAt, updatedAt',
      collaborators: 'id, projectId, role, updatedAt',
      changeComments: 'id, projectId, targetType, targetId, status, createdAt',
      membership: 'id, plan, status, updatedAt',
      homeContent: 'id, kind, category, order',
      projectFolders: 'id, &normalizedName, updatedAt',
      projectLocations: 'projectId, folderId, updatedAt',
    })
    this.version(10).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, &fingerprint',
      workflowRuns: 'id, projectId, updatedAt, status',
      timelineProjects: 'id, projectId, updatedAt',
      publishedWorks: 'id, &projectId, status, publishedAt, updatedAt',
      collaborators: 'id, projectId, role, updatedAt',
      changeComments: 'id, projectId, targetType, targetId, status, createdAt',
      membership: 'id, plan, status, updatedAt',
      homeContent: 'id, kind, category, order',
      projectFolders: 'id, &normalizedName, updatedAt',
      projectLocations: 'projectId, folderId, updatedAt',
      subjects: 'id, name, sourceProjectId, updatedAt',
    })
    this.version(11).stores({ styles: 'id, name', stylePreferences: 'id, lastUsedAt' })
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

  async listAll(): Promise<Project[]> {
    return this.database.projects.orderBy('updatedAt').reverse().toArray()
  }
}
