import type { GenerationJob, GenerationOperation } from '../project/model'
import type {
  GenerationAdapter,
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'

export interface QueueGenerationJob extends GenerationJob {
  projectId: string
  attempt: number
  operation: GenerationOperation
  sequence: number
}

export interface GenerationQueueOptions {
  adapter: GenerationAdapter
  getLatestSequence?(projectId: string): number
  onJobChange(job: GenerationJob): void
  onSuccess(job: GenerationJob, result: GenerationResult): void
}

interface QueueEntry {
  job: QueueGenerationJob
  request: GenerationRequest
  controller: AbortController
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isRestorableJob(
  job: GenerationJob,
  request: GenerationRequest,
): job is QueueGenerationJob {
  return (
    job.id.length > 0 &&
    job.projectId === request.projectId &&
    job.nodeId === request.nodeId &&
    job.operation === request.operation &&
    typeof job.attempt === 'number' &&
    typeof job.sequence === 'number'
  )
}

export class GenerationQueue {
  private readonly entries = new Map<string, QueueEntry>()
  private readonly options: GenerationQueueOptions
  private nextSequence = 0
  private disposed = false

  constructor(options: GenerationQueueOptions) {
    this.options = options
  }

  enqueue(request: GenerationRequest) {
    if (this.disposed) throw new Error('Generation queue is disposed')
    this.nextSequence = Math.max(
      this.nextSequence,
      this.options.getLatestSequence?.(request.projectId) ?? 0,
    )
    const timestamp = new Date().toISOString()
    const entry: QueueEntry = {
      request,
      controller: new AbortController(),
      job: {
        id: crypto.randomUUID(),
        projectId: request.projectId,
        nodeId: request.nodeId,
        operation: request.operation,
        attempt: 1,
        sequence: ++this.nextSequence,
        status: 'queued',
        prompt: request.prompt,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    }
    this.entries.set(entry.job.id, entry)
    this.options.onJobChange(entry.job)
    queueMicrotask(() => void this.start(entry, entry.job.attempt))
    return entry.job
  }

  get(id: string) {
    return this.entries.get(id)?.job
  }

  cancel(id: string) {
    const entry = this.entries.get(id)
    if (
      !entry ||
      (entry.job.status !== 'queued' && entry.job.status !== 'running')
    ) {
      return undefined
    }

    entry.controller.abort()
    return this.update(entry, { status: 'cancelled', error: undefined })
  }

  retry(jobOrId: string | GenerationJob, request?: GenerationRequest) {
    if (this.disposed) return undefined
    const id = typeof jobOrId === 'string' ? jobOrId : jobOrId.id
    let entry = this.entries.get(id)
    if (
      !entry &&
      typeof jobOrId !== 'string' &&
      request &&
      isRestorableJob(jobOrId, request)
    ) {
      entry = {
        job: { ...jobOrId },
        request,
        controller: new AbortController(),
      }
      this.entries.set(id, entry)
      this.nextSequence = Math.max(this.nextSequence, entry.job.sequence)
    }
    if (
      !entry ||
      (entry.job.status !== 'failed' && entry.job.status !== 'cancelled')
    ) {
      return undefined
    }

    entry.controller = new AbortController()
    const job = this.update(entry, {
      status: 'queued',
      attempt: entry.job.attempt + 1,
      error: undefined,
      assetId: undefined,
    })
    queueMicrotask(() => void this.start(entry, job.attempt))
    return job
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const entry of this.entries.values()) this.cancel(entry.job.id)
  }

  resume() {
    this.disposed = false
  }

  private update(
    entry: QueueEntry,
    changes: Partial<QueueGenerationJob>,
  ) {
    entry.job = {
      ...entry.job,
      ...changes,
      updatedAt: new Date().toISOString(),
    }
    this.options.onJobChange(entry.job)
    return entry.job
  }

  private async start(entry: QueueEntry, attempt: number) {
    if (entry.job.status !== 'queued' || entry.job.attempt !== attempt) return
    this.update(entry, { status: 'running' })

    let result: GenerationResult
    try {
      result = await this.options.adapter.start(
        entry.request,
        entry.controller.signal,
      )
    } catch (error) {
      if (!this.isCurrentAttempt(entry, attempt)) return
      if (this.isCancelled(entry) || isAbortError(error)) return
      this.update(entry, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Generation failed',
      })
      return
    }

    if (!this.isCurrentAttempt(entry, attempt) || this.isCancelled(entry)) {
      return
    }
    const job: QueueGenerationJob = {
      ...entry.job,
      status: 'succeeded',
      assetId: result.asset.id,
      error: undefined,
      updatedAt: new Date().toISOString(),
    }
    if (
      result.version.assetId !== result.asset.id ||
      (result.version.generationJobId !== undefined &&
        result.version.generationJobId !== job.id)
    ) {
      this.update(entry, {
        status: 'failed',
        error: 'Generation result asset reference mismatch',
      })
      return
    }
    const completedResult: GenerationResult = {
      ...result,
      version: {
        ...result.version,
        assetId: result.asset.id,
        generationJobId: job.id,
      },
    }
    try {
      this.options.onSuccess(job, completedResult)
    } catch (error) {
      this.update(entry, {
        status: 'failed',
        assetId: undefined,
        error:
          error instanceof Error
            ? error.message
            : 'Generation result rejected',
      })
      return
    }
    entry.job = job
    this.options.onJobChange(job)
  }

  private isCancelled(entry: QueueEntry) {
    return this.entries.get(entry.job.id)?.job.status === 'cancelled'
  }

  private isCurrentAttempt(entry: QueueEntry, attempt: number) {
    return entry.job.attempt === attempt && entry.job.status === 'running'
  }
}
