import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { createProject, type CanvasNode } from '../project/model'
import { ProjectRepository, WirelessCanvasDatabase } from '../project/project-repository'
import { useProjectStore } from '../project/project-store'
import { createInternalDemoProvider, ProviderRegistry } from '../generation/model-provider-registry'
import { createPipelineRun } from './pipeline-model'
import { PipelineRepository } from './pipeline-repository'
import { usePipelineAutomation } from './use-pipeline-automation'

const databases: WirelessCanvasDatabase[] = []
function setup() {
  const project = createProject('恢复管线', '')
  project.nodes = [0, 1].map((index): CanvasNode => ({ id: `n${index}`, kind: 'image', title: `图片${index}`, position: { x: 0, y: 0 }, versions: [{ id: `v${index}`, prompt: '古桥', createdAt: project.createdAt }], activeVersionId: `v${index}`, sourceChanged: false, modelProviderId: 'internal-demo' }))
  project.edges = [{ id: 'e', sourceNodeId: 'n0', targetNodeId: 'n1' }]
  useProjectStore.setState({ activeProject: project, activeProjectId: project.id, projectsById: { [project.id]: project }, past: [], future: [], saveStatus: 'saved' })
  const db = new WirelessCanvasDatabase(`pipeline-hook-${crypto.randomUUID()}`); databases.push(db)
  return { project, repository: new PipelineRepository(db), projectRepository: new ProjectRepository(db), generate: vi.fn(async () => { throw new Error('不应自动生成') }) }
}
afterEach(async () => {
  useProjectStore.setState({ activeProject: undefined, activeProjectId: undefined, projectsById: {}, past: [], future: [] })
  await Promise.all(databases.splice(0).map(db => db.delete()))
})

test('refresh recovers jobs and exposes paused state without issuing any provider requests', async () => {
  const { project, repository, projectRepository, generate } = setup()
  const run = createPipelineRun(project, 'n0'); run.status = 'running'; run.steps[0].status = 'running'; run.steps[0].jobId = 'orphan'
  project.jobs = [{ id: 'orphan', projectId: project.id, nodeId: 'n0', status: 'running', prompt: '古桥', createdAt: project.createdAt, updatedAt: project.updatedAt }]
  await repository.save(run)
  const registry = new ProviderRegistry([{ ...createInternalDemoProvider(), generate }])
  const hook = renderHook(() => usePipelineAutomation(project, projectRepository, registry, repository))
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  expect(hook.result.current.run?.pausedReason).toBe('interrupted')
  expect(hook.result.current.run?.steps[0].status).toBe('queued')
  expect(useProjectStore.getState().activeProject!.jobs[0].status).toBe('cancelled')
  expect(generate).not.toHaveBeenCalled()
  hook.unmount()
})

test('project switch does not reuse a previous project run or template start node', async () => {
  const { project, repository, projectRepository, generate } = setup()
  await repository.save(createPipelineRun(project, 'n0'))
  const registry = new ProviderRegistry([{ ...createInternalDemoProvider(), generate }])
  const hook = renderHook(({ current }) => usePipelineAutomation(current, projectRepository, registry, repository), { initialProps: { current: project } })
  await waitFor(() => expect(hook.result.current.history).toHaveLength(1))
  act(() => hook.result.current.show('n0'))
  const other = createProject('新项目', '')
  useProjectStore.setState(state => ({ activeProject: other, activeProjectId: other.id, projectsById: { ...state.projectsById, [other.id]: other } }))
  hook.rerender({ current: other })
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  expect(hook.result.current.history).toEqual([])
  expect(hook.result.current.startNodeId).toBe('')
  expect(hook.result.current.open).toBe(false)
  expect(generate).not.toHaveBeenCalled()
  hook.unmount()
})

test('templates instantiate remapped nodes and persist the active canvas snapshot immediately', async () => {
  const { project, repository, projectRepository, generate } = setup()
  const registry = new ProviderRegistry([{ ...createInternalDemoProvider(), generate }])
  const hook = renderHook(() => usePipelineAutomation(project, projectRepository, registry, repository))
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  act(() => hook.result.current.show('n0'))
  act(() => hook.result.current.saveTemplate('工作模板'))
  await waitFor(() => expect(hook.result.current.templates).toHaveLength(1))
  act(() => hook.result.current.instantiate(hook.result.current.templates[0]))
  await waitFor(async () => expect((await projectRepository.load(project.id))?.nodes).toHaveLength(4))
  expect((await projectRepository.load(project.id))?.canvases?.[0].nodes).toHaveLength(4)
  expect(hook.result.current.startNodeId).not.toBe('n0')
  expect(generate).not.toHaveBeenCalled()
  hook.unmount()
})
