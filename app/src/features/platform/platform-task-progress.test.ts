import { beforeEach, describe, expect, test } from 'vitest'

import {
  createPlatformTaskProgressStore,
  PLATFORM_TASK_PROGRESS_KEY,
} from './platform-task-progress'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

class ThrowingStorage extends MemoryStorage {
  override getItem(): string | null { throw new Error('read failed') }
  override setItem(): void { throw new Error('write failed') }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
})

describe('platform task progress persistence', () => {
  test.each([
    ['malformed JSON', '{not-json'],
    ['wrong version', JSON.stringify({ version: 2, statuses: {} })],
    ['invalid statuses', JSON.stringify({ version: 1, statuses: [] })],
  ])('falls back safely for %s', (_case, serialized) => {
    storage.setItem(PLATFORM_TASK_PROGRESS_KEY, serialized)
    const snapshot = createPlatformTaskProgressStore(storage).read()

    expect(snapshot.statuses['platform-shell']).toBe('completed')
    expect(snapshot.statuses['account-space']).toBe('in-progress')
  })

  test('persists known task statuses and removes unknown task ids', () => {
    const store = createPlatformTaskProgressStore(
      storage,
      () => new Date('2026-08-13T08:00:00.000Z'),
    )

    store.write({
      'platform-shell': 'completed',
      'account-space': 'completed',
      unknown: 'completed',
    })

    expect(store.read()).toMatchObject({
      version: 1,
      updatedAt: '2026-08-13T08:00:00.000Z',
      statuses: {
        'platform-shell': 'completed',
        'account-space': 'completed',
      },
    })
    expect(store.read().statuses).not.toHaveProperty('unknown')
  })

  test('does not let unavailable browser storage block the platform shell', () => {
    const store = createPlatformTaskProgressStore(new ThrowingStorage())

    expect(store.read().statuses['platform-shell']).toBe('completed')
    expect(() => store.write({ 'platform-shell': 'pending' })).not.toThrow()
  })
})
