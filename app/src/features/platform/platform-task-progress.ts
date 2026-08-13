import {
  defaultPlatformTaskStatuses,
  isPlatformTaskStatus,
  platformTasks,
  type PlatformTaskId,
  type PlatformTaskStatus,
  type PlatformTaskStatuses,
} from './platform-tasks'

export const PLATFORM_TASK_PROGRESS_KEY = 'wireless-canvas:platform-task-progress:v1'

export interface PlatformTaskProgressSnapshot {
  version: 1
  updatedAt?: string
  statuses: PlatformTaskStatuses
}

export interface PlatformTaskProgressStore {
  read(): PlatformTaskProgressSnapshot
  write(statuses: Partial<Record<string, PlatformTaskStatus>>): PlatformTaskProgressSnapshot
}

function defaultSnapshot(): PlatformTaskProgressSnapshot {
  return {
    version: 1,
    statuses: { ...defaultPlatformTaskStatuses },
  }
}

function normalizeSnapshot(value: unknown): PlatformTaskProgressSnapshot {
  if (!value || typeof value !== 'object') return defaultSnapshot()
  const candidate = value as {
    version?: unknown
    updatedAt?: unknown
    statuses?: unknown
  }
  if (
    candidate.version !== 1 ||
    !candidate.statuses ||
    typeof candidate.statuses !== 'object' ||
    Array.isArray(candidate.statuses)
  ) {
    return defaultSnapshot()
  }

  const source = candidate.statuses as Record<string, unknown>
  const statuses = { ...defaultPlatformTaskStatuses }
  for (const task of platformTasks) {
    const status = source[task.id]
    if (isPlatformTaskStatus(status)) {
      statuses[task.id] = status
    }
  }

  return {
    version: 1,
    ...(typeof candidate.updatedAt === 'string'
      ? { updatedAt: candidate.updatedAt }
      : {}),
    statuses,
  }
}

class BrowserPlatformTaskProgressStore implements PlatformTaskProgressStore {
  private readonly storage: Storage | undefined
  private readonly now: () => Date

  constructor(
    storage: Storage | undefined,
    now: () => Date,
  ) {
    this.storage = storage
    this.now = now
  }

  read(): PlatformTaskProgressSnapshot {
    try {
      const serialized = this.storage?.getItem(PLATFORM_TASK_PROGRESS_KEY)
      return serialized ? normalizeSnapshot(JSON.parse(serialized)) : defaultSnapshot()
    } catch {
      return defaultSnapshot()
    }
  }

  write(
    input: Partial<Record<string, PlatformTaskStatus>>,
  ): PlatformTaskProgressSnapshot {
    const statuses = { ...defaultPlatformTaskStatuses }
    for (const task of platformTasks) {
      const status = input[task.id]
      if (isPlatformTaskStatus(status)) {
        statuses[task.id] = status
      }
    }
    const snapshot: PlatformTaskProgressSnapshot = {
      version: 1,
      updatedAt: this.now().toISOString(),
      statuses,
    }
    try {
      this.storage?.setItem(PLATFORM_TASK_PROGRESS_KEY, JSON.stringify(snapshot))
    } catch {
      // The roadmap remains usable when browser storage is unavailable.
    }
    return snapshot
  }
}

export function createPlatformTaskProgressStore(
  storage: Storage | undefined =
    typeof localStorage === 'undefined' ? undefined : localStorage,
  now: () => Date = () => new Date(),
): PlatformTaskProgressStore {
  return new BrowserPlatformTaskProgressStore(storage, now)
}

export function updatePlatformTaskStatus(
  statuses: PlatformTaskStatuses,
  taskId: PlatformTaskId,
  status: PlatformTaskStatus,
): PlatformTaskStatuses {
  return { ...statuses, [taskId]: status }
}
