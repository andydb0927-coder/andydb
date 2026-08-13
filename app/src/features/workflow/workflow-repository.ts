import type { WirelessCanvasDatabase } from '../project/project-repository'
import type { WorkflowRun } from './workflow-model'

export class WorkflowRepository {
  private readonly database: WirelessCanvasDatabase

  constructor(database: WirelessCanvasDatabase) {
    this.database = database
  }

  async save(run: WorkflowRun): Promise<void> {
    await this.database.workflowRuns.put(run)
  }

  async load(runId: string): Promise<WorkflowRun | undefined> {
    return this.database.workflowRuns.get(runId)
  }

  async listByProject(projectId: string): Promise<WorkflowRun[]> {
    const runs = await this.database.workflowRuns
      .where('projectId')
      .equals(projectId)
      .toArray()
    return runs.sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.createdAt.localeCompare(left.createdAt) ||
        right.id.localeCompare(left.id),
    )
  }

  async listAll(): Promise<WorkflowRun[]> {
    const runs = await this.database.workflowRuns.toArray()
    return runs.sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.createdAt.localeCompare(left.createdAt) ||
        right.id.localeCompare(left.id),
    )
  }
}
