import type {
  GenerationAdapter,
  GenerationResult,
} from '../generation/generation-adapter'
import {
  normalizeInterruptedRun,
  type WorkflowNodeRun,
  type WorkflowRun,
} from './workflow-model'

export interface WorkflowRunnerOptions {
  adapter: GenerationAdapter
  onRunChange(run: WorkflowRun): void
  onNodeSuccess(
    nodeRun: WorkflowNodeRun,
    result: GenerationResult,
  ): void | Promise<void>
  persistRun?(run: WorkflowRun): Promise<void>
  now?(): string
  randomId?(): string
  progressIntervalMs?: number
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

export class WorkflowRunner {
  private readonly options: WorkflowRunnerOptions
  private readonly runs = new Map<string, WorkflowRun>()
  private readonly controllers = new Map<string, AbortController>()
  private readonly progressTimers = new Map<string, ReturnType<typeof setInterval>>()
  private readonly executions = new Map<string, Promise<WorkflowRun>>()
  private persistenceChain: Promise<void> = Promise.resolve()
  private lastRunId?: string
  private disposed = false

  constructor(options: WorkflowRunnerOptions) {
    this.options = options
  }

  current(runId = this.lastRunId) {
    return runId ? this.runs.get(runId) : undefined
  }

  execute(run: WorkflowRun): Promise<WorkflowRun> {
    if (this.disposed) return Promise.resolve(run)
    const active = this.executions.get(run.id)
    if (active) return active
    this.publish(run)

    const execution = this.executeRun(run.id).finally(() => {
      this.executions.delete(run.id)
    })
    this.executions.set(run.id, execution)
    return execution
  }

  resume(run: WorkflowRun) {
    const normalized = normalizeInterruptedRun(run, () => this.now())
    this.publish(normalized)
    return this.execute(normalized)
  }

  async retryNode(run: WorkflowRun, nodeRunId: string) {
    if (this.disposed || this.executions.has(run.id)) return undefined
    const current = this.runs.get(run.id) ?? run
    const target = current.nodes.find(({ id }) => id === nodeRunId)
    if (target?.status !== 'failed') return undefined
    const timestamp = this.now()
    const retried: WorkflowRun = {
      ...current,
      status: 'pending',
      updatedAt: timestamp,
      finishedAt: undefined,
      nodes: current.nodes.map((node) =>
        node.id === nodeRunId
          ? {
              ...node,
              status: 'pending',
              progress: 0,
              attempt: node.attempt + 1,
              startedAt: undefined,
              finishedAt: undefined,
              error: undefined,
            }
          : node,
      ),
      logs: [
        ...current.logs,
        this.logEntry(
          `重试节点“${target.nodeTitle}”，第 ${target.attempt + 1} 次尝试`,
          'info',
          target.id,
        ),
      ],
    }
    this.publish(retried)
    return this.execute(retried)
  }

  async cancel(runId: string) {
    const current = this.runs.get(runId)
    if (
      !current ||
      (current.status !== 'pending' && current.status !== 'running')
    ) {
      return undefined
    }
    for (const node of current.nodes) {
      if (node.status === 'running') this.controllers.get(node.id)?.abort()
      this.clearProgress(node.id)
    }
    const timestamp = this.now()
    const cancelled: WorkflowRun = {
      ...current,
      status: 'cancelled',
      updatedAt: timestamp,
      finishedAt: timestamp,
      nodes: current.nodes.map((node) =>
        node.status === 'pending' || node.status === 'running'
          ? {
              ...node,
              status: 'cancelled',
              finishedAt: timestamp,
              error: undefined,
            }
          : node,
      ),
      logs: [
        ...current.logs,
        this.logEntry('运行已取消', 'info'),
      ],
    }
    this.publish(cancelled)
    await this.flushPersistence()
    return cancelled
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const controller of this.controllers.values()) controller.abort()
    for (const taskId of this.progressTimers.keys()) this.clearProgress(taskId)
    this.controllers.clear()
  }

  private async executeRun(runId: string) {
    let current = this.runs.get(runId)!
    if (current.status === 'cancelled' || current.status === 'succeeded') {
      return current
    }
    const timestamp = this.now()
    current = {
      ...current,
      status: 'running',
      startedAt: current.startedAt ?? timestamp,
      finishedAt: undefined,
      updatedAt: timestamp,
      logs: [
        ...current.logs,
        this.logEntry('运行已开始', 'info'),
      ],
    }
    this.publish(current)

    const pendingIds = current.nodes
      .filter(({ status }) => status === 'pending')
      .sort((left, right) => left.order - right.order)
      .map(({ id }) => id)

    if (current.mode === 'parallel') {
      await Promise.all(pendingIds.map((id) => this.executeNode(runId, id)))
    } else {
      for (const id of pendingIds) {
        await this.executeNode(runId, id)
        const latest = this.runs.get(runId)!
        const node = latest.nodes.find((candidate) => candidate.id === id)
        if (node?.status !== 'succeeded') break
      }
    }

    current = this.runs.get(runId)!
    if (this.disposed || current.status === 'cancelled') {
      await this.flushPersistence()
      return current
    }
    const finishedAt = this.now()
    const status = current.nodes.some((node) => node.status === 'failed')
      ? 'failed'
      : current.nodes.every((node) => node.status === 'succeeded')
        ? 'succeeded'
        : current.nodes.some((node) => node.status === 'cancelled')
          ? 'cancelled'
          : 'pending'
    current = {
      ...current,
      status,
      updatedAt: finishedAt,
      ...(status === 'pending' ? {} : { finishedAt }),
      logs: [
        ...current.logs,
        this.logEntry(
          status === 'succeeded'
            ? '运行已完成'
            : status === 'failed'
              ? '运行已暂停，请重试失败节点'
              : '运行已停止',
          status === 'failed' ? 'error' : 'info',
        ),
      ],
    }
    this.publish(current)
    await this.flushPersistence()
    return current
  }

