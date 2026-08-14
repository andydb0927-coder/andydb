import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { CreativeFlowNode, CreativeNodeData } from '../node-types'
import { AssetNode } from './AssetNode'

function renderNode(onHandleActivate = vi.fn()) {
  const data: CreativeNodeData = {
    node: {
      id: 'character',
      kind: 'character',
      title: '角色参考',
      position: { x: 0, y: 0 },
      versions: [],
      activeVersionId: '',
      sourceChanged: false,
    },
    selected: true,
    actionsPlacement: 'after',
    contextual: false,
    connectionMode: true,
    connectionSource: true,
    focusOnMount: false,
    focusRequestVersion: 0,
    onAction: vi.fn(),
    onSelect: vi.fn(),
    onHandleActivate,
    onFocusComplete: vi.fn(),
    onDelete: vi.fn(),
  }
  const node: CreativeFlowNode = {
    id: data.node.id,
    type: data.node.kind,
    position: data.node.position,
    initialWidth: 320,
    initialHeight: 220,
    data,
  }

  const view = render(
    <div style={{ width: 600, height: 400 }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={[node]}
          edges={[]}
          nodeTypes={{ character: AssetNode }}
        />
      </ReactFlowProvider>
    </div>,
  )

  return { ...view, onHandleActivate }
}

test('uses real React Flow handles with button semantics and keyboard actions', async () => {
  const user = userEvent.setup()
  const { onHandleActivate } = renderNode()
  const target = screen.getByRole('button', { name: '连接到角色参考' })
  const source = screen.getByRole('button', {
    name: '从角色参考建立连接',
  })

  expect(target.tagName).toBe('DIV')
  expect(source.tagName).toBe('DIV')
  expect(target).toHaveAttribute('tabindex', '0')
  expect(source).toHaveAttribute('tabindex', '0')

  source.focus()
  await user.keyboard('{Enter}')
  expect(onHandleActivate).toHaveBeenLastCalledWith('source', source)

  target.focus()
  await user.keyboard(' ')
  expect(onHandleActivate).toHaveBeenLastCalledWith('target', target)
})

test('exposes connection mode and selected-source state on the real node shell', () => {
  const { container } = renderNode()

  expect(container.querySelector('.creative-node')).toHaveClass(
    'creative-node--connection-mode',
    'creative-node--connection-source',
  )
})

test('keeps image nodes folded until they become the current selection', async () => {
  const user = userEvent.setup()
  const onSetActiveResult = vi.fn()
  const baseData = {
    node: {
      id: 'image-node',
      kind: 'image' as const,
      title: 'L1',
      position: { x: 0, y: 0 },
      versions: [{ id: 'v1', createdAt: '2026-08-14T00:00:00.000Z', prompt: '雾中茶山', assetId: 'asset-1' }],
      activeVersionId: 'v1',
      activeResultId: 'result-1',
      imageResults: [
        { id: 'result-1', assetId: 'asset-1' },
        { id: 'result-2', assetId: 'asset-2' },
        { id: 'result-3', assetId: 'asset-3' },
        { id: 'result-4', assetId: 'asset-4' },
      ],
      sourceChanged: false,
    },
    asset: { id: 'asset-1', kind: 'image' as const, url: '/one.png', mimeType: 'image/png', width: 1456, height: 816 },
    imageResults: [1, 2, 3, 4].map((number) => ({
      id: `result-${number}`,
      asset: { id: `asset-${number}`, kind: 'image' as const, url: `/${number}.png`, mimeType: 'image/png', width: 1456, height: 816 },
    })),
    selected: false,
    contextual: false,
    actionsPlacement: 'after' as const,
    connectionMode: false,
    connectionSource: false,
    focusOnMount: false,
    focusRequestVersion: 0,
    onAction: vi.fn(),
    onSelect: vi.fn(),
    onHandleActivate: vi.fn(),
    onFocusComplete: vi.fn(),
    onDelete: vi.fn(),
    onSetActiveResult,
  }

  const renderWith = (data: typeof baseData) => (
    <div style={{ width: 900, height: 700 }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={[{ id: 'image-node', type: 'image', position: { x: 0, y: 0 }, initialWidth: 360, initialHeight: 620, data }]}
          edges={[]}
          nodeTypes={{ image: AssetNode }}
        />
      </ReactFlowProvider>
    </div>
  )
  const view = render(renderWith(baseData))

  expect(screen.getByText('1456 × 816')).toBeVisible()
  expect(screen.getByRole('button', { name: '查看 4 张结果' })).toBeVisible()
  expect(screen.queryByRole('region', { name: 'L1 生成参数' })).not.toBeInTheDocument()

  view.rerender(renderWith({ ...baseData, selected: true, contextual: true }))
  const generation = screen.getByRole('region', { name: 'L1 生成参数' })
  expect(within(generation).getByLabelText('提示词')).toHaveValue('雾中茶山')
  expect(within(generation).getByRole('combobox', { name: '图片模型' })).toHaveValue(
    'mock-mj-image',
  )
  expect(within(generation).getByText('预计成本 15')).toBeVisible()

  await user.click(screen.getByRole('button', { name: '查看 4 张结果' }))
  const results = screen.getByRole('region', { name: 'L1 的 4 张结果' })
  expect(within(results).getAllByRole('img')).toHaveLength(4)
  await user.click(within(results).getByRole('button', { name: '将结果 2 设为主图' }))
  expect(screen.getByRole('alertdialog', { name: '设为主图' })).toHaveTextContent(
    '下游引用将使用新的主图',
  )
  await user.click(screen.getByRole('button', { name: '确认设为主图' }))
  expect(onSetActiveResult).toHaveBeenCalledWith('result-2')
})
