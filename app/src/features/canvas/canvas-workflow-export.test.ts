import { describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import {
  buildWorkflowFilename,
  createCanvasSnapshotDataUrl,
  createWorkflowSnapshot,
  estimateCanvasExport,
  parseWorkflowImport,
  prepareWorkflowMerge,
  renderCanvasSvg,
} from './canvas-workflow-export'

describe('canvas export', () => {
  test('estimates current viewport and every node outer bound', () => {
    const project = makeProjectFixture()
    const viewport = { x: -40, y: 24, zoom: 0.8, width: 1280, height: 720 }

    expect(estimateCanvasExport(project, 'viewport', viewport)).toMatchObject({
      width: 1280,
      height: 720,
      transform: { x: -40, y: 24, zoom: 0.8 },
    })
    expect(
      estimateCanvasExport(project, 'all', viewport, {
        'shot-1': { width: 320, height: 240 },
        'rain-audio': { width: 360, height: 220 },
      }),
    ).toMatchObject({
      width: 888,
      height: 368,
      transform: { x: -56, y: -176, zoom: 1 },
    })
  })

  test('renders a self-contained vector snapshot with graph labels', () => {
    const project = makeProjectFixture()
    const estimate = estimateCanvasExport(project, 'viewport', {
      x: 0,
      y: 0,
      zoom: 1,
      width: 800,
      height: 600,
    })
    const svg = renderCanvasSvg(project, estimate)

    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0 800 600"')
    expect(svg).toContain('霜河渡')
    expect(svg).toContain('data-edge-id=')
  })

  test('builds a durable SVG data URL for a published canvas snapshot', () => {
    const snapshotUrl = createCanvasSnapshotDataUrl(makeProjectFixture())

    expect(snapshotUrl).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    expect(decodeURIComponent(snapshotUrl)).toContain('<svg')
    expect(decodeURIComponent(snapshotUrl)).toContain('霜河渡')
  })
})

describe('workflow JSON', () => {
  test('exports a complete, timestamped project snapshot', () => {
    const project = makeProjectFixture()
    const now = new Date('2026-08-15T03:04:05.000Z')
    const snapshot = createWorkflowSnapshot(project, now)

    expect(snapshot).toEqual({
      format: 'wireless-canvas-workflow',
      version: 1,
      exportedAt: now.toISOString(),
      project,
    })
    expect(buildWorkflowFilename('霜河/渡', now)).toBe(
      '霜河-渡-工作流-20260815-110405.json',
    )
  })

  test('keeps mirror and structured annotation layers in workflow JSON', () => {
    const project = makeProjectFixture()
    project.nodes[0] = {
      ...project.nodes[0],
      mirrorHorizontal: true,
      mirrorVertical: false,
      imageAnnotations: [
        {
          id: 'annotation-1',
          kind: 'arrow',
          color: '#ff3b30',
          lineWidth: 4,
          start: { x: 0.1, y: 0.2 },
          end: { x: 0.8, y: 0.7 },
        },
      ],
    }

    const exported = createWorkflowSnapshot(project).project.nodes[0]
    expect(exported.mirrorHorizontal).toBe(true)
    expect(exported.imageAnnotations).toEqual(project.nodes[0].imageAnnotations)
  })

  test('reports duplicate titles and rejects missing graph references', () => {
    const current = makeProjectFixture()
    const imported = {
      ...current,
      id: 'imported-project',
      nodes: [
        { ...current.nodes[0], id: 'import-node', title: current.nodes[0].title },
      ],
      edges: [
        {
          id: 'broken-edge',
          sourceNodeId: 'import-node',
          targetNodeId: 'missing-node',
        },
      ],
    }
    const result = parseWorkflowImport(
      JSON.stringify({
        format: 'wireless-canvas-workflow',
        version: 1,
        exportedAt: '2026-08-15T03:04:05.000Z',
        project: imported,
      }),
      current,
    )

    expect(result.valid).toBe(false)
    expect(result.titleConflicts).toEqual([current.nodes[0].title])
    expect(result.missingReferences).toContain('连线 broken-edge 的目标节点 missing-node 不存在')
  })

  test('rejects malformed nested records without throwing during validation', () => {
    const current = makeProjectFixture()
    const malformed = {
      ...createWorkflowSnapshot(current),
      project: {
        ...current,
        assets: [null],
        nodes: [{ id: 'bad-node', title: '损坏节点', versions: null }],
        edges: [null],
      },
    }

    expect(() => parseWorkflowImport(JSON.stringify(malformed), current)).not.toThrow()
    expect(
      parseWorkflowImport(JSON.stringify(malformed), current),
    ).toMatchObject({ valid: false })
  })

  test('remaps imported identities while preserving parameters and positions', () => {
    const current = makeProjectFixture()
    const imported = {
      ...current,
      id: 'imported-project',
      nodes: current.nodes.map((node, index) => ({
        ...node,
        id: `import-node-${index}`,
        position: { x: node.position.x + 20, y: node.position.y + 40 },
        ...(index === 0
          ? {
              card: {
                kind: 'script' as const,
                scenes: '雨夜码头',
                dialogue: '别回头。',
                shotNotes: '近景',
                imageAssetId: current.assets[0].id,
              },
            }
          : {}),
      })),
      edges: [
        {
          id: 'import-edge',
          sourceNodeId: 'import-node-0',
          targetNodeId: 'import-node-1',
        },
      ],
    }
    const result = parseWorkflowImport(
      JSON.stringify(createWorkflowSnapshot(imported)),
      current,
    )
    expect(result.valid).toBe(true)

    const merge = prepareWorkflowMerge(result.snapshot!, () => 'new-id')
    expect(merge.nodes).toHaveLength(2)
    expect(merge.nodes[0].id).not.toBe('import-node-0')
    expect(merge.nodes[0].position).toEqual(imported.nodes[0].position)
    expect(merge.nodes[0].versions[0].prompt).toBe(
      imported.nodes[0].versions[0].prompt,
    )
    expect(merge.nodes[0].card?.imageAssetId).toBe(merge.assets[0].id)
    expect(merge.edges[0]).toMatchObject({
      sourceNodeId: merge.nodes[0].id,
      targetNodeId: merge.nodes[1].id,
    })
  })
})
