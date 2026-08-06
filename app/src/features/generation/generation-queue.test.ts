import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import type { GenerationJob, Project } from '../project/model'
import { useProjectStore } from '../project/project-store'
import { DemoGenerationAdapter } from './demo-generation-adapter'
import type {
  GenerationAdapter,
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'
import { GenerationQueue } from './generation-queue'

function activate(project: Project = makeProjectFixture()) {
  useProjectStore.setState({
    projectsById: { [project.id]: project },
    activeProjectId: project.id,
    activeProject: project,
    saveStatus: 'saved',
    past: [],
    future: [],
  })
}

function resultFor(request: GenerationRequest): GenerationResult {
  return {
    asset: {
      id: `asset-${request.operation}`,
      kind: 'image',
      url: '/demo/shot-river.png',
      mimeType: 'image/png',
    },
    version: {
      id: `version-${request.operation}`,
      createdAt: '2026-08-06T09:00:00.000Z',
      prompt: request.prompt,
      assetId: `asset-${request.operation}`,
    },
  }
}

function createQueue(
  adapter: GenerationAdapter,
  statusSequence: GenerationJob['status'][] = [],
) {
  return new GenerationQueue({
    adapter,
    onJobChange(job) {
      statusSequence.push(job.status)
      if (job.status !== 'succeeded') {
        useProjectStore.getState().updateGenerationJob(job)
      }
    },
    onSuccess(job, result) {
      useProjectStore.getState().applyGenerationSuccess(job, result)
    },
  })
}

const regenerateRequest: GenerationRequest = {
  nodeId: 'shot-1',
  operation: 'regenerate',
  prompt: '近景，人物望向河面',
  referenceAssetUrls: ['/demo/shot-river.png'],
}

beforeEach(() => {
  activate()
})

afterEach(() => {
  vi.useRealTimers()
  useProjectStore.setState({
    projectsById: {},
    activeProjectId: undefined,
    activeProject: undefined,
    saveStatus: 'saved',
    past: [],
    future: [],
  })
})

describe('generation queue lifecycle', () => {
  test('reports deterministic adapter cancellation as AbortError', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const generation = new DemoGenerationAdapter().start(
      regenerateRequest,
      controller.signal,
    )

    controller.abort()

    await expect(generation).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Generation cancelled',
    })
  })

  test('moves queued to running to succeeded after the deterministic 1200ms generation', async () => {
    vi.useFakeTimers()
    const statuses: GenerationJob['status'][] = []
    const queue = createQueue(new DemoGenerationAdapter(), statuses)

    const job = queue.enqueue(regenerateRequest)

    expect(job.status).toBe('queued')
    expect(statuses).toEqual(['queued'])

    await vi.advanceTimersByTimeAsync(0)
    expect(queue.get(job.id)?.status).toBe('running')
    const runningProject = useProjectStore.getState().activeProject!
    const runningNode = runningProject.nodes.find((node) => node.id === 'shot-1')!
    expect(
      runningNode.versions.find(
        (version) => version.id === runningNode.activeVersionId,
      )?.generationJobId,
    ).toBe(job.id)

    await vi.advanceTimersByTimeAsync(1200)

    expect(queue.get(job.id)?.status).toBe('succeeded')
    expect(statuses).toEqual(['queued', 'running', 'succeeded'])
    expect(
      useProjectStore
        .getState()
        .activeProject?.nodes.find((node) => node.id === 'shot-1')?.versions,
    ).toHaveLength(2)
  })

  test('cancels a running deterministic generation without applying a result', async () => {
    vi.useFakeTimers()
    const queue = createQueue(new DemoGenerationAdapter())
    const job = queue.enqueue(regenerateRequest)
    await vi.advanceTimersByTimeAsync(0)

    queue.cancel(job.id)
    await vi.advanceTimersByTimeAsync(1200)

    expect(queue.get(job.id)?.status).toBe('cancelled')
    expect(
      useProjectStore
        .getState()
        .activeProject?.nodes.find((node) => node.id === 'shot-1')?.versions,
    ).toHaveLength(1)
    expect(useProjectStore.getState().activeProject?.assets).toHaveLength(2)
  })

  test('retries a failed request with the same stable job ID and a higher attempt', async () => {
    let shouldFail = true
    const adapter: GenerationAdapter = {
      async start(request) {
        if (shouldFail) {
          shouldFail = false
          throw new Error('demo generation failed')
        }
        return resultFor(request)
      },
    }
    const queue = createQueue(adapter)
    const first = queue.enqueue(regenerateRequest)
    await vi.waitFor(() => expect(queue.get(first.id)?.status).toBe('failed'))

    const retry = queue.retry(first.id)
    await vi.waitFor(() => expect(queue.get(first.id)?.status).toBe('succeeded'))

    expect(retry?.id).toBe(first.id)
    expect(retry?.attempt).toBe(2)
    expect(queue.get(first.id)?.attempt).toBe(2)
  })
})

