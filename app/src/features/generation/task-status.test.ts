import { describe, expect, expectTypeOf, test } from 'vitest'

import type { ExportJob, GenerationJob, JobStatus } from '../project/model'
import {
  TASK_STATUSES,
  canTransitionTask,
  isActiveTask,
  isRetryableTask,
  isTaskStatus,
  isTerminalTask,
  normalizeTaskStatus,
  type TaskStatus,
} from './task-status'

describe('统一任务状态契约', () => {
  test('兼容已有持久化状态与JobStatus导入', () => {
    expect(TASK_STATUSES).toEqual(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
    expectTypeOf<GenerationJob['status']>().toEqualTypeOf<TaskStatus>()
    expectTypeOf<ExportJob['status']>().toEqualTypeOf<TaskStatus>()
    expectTypeOf<JobStatus>().toEqualTypeOf<TaskStatus>()
  })

  test('活动、终态和重试策略来自同一状态集合', () => {
    expect(TASK_STATUSES.filter(isActiveTask)).toEqual(['queued', 'running'])
    expect(TASK_STATUSES.filter(isTerminalTask)).toEqual(['succeeded', 'failed', 'cancelled'])
    expect(TASK_STATUSES.filter(isRetryableTask)).toEqual(['failed', 'cancelled'])
    expect(TASK_STATUSES.every(isTaskStatus)).toBe(true)
  })

  test('保留排队执行、主动取消、失败重试和进度更新的转移', () => {
    const transitions = {
      queued: ['queued', 'running', 'cancelled'],
      running: ['running', 'succeeded', 'failed', 'cancelled'],
      succeeded: ['succeeded'],
      failed: ['failed', 'queued'],
      cancelled: ['cancelled', 'queued'],
    }
    for (const from of TASK_STATUSES) {
      for (const to of TASK_STATUSES) {
        expect(canTransitionTask(from, to)).toBe(transitions[from].includes(to))
      }
    }
  })

  test('仅在供应商边界显式转换别名，未知值不能默认为成功', () => {
    const aliases = { pending: 'queued', expired: 'failed' } as const
    expect(normalizeTaskStatus('pending', aliases)).toBe('queued')
    expect(normalizeTaskStatus('expired', aliases)).toBe('failed')
    expect(normalizeTaskStatus('cancelled', aliases)).toBe('cancelled')
    for (const invalid of ['pending', 'complete', 'constructor', '__proto__', '', 0, {}, null]) {
      expect(normalizeTaskStatus(invalid)).toBeUndefined()
      expect(isTaskStatus(invalid)).toBe(false)
    }
    expect(normalizeTaskStatus('constructor', aliases)).toBeUndefined()
  })
})
