import type { GenerationJob, PipelineNodeConfig, Project } from '../project/model'
import type { TaskStatus } from '../generation/task-status'
import { createWorkflowBatchPlan } from '../canvas/workflow-batch'

/** A completed generation must not be repeated merely because saving failed. */
export class PipelineStorageError extends Error {
  constructor(cause?: unknown) {
    super('管线结果保存失败，请检查本地存储后重试；不会重复生成已完成的结果。', { cause })
    this.name = 'PipelineStorageError'
  }
}

export interface PipelinePolicy { mode: 'stop' | 'continue' | 'retry'; retries: number }
export interface PipelineStep {
  nodeId: string; title: string; status: TaskStatus; attempts: number; progress: number
  config: PipelineNodeConfig; jobId?: string; error?: string; skipped?: 'user' | 'dependency'
  startedAt?: string; finishedAt?: string; elapsedMs: number
}
export interface PipelineRun {
  id: string; projectId: string; canvasId?: string; startNodeId: string; title: string
  createdAt: string; updatedAt: string; finishedAt?: string; status: TaskStatus
  pausedReason?: 'manual' | 'failure' | 'interrupted'; pauseRequested?: boolean
  policy: PipelinePolicy; steps: PipelineStep[]; edges: Project['edges']
}
export const pipelineStatusCopy: Record<TaskStatus, string> = { queued: '等待执行', running: '执行中', succeeded: '已完成', failed: '失败', cancelled: '已取消' }

export function pipelinePlan(project: Project, startNodeId: string) {
  const start = project.nodes.find(node => node.id === startNodeId)
  if (!start || !['text', 'script', 'image'].includes(start.kind)) throw new Error('请选择脚本、文本或图片节点作为管线起点。')
  const ids = new Set([startNodeId])
  const queue = [startNodeId]
  for (let i = 0; i < queue.length; i++) for (const edge of project.edges) {
    if (edge.sourceNodeId === queue[i] && !ids.has(edge.targetNodeId)) { ids.add(edge.targetNodeId); queue.push(edge.targetNodeId) }
  }
  const plan = createWorkflowBatchPlan(project, ids)
  if (!plan.ok) throw new Error(plan.reason)
  return plan.nodeIds
}

export function defaultPipelineConfig(node: Project['nodes'][number]): PipelineNodeConfig {
  return node.pipelineConfig ?? { action: node.details?.type === 'text' && node.details.editorMode === 'manual' || ['character', 'scene', 'character-card', 'worldview', 'preview'].includes(node.kind) ? 'reuse' : 'generate' }
}

export function createPipelineRun(project: Project, startNodeId: string, policy: PipelinePolicy = { mode: 'stop', retries: 0 }): PipelineRun {
  const timestamp = new Date().toISOString()
  const ids = pipelinePlan(project, startNodeId)
  return { id: crypto.randomUUID(), projectId: project.id, canvasId: project.activeCanvasId, startNodeId,
    title: `${project.nodes.find(node => node.id === startNodeId)!.title}的管线`, createdAt: timestamp, updatedAt: timestamp,
    status: 'queued', policy: { mode: policy.mode, retries: Math.max(0, Math.min(3, Math.floor(policy.retries))) },
    steps: ids.map(nodeId => { const node = project.nodes.find(node => node.id === nodeId)!; return { nodeId, title: node.title, status: 'queued', attempts: 0, progress: 0, elapsedMs: 0, config: structuredClone(defaultPipelineConfig(node)) } }),
    edges: project.edges.filter(edge => ids.includes(edge.sourceNodeId) && ids.includes(edge.targetNodeId)).map(edge => ({ ...edge })),
  }
}

export function pipelineSummary(run: PipelineRun) {
  const succeeded = run.steps.filter(step => step.status === 'succeeded').length
  const failed = run.steps.filter(step => step.status === 'failed').length
  const skipped = run.steps.filter(step => step.skipped).length
  return { total: run.steps.length, succeeded, failed, skipped, elapsedMs: run.steps.reduce((sum, step) => sum + step.elapsedMs, 0),
    progress: Math.round(run.steps.reduce((sum, step) => sum + (step.status === 'succeeded' || step.status === 'failed' || step.skipped ? 100 : step.progress), 0) / Math.max(1, run.steps.length)) }
}

export function recoverPipelineRun(original: PipelineRun, jobs: GenerationJob[] = []): PipelineRun {
  const run = structuredClone(original)
  if (run.status !== 'running' && run.status !== 'queued') return run
  run.pausedReason = 'interrupted'; run.pauseRequested = false
  for (const step of run.steps) {
    if (step.status !== 'running' && step.status !== 'queued') continue
    const job = jobs.find(job => job.id === step.jobId && job.nodeId === step.nodeId)
    if (job?.status === 'succeeded') { step.status = 'succeeded'; step.progress = 100; step.finishedAt = job.updatedAt }
    else { step.status = 'queued'; step.progress = 0; step.error = '上次运行已中断，请确认后继续；不会自动重发请求。' }
  }
  if (run.steps.every(step => step.status === 'succeeded' || step.skipped)) { run.status = 'succeeded'; run.pausedReason = undefined; run.finishedAt = new Date().toISOString() }
  return run
}
