import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { makeProjectFixture } from '../../test/fixtures'
import { CanvasWorkflowBatchStatus, CanvasWorkflowTools } from './CanvasWorkflowTools'
import { CanvasProjectDialogs } from './CanvasProjectDialogs'
import { CanvasWorkspacePanels } from './CanvasWorkspacePanels'
import { CanvasNodeEditors } from './CanvasNodeEditors'
import type { WorkspaceSidePanel, CanvasStoryboardView } from './CanvasWorkspace'
import type { DirectorComposer } from '../director/DirectorComposer'

const spies = vi.hoisted(() => ({ resources: vi.fn(), agent: vi.fn(), storyboard: vi.fn() }))
vi.mock('./CanvasWorkspace', () => ({
  WorkspaceSidePanel: (props: ComponentProps<typeof WorkspaceSidePanel>) => { spies.resources(props); return <button onClick={() => props.onSelectNode('shot-1')}>打开资源节点</button> },
  CanvasStoryboardView: (props: ComponentProps<typeof CanvasStoryboardView>) => { spies.storyboard(props); return <div>故事板面板</div> },
  CanvasAgentPanel: ({ children }: { children: React.ReactNode }) => <aside>{children}</aside>,
}))
vi.mock('../director/DirectorComposer', () => ({ DirectorComposer: (props: ComponentProps<typeof DirectorComposer>) => { spies.agent(props); return <div>Agent面板</div> } }))

test('dock preserves all resource callbacks and draft disabled state after extraction', () => {
  const open = vi.fn(), add = vi.fn()
  const toolbar = { activeTool: 'select' as const, connectionsVisible: true, draftOpen: false,
    onOpenPanel: open, onAddNode: add, onToggleConnections: vi.fn(), onToolChange: vi.fn() }
  const view = render(<CanvasWorkflowTools toolbar={toolbar} />)
  for (const [name, id] of [['打开工具箱', 'toolbox'], ['资产管理', 'assets'], ['素材库', 'library'], ['角色库', 'characters'], ['历史记录', 'history']]) {
    fireEvent.click(screen.getByRole('button', { name }))
    expect(open).toHaveBeenLastCalledWith(id)
  }
  fireEvent.click(screen.getByRole('button', { name: '添加节点' }))
  expect(add).toHaveBeenCalledOnce()
  view.rerender(<CanvasWorkflowTools toolbar={{ ...toolbar, draftOpen: true }} />)
  expect(screen.getByRole('button', { name: '添加节点' })).toBeDisabled()
})

test('batch status only retries the paused node and dismisses completed batches', () => {
  const retry = vi.fn(), dismiss = vi.fn()
  const batch = { id: 'batch', label: '组合', status: 'paused' as const, completed: 1, total: 2, error: '请重试' }
  const view = render(<CanvasWorkflowBatchStatus batch={batch} onRetry={retry} onDismiss={dismiss} />)
  fireEvent.click(screen.getByRole('button', { name: '重试当前节点' }))
  expect(retry).toHaveBeenCalledOnce()
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '1')
  view.rerender(<CanvasWorkflowBatchStatus batch={{ ...batch, status: 'completed' }} onRetry={retry} onDismiss={dismiss} />)
  expect(screen.queryByRole('button', { name: '重试当前节点' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '完成' }))
  expect(dismiss).toHaveBeenCalledOnce()
})

test('resource and Agent panels receive the same project identity, labels and callbacks', () => {
  const project = makeProjectFixture(), select = vi.fn(), execute = vi.fn()
  const props = { project, mode: 'workflow' as const, panel: 'assets' as const, agentOpen: true, selectedNodeId: 'shot-1',
    storyboard: { onOpenNode: select, onReorderNodes: vi.fn(), onUpdateDialogue: vi.fn() },
    resources: { assetRepository: { list: vi.fn(), rename: vi.fn(), move: vi.fn(), deleteAsset: vi.fn() }, onClose: vi.fn(), onSelectNode: select },
    agent: { onClose: vi.fn(), onExecute: execute }, collaborationRepository: { listComments: vi.fn(), addComment: vi.fn(), resolveComment: vi.fn() },
  }
  const view = render(<CanvasWorkspacePanels {...props} />)
  expect(spies.resources).toHaveBeenLastCalledWith(expect.objectContaining({ project, panel: 'assets' }))
  expect(spies.agent).toHaveBeenLastCalledWith(expect.objectContaining({ selectedNodeId: 'shot-1', selectedNodeTitle: '河岸寻人', assetNames: ['河岸寻人', '雨声音轨'], onExecute: execute }))
  fireEvent.click(screen.getByRole('button', { name: '打开资源节点' }))
  expect(select).toHaveBeenCalledWith('shot-1')
  view.rerender(<CanvasWorkspacePanels {...props} mode="storyboard" agentOpen={false} panel={undefined} />)
  expect(screen.getByText('故事板面板')).toBeVisible()
  expect(screen.queryByText('Agent面板')).not.toBeInTheDocument()
})

test('project layer passes import conflicts and cancellation without an extra wrapper', () => {
  const confirm = vi.fn(), cancel = vi.fn()
  const view = render(<CanvasProjectDialogs workflowImport={{ fileName: 'scene.json', result: { valid: false, errors: [], titleConflicts: ['图片01'], missingReferences: ['来源不存在'] }, onClose: cancel, onConfirm: confirm }} />)
  expect(screen.getByRole('dialog', { name: '导入工作流 JSON' })).toHaveTextContent('来源不存在')
  expect(screen.getByRole('button', { name: '确认合并' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(cancel).toHaveBeenCalledOnce()
  expect(confirm).not.toHaveBeenCalled()
  view.rerender(<CanvasProjectDialogs />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('node editor keeps draft state on rerender and does not render a missing card', () => {
  const project = makeProjectFixture(), submit = vi.fn()
  const props = { project, pendingPlacement: { projectId: project.id, kind: 'text' as const, entry: 'add-node' as const, position: { x: 0, y: 0 }, anchor: { x: 20, y: 20 }, bounds: { width: 1440, height: 900 } }, libraryRepository: { list: vi.fn().mockResolvedValue([]) },
    cancelPlacement: vi.fn(), submitPlacement: submit, submitCardPlacement: vi.fn(), cancelCardEditing: vi.fn(), submitCardEdit: vi.fn() }
  const view = render(<CanvasNodeEditors {...props} />)
  const input = screen.getByRole('textbox', { name: '文字内容' })
  fireEvent.change(input, { target: { value: '保留草稿' } })
  view.rerender(<CanvasNodeEditors {...props} project={{ ...project }} />)
  expect(screen.getByRole('textbox', { name: '文字内容' })).toHaveValue('保留草稿')
  expect(submit).not.toHaveBeenCalled()
  view.rerender(<CanvasNodeEditors {...props} pendingPlacement={undefined} editingCard={{ projectId: project.id, nodeId: 'missing', anchor: { x: 20, y: 20 }, bounds: { width: 1440, height: 900 } }} />)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})
