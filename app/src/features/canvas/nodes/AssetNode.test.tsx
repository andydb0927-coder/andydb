import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { render, screen } from '@testing-library/react'
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
