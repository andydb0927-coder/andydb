import { describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import type { CanvasNode, Project } from '../project/model'
import {
  buildWorkflowRun,
  executableWorkflowNodes,
  normalizeInterruptedRun,
  workflowProgress,
} from './workflow-model'

function node(
  id: string,
  kind: CanvasNode['kind'],
  x: number,
  y: number,
): CanvasNode {
  return {
    id,
    kind,
    title: id,
    position: { x, y },
    versions: [
      {
        id: `version-${id}`,
        createdAt: '2026-08-13T08:00:00.000Z',
        prompt: `prompt-${id}`,
        assetId: `asset-${id}`,
      },
    ],
    activeVersionId: `version-${id}`,
    sourceChanged: false,
  }
}

function workflowProject(): Project {
  const base = makeProjectFixture()
  return {
    ...base,
    id: 'project-workflow',
    nodes: [
      node('video-b', 'video', 640, 120),
      node('storyboard-a', 'storyboard', 320, 120),
      node('image-c', 'image', 80, 320),
      node('script-card', 'script', 0, 0),
    ],
    assets: ['video-b', 'storyboard-a', 'image-c'].map((id) => ({
      id: `asset-${id}`,
      kind: id === 'video-b' ? ('video' as const) : ('image' as const),
      url: `/demo/${id}.png`,
      mimeType: id === 'video-b' ? 'video/mp4' : 'image/png',
    })),
    edges: [
      {
        id: 'edge-c-a',
        sourceNodeId: 'image-c',
        targetNodeId: 'storyboard-a',
      },
      {
        id: 'edge-a-b',
        sourceNodeId: 'storyboard-a',
        targetNodeId: 'video-b',
      },
    ],
    jobs: [],
  }
}

describe('workflow model', () => {
  test('filters selection to image, storyboard, and video generation nodes', () => {
    const project = workflowProject()

    expect(
      executableWorkflowNodes(project, new Set(project.nodes.map(({ id }) => id)))
        .map(({ id }) => id),
    ).toEqual(['image-c', 'storyboard-a', 'video-b'])
  })

  test('orders the selected dependency subgraph before canvas position', () => {
    const project = workflowProject()

    const run = buildWorkflowRun(
      project,
      new Set(['video-b', 'storyboard-a', 'image-c', 'script-card']),
      'serial',
      {
        now: () => '2026-08-13T09:00:00.000Z',
        randomId: (() => {
          const ids = ['run-1', 'task-c', 'task-a', 'task-b']
          return () => ids.shift()!
        })(),
      },
    )

    expect(run.nodes.map(({ nodeId }) => nodeId)).toEqual([
      'image-c',
      'storyboard-a',
      'video-b',
    ])
    expect(run.nodes.map(({ order }) => order)).toEqual([0, 1, 2])
    expect(run.status).toBe('pending')
    expect(run.mode).toBe('serial')
  })

  test('uses canvas position as a deterministic tie breaker and snapshots requests', () => {
    const project = { ...workflowProject(), edges: [] }

    const run = buildWorkflowRun(
      project,
      ['video-b', 'storyboard-a', 'image-c'],
      'parallel',
    )

    expect(run.nodes.map(({ nodeId }) => nodeId)).toEqual([
      'image-c',
      'storyboard-a',
      'video-b',
    ])
    expect(run.nodes[1].request).toEqual({
      projectId: 'project-workflow',
      nodeId: 'storyboard-a',
      operation: 'regenerate',
      targetKind: 'image',
      prompt: 'prompt-storyboard-a',
      referenceAssets: [
        {
          url: '/demo/storyboard-a.png',
          kind: 'image',
          mimeType: 'image/png',
        },
      ],
    })
    expect(run.nodes[2].request.targetKind).toBe('video')

    project.nodes[1].versions[0].prompt = 'changed-later'
    expect(run.nodes[1].request.prompt).toBe('prompt-storyboard-a')
  })

  test('rejects an empty executable selection', () => {
    expect(() =>
      buildWorkflowRun(workflowProject(), ['script-card'], 'serial'),
    ).toThrow('Select at least one executable workflow node')
  })

  test('computes aggregate progress and immutably recovers interrupted tasks', () => {
    const run = buildWorkflowRun(
      workflowProject(),
      ['image-c', 'storyboard-a', 'video-b'],
      'serial',
    )
    const interrupted = {
      ...run,
      status: 'running' as const,
      nodes: run.nodes.map((task, index) => ({
        ...task,
        status: index === 0 ? ('succeeded' as const) : ('running' as const),
        progress: index === 0 ? 100 : 65,
      })),
    }

    expect(workflowProgress(interrupted)).toBe(77)

    const recovered = normalizeInterruptedRun(interrupted, () =>
      '2026-08-13T10:00:00.000Z',
    )
    expect(recovered).not.toBe(interrupted)
    expect(recovered.status).toBe('pending')
    expect(recovered.nodes.map(({ status }) => status)).toEqual([
      'succeeded',
      'pending',
      'pending',
    ])
    expect(recovered.nodes.map(({ progress }) => progress)).toEqual([100, 0, 0])
    expect(interrupted.nodes[1].status).toBe('running')
  })
})
