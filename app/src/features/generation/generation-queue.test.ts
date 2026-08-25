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

function resultWithIds(
  request: GenerationRequest,
  assetId: string,
  versionId: string,
): GenerationResult {
  return {
    asset: {
      id: assetId,
      kind: 'image',
      url: '/demo/shot-river.png',
      mimeType: 'image/png',
    },
    version: {
      id: versionId,
      createdAt: '2026-08-06T09:00:00.000Z',
      prompt: request.prompt,
      assetId,
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
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
        useProjectStore.getState().updateGenerationJob(job.projectId!, job)
      }
    },
    onSuccess(job, result) {
      useProjectStore
        .getState()
        .applyGenerationSuccess(job.projectId!, job, result)
    },
  })
}

const regenerateRequest: GenerationRequest = {
  projectId: 'project-frost-river',
  nodeId: 'shot-1',
  operation: 'regenerate',
  targetKind: 'image',
  prompt: '近景，人物望向河面',
  referenceAssets: [
    {
      url: '/demo/shot-river.png',
      kind: 'image',
      mimeType: 'image/png',
    },
  ],
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
  test('binds a job to the project that owned its request', () => {
    const queue = createQueue(new DemoGenerationAdapter())

    const job = queue.enqueue({
      ...regenerateRequest,
      projectId: 'project-frost-river',
    } as GenerationRequest)

    expect((job as GenerationJob & { projectId?: string }).projectId).toBe(
      'project-frost-river',
    )
    expect(job).toMatchObject({
      generationConfig: {
        targetKind: 'image',
        referenceAssets: regenerateRequest.referenceAssets,
      },
    })
    queue.cancel(job.id)
  })

  test('disposes in-flight work so a late adapter result cannot succeed', async () => {
    const pending = deferred<GenerationResult>()
    const succeeded: string[] = []
    const queue = new GenerationQueue({
      adapter: { start: async () => pending.promise },
      onJobChange() {},
      onSuccess(job) {
        succeeded.push(job.id)
      },
    })
    const job = queue.enqueue(regenerateRequest)
    await Promise.resolve()

    ;(queue as GenerationQueue & { dispose?(): void }).dispose?.()
    pending.resolve(resultFor(regenerateRequest))
    await Promise.resolve()
    await Promise.resolve()

    expect(queue.get(job.id)?.status).toBe('cancelled')
    expect(succeeded).toEqual([])
  })

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

  test('returns a local video-shaped result for video generation requests', async () => {
    vi.useFakeTimers()
    const generation = new DemoGenerationAdapter().start(
      { ...regenerateRequest, operation: 'generate-video', targetKind: 'video' },
      new AbortController().signal,
    )

    await vi.advanceTimersByTimeAsync(1200)
    await expect(generation).resolves.toMatchObject({
      asset: {
        kind: 'video',
        url: '/demo/video-preview.mp4',
        mimeType: 'video/mp4',
        width: 1280,
        height: 720,
        durationSeconds: 5,
      },
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
    expect(statuses[0]).toBe('queued')
    expect(statuses.at(-1)).toBe('succeeded')
    expect(statuses.filter((status) => status === 'running')).toHaveLength(5)
    expect(queue.get(job.id)).toMatchObject({
      providerId: 'mock-mj-image',
      providerName: 'Mock Studio',
      modelName: 'Lib Image',
      progress: 100,
      creditsSpent: 18,
    })
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

  test('retries a cancelled request without accepting the cancelled attempt result', async () => {
    const attempts = [deferred<GenerationResult>(), deferred<GenerationResult>()]
    let started = 0
    const succeeded: number[] = []
    const queue = new GenerationQueue({
      adapter: {
        start: async () => attempts[started++].promise,
      },
      onJobChange() {},
      onSuccess(job) {
        succeeded.push(job.attempt ?? 0)
      },
    })
    const job = queue.enqueue(regenerateRequest)
    await Promise.resolve()
    queue.cancel(job.id)

    const retry = queue.retry(job.id)
    await Promise.resolve()
    attempts[0].resolve(resultWithIds(regenerateRequest, 'asset-old', 'version-old'))
    await Promise.resolve()

    expect(retry?.attempt).toBe(2)
    expect(queue.get(job.id)?.status).toBe('running')
    expect(succeeded).toEqual([])

    attempts[1].resolve(resultWithIds(regenerateRequest, 'asset-new', 'version-new'))
    await vi.waitFor(() => expect(queue.get(job.id)?.status).toBe('succeeded'))
    expect(succeeded).toEqual([2])
  })

  test('records a failed job when atomic success application rejects the result', async () => {
    const queue = new GenerationQueue({
      adapter: { start: async (request) => resultFor(request) },
      onJobChange() {},
      onSuccess() {
        throw new Error('Generation result collision')
      },
    })

    const job = queue.enqueue(regenerateRequest)

    await vi.waitFor(() => expect(queue.get(job.id)?.status).toBe('failed'))
    expect(queue.get(job.id)?.error).toBe('Generation result collision')
  })
})

describe('generation result mutations', () => {
  test('updates only the project named by a generation callback', () => {
    const projectA = makeProjectFixture()
    const projectB = {
      ...makeProjectFixture(),
      id: 'project-b',
      title: '项目 B',
    }
    useProjectStore.setState({
      projectsById: { [projectA.id]: projectA, [projectB.id]: projectB },
      activeProjectId: projectB.id,
      activeProject: projectB,
      past: [],
      future: [],
    })
    const job: GenerationJob = {
      id: 'job-project-a',
      nodeId: 'shot-1',
      status: 'running',
      prompt: '项目 A 生成',
      createdAt: '2026-08-06T09:00:00.000Z',
      updatedAt: '2026-08-06T09:00:00.000Z',
      operation: 'regenerate',
      attempt: 1,
    }

    ;(
      useProjectStore.getState().updateGenerationJob as unknown as (
        projectId: string,
        job: GenerationJob,
      ) => void
    )(projectA.id, job)

    expect(useProjectStore.getState().activeProject).toBe(projectB)
    expect(useProjectStore.getState().projectsById[projectB.id]).toBe(projectB)
    expect(
      useProjectStore.getState().projectsById[projectA.id].jobs,
    ).toContainEqual(job)
  })

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

  test('undo after successful generation restores the valid pre-generation project', async () => {
    const queue = createQueue({ start: async (request) => resultFor(request) })
    const job = queue.enqueue(regenerateRequest)
    await vi.waitFor(() => expect(queue.get(job.id)?.status).toBe('succeeded'))

    useProjectStore.getState().undo()

    const project = useProjectStore.getState().activeProject!
    expect(project.jobs.some((candidate) => candidate.id === job.id)).toBe(false)
    expect(project.nodes[0].versions).toHaveLength(1)
    expect(project.nodes[0].versions[0].generationJobId).toBeUndefined()
  })

  test('undo does not resurrect a non-live concurrent job on another node', async () => {
    const attempts = [deferred<GenerationResult>(), deferred<GenerationResult>()]
    let started = 0
    const queue = createQueue({ start: async () => attempts[started++].promise })
    const first = queue.enqueue(regenerateRequest)
    await Promise.resolve()
    expect(queue.get(first.id)?.status).toBe('running')

    const secondRequest = {
      ...regenerateRequest,
      nodeId: 'rain-audio',
      prompt: '雨声重生成',
    }
    const second = queue.enqueue(secondRequest)
    await Promise.resolve()
    expect(queue.get(second.id)?.status).toBe('running')

    attempts[0].reject(new Error('first node failed'))
    await vi.waitFor(() => expect(queue.get(first.id)?.status).toBe('failed'))
    attempts[1].resolve(
      resultWithIds(secondRequest, 'asset-second-node', 'version-second-node'),
    )
    await vi.waitFor(() => expect(queue.get(second.id)?.status).toBe('succeeded'))

    useProjectStore.getState().undo()

    const project = useProjectStore.getState().activeProject!
    expect(project.jobs.find((job) => job.id === first.id)?.status).toBe('failed')
    expect(
      project.jobs.some(
        (job) => job.status === 'queued' || job.status === 'running',
      ),
    ).toBe(false)
  })

  test.each(['failed', 'cancelled'] as const)(
    'undo keeps job B %s when job A succeeded while B was running',
    async (terminalStatus) => {
      const jobBResult = deferred<GenerationResult>()
      const jobAResult = deferred<GenerationResult>()
      const queue = createQueue({
        start: async (request) =>
          request.nodeId === 'rain-audio'
            ? jobBResult.promise
            : jobAResult.promise,
      })
      const jobBRequest = {
        ...regenerateRequest,
        nodeId: 'rain-audio',
        prompt: '雨声并发重生成',
      }
      const jobB = queue.enqueue(jobBRequest)
      await Promise.resolve()
      expect(queue.get(jobB.id)?.status).toBe('running')
      useProjectStore
        .getState()
        .updateNode('rain-audio', { title: '并发期间保留的编辑' })

      const jobA = queue.enqueue(regenerateRequest)
      await Promise.resolve()
      expect(queue.get(jobA.id)?.status).toBe('running')
      jobAResult.resolve(
        resultWithIds(regenerateRequest, 'asset-job-a', 'version-job-a'),
      )
      await vi.waitFor(() => expect(queue.get(jobA.id)?.status).toBe('succeeded'))
      expect(queue.get(jobB.id)?.status).toBe('running')

      if (terminalStatus === 'failed') {
        jobBResult.reject(new Error('job B failed after job A succeeded'))
      } else {
        queue.cancel(jobB.id)
      }
      await vi.waitFor(() =>
        expect(queue.get(jobB.id)?.status).toBe(terminalStatus),
      )

      useProjectStore.getState().undo()

      const project = useProjectStore.getState().activeProject!
      const jobBNode = project.nodes.find((node) => node.id === 'rain-audio')!
      const activeVersion = jobBNode.versions.find(
        (version) => version.id === jobBNode.activeVersionId,
      )!
      expect(jobBNode.title).toBe('并发期间保留的编辑')
      expect(project.jobs.find((job) => job.id === jobB.id)?.status).toBe(
        terminalStatus,
      )
      expect(
        project.jobs.find((job) => job.id === activeVersion.generationJobId)
          ?.status,
      ).toBe(terminalStatus)
      expect(
        project.jobs.some(
          (job) => job.status === 'queued' || job.status === 'running',
        ),
      ).toBe(false)
    },
  )

  test.each(['failed', 'cancelled'] as const)(
    'replaces the generation baseline after a %s attempt',
    async (terminalStatus) => {
      const firstAttempt = deferred<GenerationResult>()
      let started = 0
      const queue = createQueue({
        async start(request) {
          started += 1
          if (started === 1) {
            if (terminalStatus === 'failed') throw new Error('first attempt failed')
            return firstAttempt.promise
          }
          return resultWithIds(request, 'asset-later-success', 'version-later-success')
        },
      })
      const first = queue.enqueue(regenerateRequest)
      await Promise.resolve()
      if (terminalStatus === 'cancelled') queue.cancel(first.id)
      await vi.waitFor(() =>
        expect(queue.get(first.id)?.status).toBe(terminalStatus),
      )

      useProjectStore
        .getState()
        .updateNode('rain-audio', { title: '终态后的无关编辑' })
      const later = queue.enqueue({
        ...regenerateRequest,
        prompt: '新一轮生成',
      })
      await vi.waitFor(() => expect(queue.get(later.id)?.status).toBe('succeeded'))

      useProjectStore.getState().undo()

      const project = useProjectStore.getState().activeProject!
      expect(project.nodes.find((node) => node.id === 'rain-audio')?.title).toBe(
        '终态后的无关编辑',
      )
      expect(project.jobs.find((job) => job.id === first.id)?.status).toBe(
        terminalStatus,
      )
    },
  )

  test.each([
    ['duplicate asset', 'asset-shot-river-v1', 'version-new', 'asset-shot-river-v1'],
    ['duplicate version', 'asset-new', 'version-shot-river-v1', 'asset-new'],
    ['mismatched asset reference', 'asset-new', 'version-new', 'asset-other'],
  ])('rejects %s without partially applying the result', async (_case, assetId, versionId, versionAssetId) => {
    const before = useProjectStore.getState().activeProject!
    const queue = createQueue({
      async start(request) {
        const result = resultWithIds(request, assetId, versionId)
        return {
          ...result,
          version: { ...result.version, assetId: versionAssetId },
        }
      },
    })
    const job = queue.enqueue(regenerateRequest)

    await vi.waitFor(() => expect(queue.get(job.id)?.status).toBe('failed'))

    const project = useProjectStore.getState().activeProject!
    expect(project.assets).toEqual(before.assets)
    expect(project.nodes[0].versions).toHaveLength(1)
    expect(project.jobs.find((candidate) => candidate.id === job.id)?.status).toBe(
      'failed',
    )
  })

  test('ignores an older overlapping job result after a newer job becomes current', async () => {
    const results = [deferred<GenerationResult>(), deferred<GenerationResult>()]
    let started = 0
    const queue = createQueue({ start: async () => results[started++].promise })
    const older = queue.enqueue(regenerateRequest)
    const newer = queue.enqueue({ ...regenerateRequest, prompt: '更新的生成' })
    await Promise.resolve()

    results[1].resolve(
      resultWithIds(regenerateRequest, 'asset-newer', 'version-newer'),
    )
    await vi.waitFor(() => expect(queue.get(newer.id)?.status).toBe('succeeded'))
    results[0].resolve(
      resultWithIds(regenerateRequest, 'asset-older', 'version-older'),
    )
    await vi.waitFor(() => expect(queue.get(older.id)?.status).toBe('failed'))

    const project = useProjectStore.getState().activeProject!
    expect(project.nodes[0].activeVersionId).toBe('version-newer')
    expect(project.nodes[0].versions.at(-1)?.generationJobId).toBe(newer.id)
    expect(project.assets.some((asset) => asset.id === 'asset-older')).toBe(false)
    expect(project.nodes[0].versions).toHaveLength(2)
  })

  test('rejects a generation result for a missing source node', async () => {
    const queue = createQueue({ start: async (request) => resultFor(request) })
    const job = queue.enqueue({ ...regenerateRequest, nodeId: 'missing-node' })

    await vi.waitFor(() => expect(queue.get(job.id)?.status).toBe('failed'))
    expect(useProjectStore.getState().activeProject?.assets).toHaveLength(2)
  })

  test('rejects a success callback whose operation differs from the stored job', () => {
    const job: GenerationJob = {
      id: 'job-metadata',
      projectId: 'project-frost-river',
      nodeId: 'shot-1',
      status: 'running',
      prompt: regenerateRequest.prompt,
      createdAt: '2026-08-06T09:00:00.000Z',
      updatedAt: '2026-08-06T09:00:00.000Z',
      operation: 'regenerate',
      attempt: 1,
      sequence: 1,
    }
    useProjectStore
      .getState()
      .updateGenerationJob('project-frost-river', job)
    const result = resultWithIds(regenerateRequest, 'asset-metadata', 'version-metadata')
    result.version.generationJobId = job.id

    expect(() =>
      useProjectStore.getState().applyGenerationSuccess(
        'project-frost-river',
        { ...job, status: 'succeeded', operation: 'extend-shot' },
        result,
      ),
    ).toThrow('Generation source or attempt mismatch')
    expect(useProjectStore.getState().activeProject?.assets).toHaveLength(2)
  })

  test('rejects a success callback bound to a different project', () => {
    const job: GenerationJob = {
      id: 'job-project-mismatch',
      projectId: 'project-frost-river',
      nodeId: 'shot-1',
      status: 'running',
      prompt: regenerateRequest.prompt,
      createdAt: '2026-08-06T09:00:00.000Z',
      updatedAt: '2026-08-06T09:00:00.000Z',
      operation: 'regenerate',
      attempt: 1,
      sequence: 1,
    }
    useProjectStore
      .getState()
      .updateGenerationJob('project-frost-river', job)
    const result = resultWithIds(
      regenerateRequest,
      'asset-project-mismatch',
      'version-project-mismatch',
    )
    result.version.generationJobId = job.id

    expect(() =>
      useProjectStore.getState().applyGenerationSuccess(
        'project-frost-river',
        { ...job, status: 'succeeded', projectId: 'project-other' },
        result,
      ),
    ).toThrow('Generation project mismatch')
    expect(useProjectStore.getState().activeProject?.assets).toHaveLength(2)
  })

  test('rejects a duplicated successful callback instead of applying another version', async () => {
    const queue = createQueue({ start: async (request) => resultFor(request) })
    const enqueued = queue.enqueue(regenerateRequest)
    await vi.waitFor(() => expect(queue.get(enqueued.id)?.status).toBe('succeeded'))
    const completed = queue.get(enqueued.id)!
    const duplicate = resultWithIds(
      regenerateRequest,
      'asset-duplicate-callback',
      'version-duplicate-callback',
    )
    duplicate.version.generationJobId = completed.id

    expect(() =>
      useProjectStore
        .getState()
        .applyGenerationSuccess('project-frost-river', completed, duplicate),
    ).toThrow('Generation source or attempt mismatch')
    expect(useProjectStore.getState().activeProject?.nodes[0].versions).toHaveLength(2)
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

  test('uses a new unique video number for repeated generation from one storyboard', async () => {
    const base = makeProjectFixture()
    activate({
      ...base,
      nodes: base.nodes.map((node) =>
        node.id === 'shot-1' ? { ...node, title: '分镜 01' } : node,
      ),
    })
    let count = 0
    const queue = createQueue({
      async start(request) {
        count += 1
        return resultWithIds(request, `asset-video-${count}`, `version-video-${count}`)
      },
    })

    const first = queue.enqueue({ ...regenerateRequest, operation: 'generate-video' })
    await vi.waitFor(() => expect(queue.get(first.id)?.status).toBe('succeeded'))
    const second = queue.enqueue({ ...regenerateRequest, operation: 'generate-video' })
    await vi.waitFor(() => expect(queue.get(second.id)?.status).toBe('succeeded'))

    expect(
      useProjectStore
        .getState()
        .activeProject?.nodes.filter((node) => node.kind === 'video')
        .map((node) => node.title),
    ).toEqual(['视频 01', '视频 02'])
  })

  test('adds asset-backed storyboard and video nodes to the timeline and ignores duplicates', () => {
    const base = makeProjectFixture()
    const videoNode = {
      ...base.nodes[0],
      id: 'video-1',
      kind: 'video' as const,
      title: '视频 01',
    }
    activate({ ...base, nodes: [...base.nodes, videoNode], timeline: [] })

    useProjectStore.getState().addToTimeline({
      id: 'invalid-storyboard',
      nodeId: 'shot-1',
      order: 0,
      durationSeconds: 5,
      track: 'video',
    })
    useProjectStore.getState().addToTimeline({
      id: 'video-first',
      nodeId: 'video-1',
      order: 0,
      durationSeconds: 5,
      track: 'video',
    })
    useProjectStore.getState().addToTimeline({
      id: 'video-duplicate',
      nodeId: 'video-1',
      order: 1,
      durationSeconds: 5,
      track: 'video',
    })

    expect(useProjectStore.getState().activeProject?.timeline).toEqual([
      expect.objectContaining({
        id: 'invalid-storyboard',
        nodeId: 'shot-1',
        order: 0,
      }),
      expect.objectContaining({ id: 'video-first', nodeId: 'video-1', order: 1 }),
    ])
  })
})
