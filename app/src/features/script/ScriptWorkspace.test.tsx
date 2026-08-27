import { afterEach, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeProjectFixture } from '../../test/fixtures'
import { createDefaultProviderRegistry } from '../generation/model-provider-registry'
import { useProjectStore } from '../project/project-store'
import { ScriptWorkspace } from './ScriptWorkspace'
import { scriptV2ConfigFixture } from './fixtures/script-v2.fixture'

afterEach(() => useProjectStore.setState({ activeProject: undefined, activeProjectId: undefined, projectsById: {}, past: [], future: [] }))

function setup(mode = 'seedream-direct-dev') {
  const project = makeProjectFixture()
  project.jobs = []
  project.nodes[0] = { ...project.nodes[0], details: { type: 'script', outline: '古桥上，小舟与旧友道别。', chapters: [] } }
  useProjectStore.setState({ activeProject: project, activeProjectId: project.id, projectsById: { [project.id]: project } })
  const fetchFn = vi.fn<typeof fetch>(() => new Promise(() => {}))
  const registry = createDefaultProviderRegistry({ arkText: { ...scriptV2ConfigFixture, mode, fetchFn }, seedream: { ...scriptV2ConfigFixture, mode, fetchFn } })
  const onClose = vi.fn()
  // Stable repository identities match the canvas owner (avoid rebuilding the runner on updates).
  const repository = { save: vi.fn(async () => {}) }
  const subjects = { create: vi.fn(), get: vi.fn(), list: vi.fn() }
  function StableHost() {
    const current = useProjectStore(state => state.activeProject)!
    return <ScriptWorkspace project={current} nodeId={project.nodes[0].id} registry={registry} repository={repository} subjects={subjects} onClose={onClose} onSent={vi.fn()} />
  }
  return { ...render(<StableHost />), fetchFn, onClose }
}

test('billing confirmation cancellation never sends a request and returns keyboard control to workspace', async () => {
  const user = userEvent.setup()
  const { fetchFn, onClose } = setup()
  await user.click(screen.getByRole('button', { name: 'AI拆解' }))
  expect(screen.getByRole('dialog', { name: '确认脚本任务费用' })).toHaveTextContent('总预计成本 1 积分')
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: '确认脚本任务费用' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '关闭脚本工作台' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledOnce()
  expect(fetchFn).not.toHaveBeenCalled()
})

test('offline workspace explains disabled analysis and image generation without changing old script', () => {
  const { fetchFn } = setup('mock')
  const workspace = screen.getByRole('dialog', { name: '脚本 v2 工作台' })
  expect(within(workspace).getByRole('button', { name: 'AI拆解' })).toBeDisabled()
  expect(workspace).toHaveTextContent('脚本 v2 开发验证配置未完成')
  expect(within(workspace).getByRole('button', { name: '批量生成分镜' })).toBeDisabled()
  expect(within(workspace).getByRole('textbox', { name: '剧本原文' })).toHaveValue('古桥上，小舟与旧友道别。')
  expect(fetchFn).not.toHaveBeenCalled()
})
