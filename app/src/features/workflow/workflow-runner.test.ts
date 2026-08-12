import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import type {
  GenerationAdapter,
  GenerationRequest,
  GenerationResult,
} from '../generation/generation-adapter'
import type { CanvasNode, Project } from '../project/model'
import { useProjectStore } from '../project/project-store'
import { buildWorkflowRun, type WorkflowRun } from './workflow-model'
import { WorkflowRunner } from './workflow-runner'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function resultFor(request: GenerationRequest, suffix = 'result'): GenerationResult {
  const assetId = `asset-${request.nodeId}-${suffix}`
  return {
    asset: {
      id: assetId,
      kind: request.targetKind,
      url: `/demo/${request.nodeId}-${suffix}.png`,
      mimeType: request.targetKind === 'video' ? 'video/mp4' : 'image/png',
    },
    version: {
      id: `version-${request.nodeId}-${suffix}`,
      createdAt: '2026-08-13T10:00:00.000Z',
      prompt: request.prompt,
      assetId,
    },
  }
}

function workflowProject(): Project {
  const base = makeProjectFixture()
  const copyNode = (
    source: CanvasNode,
    id: string,
    x: number,
  ): CanvasNode => ({
    ...source,
    id,
    title: id,
    position: { x, y: 100 },
    versions: source.versions.map((version) => ({
      ...version,
      id: `version-${id}-initial`,
      assetId: 'asset-shot-river-v1',
      prompt: `prompt-${id}`,
    })),
    activeVersionId: `version-${id}-initial`,
  })
  return {
    ...base,
    nodes: [
      copyNode(base.nodes[0], 'shot-a', 100),
      copyNode(base.nodes[0], 'shot-b', 400),
      copyNode(base.nodes[0], 'shot-c', 700),
    ],
    edges: [
      { id: 'a-b', sourceNodeId: 'shot-a', targetNodeId: 'shot-b' },
      { id: 'b-c', sourceNodeId: 'shot-b', targetNodeId: 'shot-c' },
    ],
    jobs: [],
  }
}

function activate(project = workflowProject()) {
  useProjectStore.setState({
    projectsById: { [project.id]: project },
    activeProjectId: project.id,
    activeProject: project,
    saveStatus: 'saved',
    past: [],
    future: [],
  })
}

function makeRun(mode: 'serial' | 'parallel' = 'serial') {
  return buildWorkflowRun(
    workflowProject(),
    ['shot-a', 'shot-b', 'shot-c'],
    mode,
  )
}

beforeEach(() => activate())

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

