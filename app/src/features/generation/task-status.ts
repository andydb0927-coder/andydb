/** Persisted values are deliberately unchanged; provider wire states stop at the adapter. */
export const TASK_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const
export type TaskStatus = typeof TASK_STATUSES[number]

const taskPolicy: Record<TaskStatus, {
  active: boolean
  retryable: boolean
  next: readonly TaskStatus[]
}> = {
  queued: { active: true, retryable: false, next: ['running', 'cancelled'] },
  running: { active: true, retryable: false, next: ['succeeded', 'failed', 'cancelled'] },
  succeeded: { active: false, retryable: false, next: [] },
  failed: { active: false, retryable: true, next: ['queued'] },
  cancelled: { active: false, retryable: true, next: ['queued'] },
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && TASK_STATUSES.some(status => status === value)
}

export function isActiveTask(status: TaskStatus) {
  return taskPolicy[status].active
}

export function isRetryableTask(status: TaskStatus) {
  return taskPolicy[status].retryable
}

export function isTerminalTask(status: TaskStatus) {
  return !isActiveTask(status)
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus) {
  return from === to || taskPolicy[from].next.includes(to)
}

/** Aliases must be explicit per protocol; never treat an unknown wire value as success. */
export function normalizeTaskStatus(
  value: unknown,
  aliases: Readonly<Record<string, TaskStatus>> = {},
): TaskStatus | undefined {
  if (isTaskStatus(value)) return value
  if (typeof value !== 'string' || !Object.hasOwn(aliases, value)) return undefined
  const status = aliases[value]
  return isTaskStatus(status) ? status : undefined
}
