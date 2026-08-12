import type { WirelessCanvasDatabase } from '../project/project-repository'
import type { TimelineProject } from './timeline-project'

export interface TimelineProjectRepository {
  load(projectId: string): Promise<TimelineProject | undefined>
  save(timeline: TimelineProject): Promise<void>
}

export class TimelineRepository implements TimelineProjectRepository {
  private readonly database: WirelessCanvasDatabase

  constructor(database: WirelessCanvasDatabase) {
    this.database = database
  }

  async load(projectId: string): Promise<TimelineProject | undefined> {
    return this.database.timelineProjects.where('projectId').equals(projectId).first()
  }

  async save(timeline: TimelineProject): Promise<void> {
    await this.database.timelineProjects.put(timeline)
  }

  async list(): Promise<TimelineProject[]> {
    return this.database.timelineProjects.orderBy('updatedAt').reverse().toArray()
  }
}