describe('workflow runner scheduling', () => {
  test('executes serial nodes one at a time and publishes progress/logs', async () => {
    const pending: Array<ReturnType<typeof deferred<GenerationResult>>> = []
    let active = 0
    let maxActive = 0
    const adapter: GenerationAdapter = {
      start(_request) {
        active += 1
        maxActive = Math.max(maxActive, active)
        const next = deferred<GenerationResult>()
        pending.push(next)
        return next.promise.finally(() => {
          active -= 1
        })
      },
    }
    const changes: WorkflowRun[] = []
    const runner = new WorkflowRunner({
      adapter,
      onRunChange: (run) => changes.push(run),
      onNodeSuccess() {},
    })

    const completion = runner.execute(makeRun('serial'))
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    expect(runner.current()?.nodes[0]).toMatchObject({
      status: 'running',
      progress: 10,
    })

    pending[0].resolve(resultFor(runner.current()!.nodes[0].request, 'one'))
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    pending[1].resolve(resultFor(runner.current()!.nodes[1].request, 'two'))
    await vi.waitFor(() => expect(pending).toHaveLength(3))
    pending[2].resolve(resultFor(runner.current()!.nodes[2].request, 'three'))

    const completed = await completion
    expect(maxActive).toBe(1)
    expect(completed.status).toBe('succeeded')
    expect(completed.nodes.map(({ progress }) => progress)).toEqual([100, 100, 100])
    expect(changes.some((run) => run.logs.some((log) => log.message.includes('开始执行')))).toBe(true)
  })

  test('starts all pending nodes in parallel', async () => {
    const pending: Array<{
      request: GenerationRequest
      task: ReturnType<typeof deferred<GenerationResult>>
    }> = []
    const runner = new WorkflowRunner({
      adapter: {
        start(request) {
          const task = deferred<GenerationResult>()
          pending.push({ request, task })
          return task.promise
        },
      },
      onRunChange() {},
      onNodeSuccess() {},
    })

    const completion = runner.execute(makeRun('parallel'))
    await vi.waitFor(() => expect(pending).toHaveLength(3))
    pending.forEach(({ request, task }, index) =>
      task.resolve(resultFor(request, String(index))),
    )

    expect((await completion).status).toBe('succeeded')
  })

  test('lets parallel siblings finish when one node fails', async () => {
    const starts: string[] = []
    const applied: string[] = []
    const runner = new WorkflowRunner({
      adapter: {
        async start(request) {
          starts.push(request.nodeId)
          if (request.nodeId === 'shot-b') throw new Error('branch failed')
          return resultFor(request)
        },
      },
      onRunChange() {},
      onNodeSuccess(nodeRun) {
        applied.push(nodeRun.nodeId)
      },
    })

    const completed = await runner.execute(makeRun('parallel'))

    expect(starts.sort()).toEqual(['shot-a', 'shot-b', 'shot-c'])
    expect(applied.sort()).toEqual(['shot-a', 'shot-c'])
    expect(completed.status).toBe('failed')
    expect(completed.nodes.map(({ status }) => status)).toEqual([
      'succeeded',
      'failed',
      'succeeded',
    ])
  })

  test('pauses a serial run on failure and leaves later nodes pending', async () => {
    let starts = 0
    const runner = new WorkflowRunner({
      adapter: {
        async start(request) {
          starts += 1
          if (request.nodeId === 'shot-b') throw new Error('demo failed')
          return resultFor(request)
        },
      },
      onRunChange() {},
      onNodeSuccess() {},
    })

    const completed = await runner.execute(makeRun('serial'))

    expect(starts).toBe(2)
    expect(completed.status).toBe('failed')
    expect(completed.nodes.map(({ status }) => status)).toEqual([
      'succeeded',
      'failed',
      'pending',
    ])
    expect(completed.nodes[1].error).toBe('demo failed')
  })

  test('retries one failed serial node, skips success, and continues pending work', async () => {
    const starts: string[] = []
    let failedOnce = false
    const runner = new WorkflowRunner({
      adapter: {
        async start(request) {
          starts.push(request.nodeId)
          if (request.nodeId === 'shot-b' && !failedOnce) {
            failedOnce = true
            throw new Error('retry me')
          }
          return resultFor(request, String(starts.length))
        },
      },
      onRunChange() {},
      onNodeSuccess() {},
    })
    const failed = await runner.execute(makeRun('serial'))

    const completed = await runner.retryNode(failed, failed.nodes[1].id)

    expect(completed?.status).toBe('succeeded')
    expect(completed?.nodes.map(({ attempt }) => attempt)).toEqual([1, 2, 1])
    expect(starts).toEqual(['shot-a', 'shot-b', 'shot-b', 'shot-c'])
  })

  test('cancels active and pending nodes without accepting late results', async () => {
    const pending = deferred<GenerationResult>()
    let applied = 0
    const runner = new WorkflowRunner({
      adapter: { start: async () => pending.promise },
      onRunChange() {},
      onNodeSuccess: () => {
        applied += 1
      },
    })
    const completion = runner.execute(makeRun('serial'))
    await vi.waitFor(() => expect(runner.current()?.status).toBe('running'))

    const cancelled = await runner.cancel(runner.current()!.id)
    pending.resolve(resultFor(runner.current()!.nodes[0].request))
    await completion

    expect(cancelled?.status).toBe('cancelled')
    expect(cancelled?.nodes.map(({ status }) => status)).toEqual([
      'cancelled',
      'cancelled',
      'cancelled',
    ])
    expect(applied).toBe(0)
  })

  test('recovers interrupted work while skipping an already successful node', async () => {
    const original = makeRun('serial')
    const interrupted: WorkflowRun = {
      ...original,
      status: 'running',
      nodes: original.nodes.map((node, index) => ({
        ...node,
        status: index === 0 ? 'succeeded' : index === 1 ? 'running' : 'pending',
        progress: index === 0 ? 100 : index === 1 ? 60 : 0,
      })),
    }
    const starts: string[] = []
    const runner = new WorkflowRunner({
      adapter: {
        async start(request) {
          starts.push(request.nodeId)
          return resultFor(request)
        },
      },
      onRunChange() {},
      onNodeSuccess() {},
    })

    const recovered = await runner.resume(interrupted)

    expect(recovered.status).toBe('succeeded')
    expect(starts).toEqual(['shot-b', 'shot-c'])
  })

  test('disposes in-memory work without accepting a late adapter result', async () => {
    const pending = deferred<GenerationResult>()
    let applied = 0
    const changes: WorkflowRun[] = []
    const runner = new WorkflowRunner({
      adapter: { start: async () => pending.promise },
      onRunChange: (run) => changes.push(run),
      onNodeSuccess() {
        applied += 1
      },
    })
    const completion = runner.execute(makeRun('serial'))
    await vi.waitFor(() => expect(runner.current()?.status).toBe('running'))

    runner.dispose()
    pending.resolve(resultFor(runner.current()!.nodes[0].request))
    const interrupted = await completion

    expect(interrupted.status).toBe('running')
    expect(interrupted.nodes[0].status).toBe('running')
    expect(applied).toBe(0)
    expect(changes.at(-1)?.status).toBe('running')
  })
})