  private async executeNode(runId: string, nodeRunId: string) {
    const before = this.runs.get(runId)
    const node = before?.nodes.find(({ id }) => id === nodeRunId)
    if (!before || node?.status !== 'pending' || this.disposed) return

    const attempt = node.attempt
    const controller = new AbortController()
    this.controllers.set(nodeRunId, controller)
    const startedAt = this.now()
    this.updateNode(runId, nodeRunId, attempt, (currentNode) => ({
      ...currentNode,
      status: 'running',
      progress: 10,
      startedAt,
      finishedAt: undefined,
      error: undefined,
    }), `开始执行“${node.nodeTitle}”`)

    const progressIntervalMs = this.options.progressIntervalMs ?? 300
    this.progressTimers.set(
      nodeRunId,
      setInterval(() => {
        this.updateNode(runId, nodeRunId, attempt, (currentNode) =>
          currentNode.status === 'running'
            ? { ...currentNode, progress: Math.min(90, currentNode.progress + 15) }
            : currentNode,
        )
      }, progressIntervalMs),
    )

    let result: GenerationResult
    try {
      result = await this.options.adapter.start(node.request, controller.signal)
      this.clearProgress(nodeRunId)
      if (!this.isCurrentRunning(runId, nodeRunId, attempt) || this.disposed) return
      const normalizedResult: GenerationResult = {
        ...result,
        version: {
          ...result.version,
          assetId: result.asset.id,
          generationJobId: nodeRunId,
        },
      }
      if (result.version.assetId !== result.asset.id) {
        throw new Error('Workflow result asset reference mismatch')
      }
      await this.options.onNodeSuccess(
        this.runs.get(runId)!.nodes.find(({ id }) => id === nodeRunId)!,
        normalizedResult,
      )
    } catch (error) {
      this.clearProgress(nodeRunId)
      if (
        this.disposed ||
        !this.isCurrentRunning(runId, nodeRunId, attempt) ||
        isAbortError(error)
      ) {
        return
      }
      const message = error instanceof Error ? error.message : 'Workflow node failed'
      this.updateNode(
        runId,
        nodeRunId,
        attempt,
        (currentNode) => ({
          ...currentNode,
          status: 'failed',
          finishedAt: this.now(),
          error: message,
        }),
        `节点“${node.nodeTitle}”失败：${message}`,
        'error',
      )
      return
    } finally {
      if (this.controllers.get(nodeRunId) === controller) {
        this.controllers.delete(nodeRunId)
      }
    }

    if (!this.isCurrentRunning(runId, nodeRunId, attempt) || this.disposed) return
    this.updateNode(
      runId,
      nodeRunId,
      attempt,
      (currentNode) => ({
        ...currentNode,
        status: 'succeeded',
        progress: 100,
        finishedAt: this.now(),
        error: undefined,
      }),
      `节点“${node.nodeTitle}”已完成`,
    )
  }

  private updateNode(
    runId: string,
    nodeRunId: string,
    attempt: number,
    mutate: (node: WorkflowNodeRun) => WorkflowNodeRun,
    logMessage?: string,
    logLevel: 'info' | 'error' = 'info',
  ) {
    const current = this.runs.get(runId)
    if (!current) return
    const existing = current.nodes.find(({ id }) => id === nodeRunId)
    if (!existing || existing.attempt !== attempt) return
    const nextNode = mutate(existing)
    if (nextNode === existing && !logMessage) return
    const timestamp = this.now()
    const next: WorkflowRun = {
      ...current,
      updatedAt: timestamp,
      nodes: current.nodes.map((node) =>
        node.id === nodeRunId ? nextNode : node,
      ),
      logs: logMessage
        ? [
            ...current.logs,
            this.logEntry(logMessage, logLevel, nodeRunId, timestamp),
          ]
        : current.logs,
    }
    this.publish(next)
  }

  private isCurrentRunning(runId: string, nodeRunId: string, attempt: number) {
    const run = this.runs.get(runId)
    const node = run?.nodes.find(({ id }) => id === nodeRunId)
    return run?.status === 'running' && node?.status === 'running' && node.attempt === attempt
  }

  private publish(run: WorkflowRun) {
    this.runs.set(run.id, run)
    this.lastRunId = run.id
    this.options.onRunChange(run)
    if (this.options.persistRun) {
      const snapshot = run
      this.persistenceChain = this.persistenceChain
        .then(() => this.options.persistRun!(snapshot))
        .catch(() => undefined)
    }
  }

  private logEntry(
    message: string,
    level: 'info' | 'error',
    nodeRunId?: string,
    timestamp = this.now(),
  ) {
    return {
      id: this.options.randomId?.() ?? crypto.randomUUID(),
      timestamp,
      level,
      message,
      ...(nodeRunId ? { nodeRunId } : {}),
    }
  }

  private clearProgress(nodeRunId: string) {
    const timer = this.progressTimers.get(nodeRunId)
    if (timer !== undefined) clearInterval(timer)
    this.progressTimers.delete(nodeRunId)
  }

  private now() {
    return this.options.now?.() ?? new Date().toISOString()
  }

  private async flushPersistence() {
    await this.persistenceChain
  }
}