describe('generation result mutations', () => {
  test('commits the asset, succeeded job, and referencing version together while preserving history', async () => {
    const before = useProjectStore.getState().activeProject!
    const priorVersion = before.nodes[0].versions[0]
    const queue = createQueue({
      async start(request) {
        return resultFor(request)
      },
    })

    const job = queue.enqueue(regenerateRequest)
    await vi.waitFor(() => expect(queue.get(job.id)?.status).toBe('succeeded'))

    const project = useProjectStore.getState().activeProject!
    const node = project.nodes.find((candidate) => candidate.id === 'shot-1')!
    const currentVersion = node.versions.find(
      (version) => version.id === node.activeVersionId,
    )!
    expect(node.versions[0]).toMatchObject(priorVersion)
    expect(currentVersion).toMatchObject({
      assetId: 'asset-regenerate',
      generationJobId: job.id,
    })
    expect(project.assets.find((asset) => asset.id === currentVersion.assetId)).toBeDefined()
    expect(project.jobs.find((candidate) => candidate.id === job.id)).toMatchObject({
      status: 'succeeded',
      assetId: currentVersion.assetId,
    })
  })

  test('extends a numbered storyboard with a new node and incoming dependency edge', async () => {
    const base = makeProjectFixture()
    activate({
      ...base,
      nodes: base.nodes.map((node) =>
        node.id === 'shot-1' ? { ...node, title: '分镜 01' } : node,
      ),
    })
    const queue = createQueue({
      async start(request) {
        return resultFor(request)
      },
    })

    const job = queue.enqueue({
      ...regenerateRequest,
      operation: 'extend-shot',
    })
    await vi.waitFor(() => expect(queue.get(job.id)?.status).toBe('succeeded'))

    const project = useProjectStore.getState().activeProject!
    const extended = project.nodes.find((node) => node.title === '分镜 02')!
    expect(extended.kind).toBe('storyboard')
    expect(project.edges).toContainEqual(
      expect.objectContaining({
        sourceNodeId: 'shot-1',
        targetNodeId: extended.id,
      }),
    )
    expect(extended.versions[0]).toMatchObject({
      assetId: 'asset-extend-shot',
      generationJobId: job.id,
    })
  })

  test('generates and selects a corresponding downstream video without replacing its source', async () => {
    const base = makeProjectFixture()
    activate({
      ...base,
      nodes: base.nodes.map((node) =>
        node.id === 'shot-1' ? { ...node, title: '分镜 01' } : node,
      ),
    })
    const queue = createQueue({
      async start(request) {
        return resultFor(request)
      },
    })

    const job = queue.enqueue({
      ...regenerateRequest,
      operation: 'generate-video',
    })
    await vi.waitFor(() => expect(queue.get(job.id)?.status).toBe('succeeded'))

    const project = useProjectStore.getState().activeProject!
    const video = project.nodes.find((node) => node.title === '视频 01')!
    expect(video.kind).toBe('video')
    expect(project.nodes.find((node) => node.id === 'shot-1')?.versions).toHaveLength(1)
    expect(project.edges).toContainEqual(
      expect.objectContaining({
        sourceNodeId: 'shot-1',
        targetNodeId: video.id,
      }),
    )
    expect(
      video.versions.find((version) => version.id === video.activeVersionId),
    ).toMatchObject({ generationJobId: job.id })
  })
})
