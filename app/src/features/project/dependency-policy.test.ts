import { describe, expect, test } from 'vitest'

import type { CanvasNode, NodeKind, Project } from './model'
import {
  connectionFailureMessage,
  validateDependencyConnection,
} from './dependency-policy'

const kinds: NodeKind[] = [
  'character',
  'character-card',
  'scene',
  'script',
  'text',
  'image',
  'storyboard',
  'video',
  'preview',
  'worldview',
]
const allowed = new Set([
  'character:storyboard',
  'character:video',
  'scene:storyboard',
  'scene:video',
  'text:storyboard',
  'text:video',
  'image:storyboard',
  'image:video',
  'preview:storyboard',
  'preview:video',
  'storyboard:video',
  'video:image',
  'video:storyboard',
  'script:script',
  'script:character-card',
  'script:worldview',
  'script:storyboard',
  'script:video',
  'character-card:script',
  'character-card:character-card',
  'character-card:worldview',
  'character-card:storyboard',
  'character-card:video',
  'worldview:script',
  'worldview:character-card',
  'worldview:worldview',
  'worldview:storyboard',
  'worldview:video',
])

function node(id: string, kind: NodeKind): CanvasNode {
  return {
    id,
    kind,
    title: id,
    position: { x: 0, y: 0 },
    versions: [],
    activeVersionId: '',
    sourceChanged: false,
  }
}

function project(sourceKind: NodeKind, targetKind: NodeKind): Project {
  return {
    id: 'policy-project',
    title: '规则测试',
    intent: '测试连接规则',
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
    assets: [],
    nodes: [node('source', sourceKind), node('target', targetKind)],
    edges: [],
    timeline: [],
    jobs: [],
    exportJobs: [],
  }
}

describe('dependency connection policy', () => {
  test.each(
    kinds.flatMap((source) => kinds.map((target) => [source, target] as const)),
  )('%s -> %s follows the approved type matrix', (sourceKind, targetKind) => {
    const result = validateDependencyConnection(
      project(sourceKind, targetKind),
      'source',
      'target',
    )
    expect(result.ok).toBe(allowed.has(`${sourceKind}:${targetKind}`))
    if (!result.ok && !allowed.has(`${sourceKind}:${targetKind}`)) {
      expect(result.reason).toBe('incompatible-types')
    }
  })

  test('reports missing, self, duplicate, and legacy-backed cycles without mutation', () => {
    const base = project('text', 'storyboard')
    expect(validateDependencyConnection(base, 'missing', 'target')).toEqual({
      ok: false,
      reason: 'missing-node',
    })
    expect(validateDependencyConnection(base, 'source', 'source')).toEqual({
      ok: false,
      reason: 'self-connection',
    })
    const duplicate = {
      ...base,
      edges: [{ id: 'existing', sourceNodeId: 'source', targetNodeId: 'target' }],
    }
    expect(validateDependencyConnection(duplicate, 'source', 'target')).toEqual({
      ok: false,
      reason: 'duplicate',
    })
    const legacyBackEdge = {
      ...base,
      edges: [{ id: 'legacy', sourceNodeId: 'target', targetNodeId: 'source' }],
    }
    expect(validateDependencyConnection(legacyBackEdge, 'source', 'target')).toEqual({
      ok: false,
      reason: 'cycle',
    })
    expect(connectionFailureMessage('cycle')).toBe('此连接会形成循环依赖')
  })

  test('prioritizes a cycle over an otherwise incompatible source type', () => {
    const base = project('video', 'character')
    const downstreamPath = {
      ...base,
      edges: [
        {
          id: 'character-to-video',
          sourceNodeId: 'target',
          targetNodeId: 'source',
        },
      ],
    }

    expect(
      validateDependencyConnection(downstreamPath, 'source', 'target'),
    ).toEqual({
      ok: false,
      reason: 'cycle',
    })
  })
})
