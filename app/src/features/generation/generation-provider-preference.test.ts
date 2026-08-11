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

class ThrowingReadStorage extends MemoryStorage {
  override getItem(_key: string): string | null {
    throw new Error('storage read failed')
  }
}

class ThrowingWriteStorage extends MemoryStorage {
  override setItem(_key: string, _value: string): void {
    throw new Error('storage write failed')
  }
}

const completeSelection = {
  projectUuid: '11111111-2222-3333-4444-555555555555',
  projectName: '低成本验收',
  imageModelName: 'Image Model',
  videoModelName: 'Video Model',
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
      selection: completeSelection,
    })

    expect(store.read().provider).toBe('libtv')
  })

  test('normalizes the persisted provider discriminator', () => {
    const store = createGenerationProviderPreferenceStore(storage)
    storage.setItem(
      GENERATION_PROVIDER_KEY,
      JSON.stringify({ provider: ' libtv ', selection: completeSelection }),
    )

    expect(store.read()).toEqual({
      provider: 'libtv',
      selection: {
        projectUuid: '11111111-2222-3333-4444-555555555555',
        projectName: '低成本验收',
        imageModelName: 'Image Model',
        videoModelName: 'Video Model',
      },
    })
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

  test.each([
    [
      'an invalid UUID',
      { ...completeSelection, projectUuid: 'not-a-uuid' },
      { provider: 'demo' },
    ],
    [
      'a non-string project UUID',
      { ...completeSelection, projectUuid: 123 },
      { provider: 'demo' },
    ],
    [
      'a non-string project name',
      { ...completeSelection, projectName: false },
      { provider: 'demo' },
    ],
    [
      'a non-string image model name',
      { ...completeSelection, imageModelName: null },
      { provider: 'demo' },
    ],
    [
      'a non-string video model name',
      { ...completeSelection, videoModelName: ['Video Model'] },
      { provider: 'demo' },
    ],
    [
      'a complete selection with surrounding whitespace',
      {
        projectUuid: ' 11111111-2222-3333-4444-555555555555 ',
        projectName: ' 低成本验收 ',
        imageModelName: ' Image Model ',
        videoModelName: ' Video Model ',
      },
      {
        provider: 'libtv',
        selection: {
          projectUuid: '11111111-2222-3333-4444-555555555555',
          projectName: '低成本验收',
          imageModelName: 'Image Model',
          videoModelName: 'Video Model',
        },
      },
    ],
  ])('handles %s strictly', (_case, selection, expected) => {
    const store = createGenerationProviderPreferenceStore(storage)
    storage.setItem(
      GENERATION_PROVIDER_KEY,
      JSON.stringify({ provider: 'libtv', selection }),
    )

    expect(store.read()).toEqual(expected)
  })

  test('falls back to Demo when storage throws while reading', () => {
    const store = createGenerationProviderPreferenceStore(
      new ThrowingReadStorage(),
    )

    expect(store.read()).toEqual({ provider: 'demo' })
  })

  test('does not leak a storage write failure to the caller', () => {
    const store = createGenerationProviderPreferenceStore(
      new ThrowingWriteStorage(),
    )

    expect(() =>
      store.write({ provider: 'libtv', selection: completeSelection }),
    ).not.toThrow()
  })
})
