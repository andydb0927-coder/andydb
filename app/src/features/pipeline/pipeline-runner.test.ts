import { expect, test, vi } from 'vitest'
import { createProject, type CanvasNode } from '../project/model'
import { createPipelineRun } from './pipeline-model'
import { PipelineRunner } from './pipeline-runner'

function runFixture() {
  const project = createProject('运行', '')
  project.nodes = [0, 1, 2].map((i): CanvasNode => ({ id: `n${i}`, kind: 'image', title: `图片${i}`, position: { x: i * 400, y: 0 }, versions: [], activeVersionId: '', sourceChanged: false }))
  project.edges = [{ id: 'e1', sourceNodeId: 'n0', targetNodeId: 'n1' }, { id: 'e2', sourceNodeId: 'n0', targetNodeId: 'n2' }]
  return createPipelineRun(project, 'n0')
}
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }

test('runs serially, saves before executing and does not start twice', async () => {
  const save = vi.fn(async () => undefined), gate = deferred()
  const execute = vi.fn(async () => { expect(save).toHaveBeenCalled(); await gate.promise; return {} })
  const runner = new PipelineRunner(runFixture(), { save, execute })
  const first = runner.start(); await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
  void runner.start(); gate.resolve(); await first
  expect(execute.mock.calls).toHaveLength(3)
  expect(runner.snapshot.status).toBe('succeeded')
})
test('pauses after active step, then resumes only pending steps', async () => {
  const gate = deferred(), execute = vi.fn(async () => { await gate.promise; return {} })
  const runner = new PipelineRunner(runFixture(), { save: async () => undefined, execute })
  const promise = runner.start(); await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
  runner.pause(); gate.resolve(); await promise
  expect(runner.snapshot.pausedReason).toBe('manual')
  expect(runner.snapshot.steps[0].status).toBe('succeeded')
  await runner.resume(); expect(execute).toHaveBeenCalledTimes(3)
})
test('cancel aborts active execution, keeps completed output and prevents late writes', async () => {
  const gate = deferred(); let signal: AbortSignal | undefined
  const execute = vi.fn(async (_node: string, context: { signal: AbortSignal }) => { signal = context.signal; await gate.promise; return {} })
  const runner = new PipelineRunner(runFixture(), { save: async () => undefined, execute })
  const promise = runner.start(); await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
  await runner.cancel(); expect(signal?.aborted).toBe(true); gate.resolve(); await promise
  expect(runner.snapshot.status).toBe('cancelled')
  expect(runner.snapshot.steps.every(step => step.status === 'cancelled')).toBe(true)
})
test('defaults to interruption on failure and retries only that failed step', async () => {
  const execute = vi.fn().mockRejectedValueOnce(new Error('供应商拒绝请求')).mockResolvedValue({})
  const runner = new PipelineRunner(runFixture(), { save: async () => undefined, execute })
  await runner.start()
  expect(runner.snapshot.pausedReason).toBe('failure')
  expect(runner.snapshot.steps[0].error).toContain('供应商拒绝请求')
  await runner.retry('n0')
  expect(execute).toHaveBeenCalledTimes(4)
  expect(runner.snapshot.status).toBe('succeeded')
})
test('bounded automatic retries and continue strategy do not send stale failed dependencies', async () => {
  const run = runFixture(); run.policy = { mode: 'retry', retries: 2 }
  const execute = vi.fn().mockRejectedValue(new Error('暂时不可用'))
  const runner = new PipelineRunner(run, { save: async () => undefined, execute })
  await runner.start(); expect(execute).toHaveBeenCalledTimes(3)
  expect(runner.snapshot.pausedReason).toBe('failure')
  const continued = new PipelineRunner({ ...run, policy: { mode: 'continue', retries: 0 } }, { save: async () => undefined, execute })
  await continued.start()
  expect(continued.snapshot.steps.slice(1).every(step => step.skipped === 'dependency')).toBe(true)
  expect(continued.snapshot.status).toBe('failed')
})
test('skips one pending step and stops before any execution if persistence fails', async () => {
  const execute = vi.fn(async () => ({}))
  const runner = new PipelineRunner(runFixture(), { save: async () => undefined, execute })
  await runner.skip('n1'); await runner.start()
  expect(execute).toHaveBeenCalledTimes(2)
  expect(runner.snapshot.steps[1].skipped).toBe('user')
  const broken = new PipelineRunner(runFixture(), { save: async () => { throw new Error('空间不足') }, execute })
  await expect(broken.start()).rejects.toThrow('空间不足')
  expect(execute).toHaveBeenCalledTimes(2)
})
