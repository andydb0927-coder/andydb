import { WirelessCanvasDatabase } from '../project/project-repository'
import type { PipelineRun } from './pipeline-model'
import type { PipelineTemplate } from './pipeline-template'

export class PipelineRepository {
  private readonly database: WirelessCanvasDatabase
  constructor(database = new WirelessCanvasDatabase()) { this.database = database }
  async save(run: PipelineRun) { await this.database.pipelineRuns.put(structuredClone(run)) }
  async load(id: string) { return this.database.pipelineRuns.get(id) }
  async list(projectId: string, canvasId?: string) {
    return (await this.database.pipelineRuns.where('projectId').equals(projectId).toArray()).filter(run => run.canvasId === canvasId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  async saveTemplate(template: PipelineTemplate) {
    if (!template.name.trim()) throw new Error('请输入模板名称。')
    await this.database.pipelineTemplates.put({ ...structuredClone(template), name: template.name.trim().slice(0, 60), updatedAt: new Date().toISOString() })
  }
  async templates() { return this.database.pipelineTemplates.orderBy('updatedAt').reverse().toArray() }
  async deleteTemplate(id: string) { await this.database.pipelineTemplates.delete(id) }
}
