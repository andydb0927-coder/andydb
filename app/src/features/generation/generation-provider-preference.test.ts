import { beforeEach, describe, expect, test } from 'vitest'

import {
  createGenerationProviderPreferenceStore,
  GENERATION_PROVIDER_KEY,
} from './generation-provider-preference'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
})

describe('generation provider preference', () => {
  test('falls back to demo when persisted provider JSON is malformed', () => {
    const store = createGenerationProviderPreferenceStore(storage)
    storage.setItem(GENERATION_PROVIDER_KEY, '{not-json')

    expect(store.read()).toEqual({ provider: 'demo' })
  })

  test('accepts only a complete LibTV selection', () => {
    const store = createGenerationProviderPreferenceStore(storage)

    store.write({
      provider: 'libtv',
      selection: {
        projectUuid: '11111111-2222-3333-4444-555555555555',
        projectName: '低成本验收',
        imageModelName: 'Image Model',
        videoModelName: 'Video Model',
      },
    })

    expect(store.read().provider).toBe('libtv')
  })

  test('falls back to demo when a LibTV selection has a blank model name', () => {
    const store = createGenerationProviderPreferenceStore(storage)
    storage.setItem(
      GENERATION_PROVIDER_KEY,
      JSON.stringify({
        provider: 'libtv',
        selection: {
          projectUuid: '11111111-2222-3333-4444-555555555555',
          projectName: '低成本验收',
          imageModelName: 'Image Model',
          videoModelName: ' ',
        },
      }),
    )

    expect(store.read()).toEqual({ provider: 'demo' })
  })
})
