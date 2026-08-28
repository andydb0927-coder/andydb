import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createProject, type CanvasNode } from '../project/model'
import { createInternalDemoProvider, ProviderRegistry } from '../generation/model-provider-registry'
import { createPipelineRun } from './pipeline-model'
import { PipelinePanel } from './PipelinePanel'

function setup() {
  const project = createProject('管线', '')
  project.nodes = [0, 1].map((i): CanvasNode => ({ id: `n${i}`, kind: 'image', title: `图片${i}`, position: { x: 0, y: 0 }, modelProviderId: 'internal-demo', versions: [{ id: `v${i}`, prompt: '山水', createdAt: project.createdAt }], activeVersionId: `v${i}`, sourceChanged: false }))
  project.edges = [{ id: 'e', sourceNodeId: 'n0', targetNodeId: 'n1' }]
  const actions = { close: vi.fn(), setStartNodeId: vi.fn(), start: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), skip: vi.fn(), retry: vi.fn(), saveTemplate: vi.fn(), renameTemplate: vi.fn(), deleteTemplate: vi.fn(), instantiate: vi.fn(), updateConfig: vi.fn() }
  const registry = new ProviderRegistry([{ ...createInternalDemoProvider(), pricing: { amount: 8, currency: 'credits', unit: 'generation' } }])
  return { project, actions, registry, startNodeId: 'n0', history: [], templates: [], error: '', loading: false }
}
test('previews topology and total retry cost; no request before explicit confirmation', () => {
  const props = setup(); render(<PipelinePanel {...props} />)
  fireEvent.change(screen.getByLabelText('失败策略'), { target: { value: 'retry' } })
  fireEvent.change(screen.getByLabelText('自动重试次数'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: '执行整条管线' }))
  const confirm = screen.getByRole('alertdialog', { name: '确认执行管线' })
  expect(within(confirm).getByText(/预计总成本 16 积分/)).toBeVisible()
  expect(within(confirm).getByText(/最高 48 积分/)).toBeVisible()
  expect(props.actions.start).not.toHaveBeenCalled()
  fireEvent.click(within(confirm).getByRole('button', { name: '确认执行' }))
  expect(props.actions.start).toHaveBeenCalledWith(expect.objectContaining({ policy: { mode: 'retry', retries: 2 } }))
})
test('shows failed reason, manual retry, pending skip and completed counts', () => {
  const props = setup(), run = createPipelineRun(props.project, 'n0')
  run.status = 'running'; run.pausedReason = 'failure'; run.steps[0].status = 'failed'; run.steps[0].error = '生成服务暂时不可用'
  render(<PipelinePanel {...props} run={run} history={[run]} />)
  expect(screen.getByText('生成服务暂时不可用')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '重试 图片0' }))
  expect(screen.getByRole('alertdialog', { name: '确认重试步骤' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '确认重试' }))
  expect(props.actions.retry).toHaveBeenCalledWith('n0')
  fireEvent.click(screen.getByRole('button', { name: '跳过 图片1' }))
  expect(props.actions.skip).toHaveBeenCalledWith('n1')
})
test('continue policy confirmation explains independent branches without promising to pause', () => {
  const props = setup(); render(<PipelinePanel {...props} />)
  fireEvent.change(screen.getByLabelText('失败策略'), { target: { value: 'continue' } })
  fireEvent.click(screen.getByRole('button', { name: '执行整条管线' }))
  const confirm = screen.getByRole('alertdialog', { name: '确认执行管线' })
  expect(within(confirm).getByText(/失败后跳过依赖分支，继续独立分支/)).toBeVisible()
  expect(within(confirm).queryByText(/失败后暂停/)).not.toBeInTheDocument()
})
test('panel closes with Escape and disabled operations explain unavailable model', () => {
  const props = setup(); props.registry = new ProviderRegistry([{ ...createInternalDemoProvider(), disabledReason: '开发配置未完成' }])
  render(<PipelinePanel {...props} />)
  expect(screen.getByRole('button', { name: '执行整条管线' })).toBeDisabled()
  expect(screen.getAllByText(/开发配置未完成/)).not.toHaveLength(0)
  fireEvent.keyDown(screen.getByRole('dialog', { name: '管线自动化' }), { key: 'Escape' })
  expect(props.actions.close).toHaveBeenCalled()
})
