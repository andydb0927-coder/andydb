import { describe, expect, test, vi } from 'vitest'

import type { GenerationResult } from './generation-adapter'
import { EphemeralGenerationResultStore } from './ephemeral-generation-result-store'

const result: GenerationResult = {
  persistence: 'ephemeral',
  asset: {
    id: 'ephemeral-asset',
    kind: 'video',
    url: 'https://media.fixture.invalid/result.mp4',
    mimeType: 'video/mp4',
    durationSeconds: 5,
  },
  version: {
    id: 'ephemeral-version',
    assetId: 'ephemeral-asset',
    prompt: '雨夜推进镜头',
    createdAt: '2026-08-21T00:00:00.000Z',
  },
}

describe('ephemeral generation result store', () => {
  test('keys results by project and node and notifies subscribers', () => {
    const store = new EphemeralGenerationResultStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.set('project-a', 'node-a', result)

    expect(store.get('project-a', 'node-a')).toEqual(result)
    expect(store.get('project-a', 'node-b')).toBeUndefined()
    expect(store.get('project-b', 'node-a')).toBeUndefined()
    expect(listener).toHaveBeenCalledOnce()

    unsubscribe()
    store.clear('project-a', 'node-a')
    expect(store.get('project-a', 'node-a')).toBeUndefined()
    expect(listener).toHaveBeenCalledOnce()
  })

  test('never writes browser persistence or mutates the project snapshot', () => {
    const project = {
      id: 'project-a',
      assets: [] as unknown[],
      jobs: [] as unknown[],
      nodes: [{ id: 'node-a', versions: [] as unknown[] }],
    }
    const before = structuredClone(project)
    const localWrite = vi.spyOn(Storage.prototype, 'setItem')
    const store = new EphemeralGenerationResultStore()

    store.set('project-a', 'node-a', result)

    expect(project).toEqual(before)
    expect(project.assets).toHaveLength(0)
    expect(project.jobs).toHaveLength(0)
    expect(project.nodes[0].versions).toHaveLength(0)
    expect(localWrite).not.toHaveBeenCalled()
  })
})
