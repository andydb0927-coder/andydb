import { beforeEach, describe, expect, test } from 'vitest'

import {
  createLocalAccountPreferenceStore,
  LOCAL_ACCOUNT_PREFERENCES_KEY,
} from './local-account-preferences'

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

describe('local account preferences', () => {
  test('starts with an honest local identity and safe creation preferences', () => {
    expect(createLocalAccountPreferenceStore(storage).read()).toEqual({
      version: 1,
      displayName: '本机创作者',
      aiWatermark: true,
      inAppNotifications: true,
    })
  })

  test.each([
    ['malformed JSON', '{not-json'],
    ['unknown version', JSON.stringify({ version: 2 })],
    ['invalid structure', JSON.stringify({ version: 1, displayName: 42 })],
  ])('falls back for %s', (_case, serialized) => {
    storage.setItem(LOCAL_ACCOUNT_PREFERENCES_KEY, serialized)

    expect(createLocalAccountPreferenceStore(storage).read().displayName).toBe('本机创作者')
  })

  test('normalizes and persists only known device-local fields', () => {
    const store = createLocalAccountPreferenceStore(
      storage,
      () => new Date('2026-08-13T09:00:00.000Z'),
    )

    const saved = store.write({
      displayName: '  安迪导演  ',
      aiWatermark: false,
      inAppNotifications: false,
      token: 'must-not-persist',
    })

    expect(saved).toEqual({
      version: 1,
      displayName: '安迪导演',
      aiWatermark: false,
      inAppNotifications: false,
      updatedAt: '2026-08-13T09:00:00.000Z',
    })
    expect(storage.getItem(LOCAL_ACCOUNT_PREFERENCES_KEY)).not.toContain('token')
  })

  test('falls back for a blank name and tolerates unavailable storage', () => {
    const store = createLocalAccountPreferenceStore(new ThrowingStorage())

    expect(store.read().displayName).toBe('本机创作者')
    expect(() => store.write({ displayName: ' ', aiWatermark: true, inAppNotifications: true })).not.toThrow()
    expect(store.write({ displayName: ' ', aiWatermark: true, inAppNotifications: true }).displayName).toBe('本机创作者')
  })
})
