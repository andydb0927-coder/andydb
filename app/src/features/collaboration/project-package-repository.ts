import type { WirelessCanvasDatabase } from '../project/project-repository'
import type {
  LocalProjectPackage,
  LocalWorkspacePackage,
} from './project-package'

export class ProjectPackageRepository {
  private readonly database: WirelessCanvasDatabase
  private readonly now: () => string

  constructor(
    database: WirelessCanvasDatabase,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.database = database
    this.now = now
  }

  async exportProject(projectId: string): Promise<LocalProjectPackage> {
    const project = await this.database.projects.get(projectId)
    if (!project) throw new Error('未找到本地项目')

    const [timeline, collaborators, comments] = await Promise.all([
      this.database.timelineProjects.where('projectId').equals(projectId).first(),
      this.database.collaborators.where('projectId').equals(projectId).toArray(),
      this.database.changeComments.where('projectId').equals(projectId).toArray(),
    ])
    const referencedIds = new Set([
      ...project.assets.map(({ id }) => id),
      ...(timeline?.tracks.flatMap(({ clips }) =>
        clips.flatMap(({ source }) => source.assetId ? [source.assetId] : []),
      ) ?? []),
    ])
    const libraryAssets = (await this.database.libraryAssets.bulkGet([...referencedIds]))
      .filter((record): record is NonNullable<typeof record> => Boolean(record))

    return {
      kind: 'wireless-canvas-project',
      schemaVersion: 1,
      exportedAt: this.now(),
      project,
      timeline,
      libraryAssets,
      collaboration: { collaborators, comments },
    }
  }

  async importProject(value: LocalProjectPackage) {
    const projectId = value.project.id
    if (
      value.collaboration.collaborators.some((item) => item.projectId !== projectId) ||
      value.collaboration.comments.some((item) => item.projectId !== projectId) ||
      (value.timeline && value.timeline.projectId !== projectId)
    ) {
      throw new Error('项目包记录不一致')
    }

    await this.database.transaction(
      'rw',
      this.database.projects,
      this.database.libraryAssets,
      this.database.timelineProjects,
      this.database.collaborators,
      this.database.changeComments,
      async () => {
        await this.database.projects.put(value.project)
        if (value.libraryAssets.length) {
          await this.database.libraryAssets.bulkPut(value.libraryAssets)
        }
        if (value.timeline) await this.database.timelineProjects.put(value.timeline)
        await this.database.collaborators.where('projectId').equals(projectId).delete()
        await this.database.changeComments.where('projectId').equals(projectId).delete()
        if (value.collaboration.collaborators.length) {
          await this.database.collaborators.bulkPut(value.collaboration.collaborators)
        }
        if (value.collaboration.comments.length) {
          await this.database.changeComments.bulkPut(value.collaboration.comments)
        }
      },
    )
  }

  async exportWorkspace(): Promise<LocalWorkspacePackage> {
    const projects = await this.database.projects.orderBy('updatedAt').reverse().toArray()
    return {
      kind: 'wireless-canvas-workspace',
      schemaVersion: 1,
      exportedAt: this.now(),
      projects: await Promise.all(projects.map(({ id }) => this.exportProject(id))),
    }
  }
}
