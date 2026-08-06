import type { GenerationJob, GenerationOperation } from '../project/model'
import type {
  GenerationAdapter,
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'

export interface QueueGenerationJob extends GenerationJob {
  attempt: number
  operation: GenerationOperation
}

export interface GenerationQueueOptions {
  adapter: GenerationAdapter
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

export class GenerationQueue {
  private readonly entries = new Map<string, QueueEntry>()
  private readonly options: GenerationQueueOptions

  constructor(options: GenerationQueueOptions) {
    this.options = options
  }

  enqueue(request: GenerationRequest) {
    const timestamp = new Date().toISOString()
    const entry: QueueEntry = {
      request,
      controller: new AbortController(),
      job: {
        id: crypto.randomUUID(),
        nodeId: request.nodeId,
        operation: request.operation,
        attempt: 1,
        status: 'queued',
        prompt: request.prompt,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    }
    this.entries.set(entry.job.id, entry)
    this.options.onJobChange(entry.job)
    queueMicrotask(() => void this.start(entry))
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

  retry(id: string) {
    const entry = this.entries.get(id)
    if (!entry || entry.job.status !== 'failed') return undefined

    entry.controller = new AbortController()
    const job = this.update(entry, {
      status: 'queued',
      attempt: entry.job.attempt + 1,
      error: undefined,
      assetId: undefined,
    })
    queueMicrotask(() => void this.start(entry))
    return job
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

  private async start(entry: QueueEntry) {
    if (entry.job.status !== 'queued') return
    this.update(entry, { status: 'running' })

    let result: GenerationResult
    try {
      result = await this.options.adapter.start(
        entry.request,
        entry.controller.signal,
      )
    } catch (error) {
      if (this.isCancelled(entry) || isAbortError(error)) return
      this.update(entry, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Generation failed',
      })
      return
    }

    if (this.isCancelled(entry)) return
    const job = this.update(entry, {
      status: 'succeeded',
      assetId: result.asset.id,
      error: undefined,
    })
    this.options.onSuccess(job, {
      ...result,
      version: {
        ...result.version,
        assetId: result.asset.id,
        generationJobId: job.id,
      },
    })
  }

  private isCancelled(entry: QueueEntry) {
    return this.entries.get(entry.job.id)?.job.status === 'cancelled'
  }
}