describe('workflow result application', () => {
  test('atomically attaches a successful result and job to the original node', async () => {
    const run = buildWorkflowRun(workflowProject(), ['shot-a'], 'serial')
    const runner = new WorkflowRunner({
      adapter: { start: async (request) => resultFor(request) },
      onRunChange() {},
      onNodeSuccess(nodeRun, result) {
        useProjectStore.getState().applyWorkflowGenerationSuccess(
          run.projectId,
          nodeRun,
          result,
        )
      },
    })

    const completed = await runner.execute(run)
    const project = useProjectStore.getState().activeProject!
    const source = project.nodes.find(({ id }) => id === 'shot-a')!

    expect(completed.status).toBe('succeeded')
    expect(source.versions).toHaveLength(2)
    expect(source.activeVersionId).toBe('version-shot-a-result')
    expect(project.assets.some(({ id }) => id === 'asset-shot-a-result')).toBe(true)
    expect(project.jobs.at(-1)).toMatchObject({
      id: run.nodes[0].id,
      nodeId: 'shot-a',
      status: 'succeeded',
      attempt: 1,
    })
    expect(useProjectStore.getState().saveStatus).toBe('dirty')
  })

  test('marks the task failed when atomic project application rejects a collision', async () => {
    const run = buildWorkflowRun(workflowProject(), ['shot-a'], 'serial')
    const collidingResult = resultFor(run.nodes[0].request)
    activate({
      ...workflowProject(),
      assets: [
        ...workflowProject().assets,
        collidingResult.asset,
      ],
    })
    const runner = new WorkflowRunner({
      adapter: { start: async () => collidingResult },
      onRunChange() {},
      onNodeSuccess(nodeRun, result) {
        useProjectStore.getState().applyWorkflowGenerationSuccess(
          run.projectId,
          nodeRun,
          result,
        )
      },
    })

    const completed = await runner.execute(run)

    expect(completed.status).toBe('failed')
    expect(completed.nodes[0].error).toBe('Workflow asset ID collision')
  })
})
