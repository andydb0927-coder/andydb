import { generationErrorMessage } from '../generation/generation-errors'
import { PipelineStorageError, type PipelineRun, type PipelineStep } from './pipeline-model'

export interface PipelineExecutorContext {
  signal: AbortSignal; step: PipelineStep
  onProgress(progress: number, jobId?: string): void
}
export interface PipelineRunnerOptions {
  save(run: PipelineRun): Promise<void>
  execute(nodeId: string, context: PipelineExecutorContext): Promise<{ jobId?: string }>
  onChange?(run: PipelineRun): void
}

/** Serial coordinator. Queue/provider protocol remains in the executor. */
export class PipelineRunner {
  private run: PipelineRun
  private working = false
  private controller?: AbortController
  private writes: Promise<void> = Promise.resolve()
  private readonly options: PipelineRunnerOptions
  constructor(run: PipelineRun, options: PipelineRunnerOptions) { this.run = structuredClone(run); this.options = options }
  get snapshot() { return structuredClone(this.run) }
  private publish() { this.run.updatedAt = new Date().toISOString(); this.options.onChange?.(this.snapshot) }
  private save() {
    this.publish()
    const snapshot = this.snapshot
    this.writes = this.writes.then(() => this.options.save(snapshot))
    return this.writes
  }
  pause() { if (this.run.status === 'running') { this.run.pauseRequested = true; this.publish() } }
  async cancel(interrupted = false) {
    this.controller?.abort()
    this.run.pauseRequested = false
    this.run.status = interrupted ? 'running' : 'cancelled'
    this.run.pausedReason = interrupted ? 'interrupted' : undefined
    if (!interrupted) this.run.finishedAt = new Date().toISOString()
    for (const step of this.run.steps) if (step.status === 'running' || step.status === 'queued') {
      step.status = interrupted ? 'queued' : 'cancelled'; step.progress = 0
      if (interrupted) step.error = '运行已中断，请确认后继续。'
    }
    await this.save()
  }
  async skip(nodeId: string) {
    const step = this.run.steps.find(step => step.nodeId === nodeId)
    if (!step || step.status === 'running' || step.status === 'succeeded' || this.run.status === 'cancelled') return
    step.status = 'cancelled'; step.skipped = 'user'; step.error = '手动跳过：下游将使用该节点已有结果。'; step.progress = 100
    await this.save()
  }
  async retry(nodeId: string) {
    if (this.working || this.run.status === 'cancelled') return
    const step = this.run.steps.find(step => step.nodeId === nodeId)
    if (step?.status !== 'failed') return
    step.status = 'queued'; step.error = undefined; step.progress = 0
    for (const item of this.run.steps) if (item.skipped === 'dependency') { item.status = 'queued'; item.skipped = undefined; item.error = undefined; item.progress = 0 }
    return this.resume()
  }
  async resume() {
    if (this.working || this.run.status === 'cancelled') return
    if (this.run.steps.some(step => step.status === 'failed') && this.run.policy.mode !== 'continue') return
    this.run.pausedReason = undefined; this.run.pauseRequested = false; this.run.finishedAt = undefined
    return this.start()
  }
  async start() {
    if (this.working || this.run.status === 'cancelled' || this.run.status === 'succeeded') return
    this.working = true
    this.run.status = 'running'; this.run.pausedReason = undefined
    try {
      await this.save()
      for (;;) {
        if (this.snapshot.status === 'cancelled' || this.run.pausedReason === 'interrupted') return
        if (this.run.pauseRequested) { this.run.pausedReason = 'manual'; this.run.pauseRequested = false; await this.save(); return }
        const step = this.run.steps.find(step => step.status === 'queued' && !step.skipped)
        if (!step) {
          this.run.status = this.run.steps.some(step => step.status === 'failed') ? 'failed' : 'succeeded'
          this.run.finishedAt = new Date().toISOString(); await this.save(); return
        }
        const blocked = this.run.edges.some(edge => edge.targetNodeId === step.nodeId && this.run.steps.some(parent => parent.nodeId === edge.sourceNodeId && (parent.status === 'failed' || parent.skipped === 'dependency')))
        if (blocked) { step.status = 'cancelled'; step.skipped = 'dependency'; step.error = '上游失败，未使用旧结果自动执行此分支。'; step.progress = 100; await this.save(); continue }
        this.controller = new AbortController()
        const controller = this.controller
        step.status = 'running'; step.attempts++; step.startedAt = new Date().toISOString(); step.error = undefined; step.progress = 0
        await this.save()
        const start = Date.now()
        try {
          const result = await this.options.execute(step.nodeId, { signal: controller.signal, step: structuredClone(step), onProgress: (progress, jobId) => {
            if (controller.signal.aborted || step.status !== 'running') return
            const firstJob = jobId && step.jobId !== jobId
            step.progress = Math.max(step.progress, Math.min(100, progress)); step.jobId = jobId ?? step.jobId; this.publish()
            // Persist the correlation ID before a result can finish; recovery reconciles jobs.
            if (firstJob) void this.save().catch(() => controller.abort())
          } })
          if (controller.signal.aborted) { await this.writes; return }
          step.jobId = result.jobId ?? step.jobId; step.status = 'succeeded'; step.progress = 100; step.finishedAt = new Date().toISOString()
        } catch (error) {
          if (controller.signal.aborted) { await this.writes; return }
          step.status = 'failed'; step.error = generationErrorMessage(error, '管线步骤执行失败，请重试。'); step.finishedAt = new Date().toISOString()
          if (error instanceof PipelineStorageError) this.run.pausedReason = 'failure'
          else if (this.run.policy.mode === 'retry' && step.attempts <= this.run.policy.retries) step.status = 'queued'
          else if (this.run.policy.mode !== 'continue') this.run.pausedReason = 'failure'
        } finally { step.elapsedMs += Math.max(0, Date.now() - start) }
        await this.save()
        if (this.run.pausedReason) return
      }
    } finally { this.working = false }
  }
}
