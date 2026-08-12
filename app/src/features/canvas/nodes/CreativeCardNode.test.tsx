import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { CreativeFlowNode, CreativeNodeData } from '../node-types'
import { CreativeCardNode } from './CreativeCardNode'

function renderCharacterCard(
  overrides: Partial<CreativeNodeData['node']> = {},
) {
  const onAction = vi.fn()
  const data: CreativeNodeData = {
    node: {
      id: 'character-card-linyuan',
      kind: 'character-card',
      title: '林渊角色卡',
      position: { x: 0, y: 0 },
      versions: [
        {
          id: 'character-card-version',
          createdAt: '2026-08-13T08:00:00.000Z',
          prompt: '姓名：林渊',
          assetId: 'character-look',
        },
      ],
      activeVersionId: 'character-card-version',
      sourceChanged: false,
      card: {
        kind: 'character-card',
        name: '林渊',
        appearance: '短发，右眼下有小痣',
        wardrobe: '深灰长风衣',
        relationships: '林舟的姐姐',
        imageAssetId: 'character-look',
      },
      ...overrides,
    },
    asset: {
      id: 'character-look',
      kind: 'image',
      mimeType: 'image/png',
      url: 'data:image/png;base64,AA==',
    },
    selected: true,
    actionsPlacement: 'after',
    contextual: true,
    connectionMode: true,
    connectionSource: true,
    focusOnMount: false,
    focusRequestVersion: 0,
    onAction,
    onSelect: vi.fn(),
    onHandleActivate: vi.fn(),
    onFocusComplete: vi.fn(),
    onDelete: vi.fn(),
  }
  const node: CreativeFlowNode = {
    id: data.node.id,
    type: data.node.kind,
    position: data.node.position,
    initialWidth: 360,
    initialHeight: 300,
    data,
  }

  const view = render(
    <div style={{ width: 800, height: 600 }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={[node]}
          edges={[]}
          nodeTypes={{ 'character-card': CreativeCardNode }}
        />
      </ReactFlowProvider>
    </div>,
  )

  return { ...view, onAction }
}

test('renders structured character fields, image reference, and edit action', async () => {
  const user = userEvent.setup()
  const { container, onAction } = renderCharacterCard()

  expect(screen.getByText('角色卡')).toBeInTheDocument()
  expect(screen.getByText('林渊')).toBeInTheDocument()
  expect(screen.getByText('短发，右眼下有小痣')).toBeInTheDocument()
  expect(screen.getByText('深灰长风衣')).toBeInTheDocument()
  expect(screen.getByText('林舟的姐姐')).toBeInTheDocument()
  expect(container.querySelector('.creative-card-node__image')).toHaveAttribute(
    'src',
    'data:image/png;base64,AA==',
  )

  const edit = screen.getByRole('button', { name: '编辑卡片' })
  await user.click(edit)
  expect(onAction).toHaveBeenCalledWith('edit-card', edit)
})

test('keeps real connection handles keyboard accessible', async () => {
  const user = userEvent.setup()
  renderCharacterCard()
  const source = screen.getByRole('button', {
    name: '从林渊角色卡建立连接',
  })
  const target = screen.getByRole('button', { name: '连接到林渊角色卡' })

  expect(source).toHaveAttribute('tabindex', '0')
  expect(target).toHaveAttribute('tabindex', '0')
  source.focus()
  await user.keyboard('{Enter}')
})

test('survives a persisted card with missing structured data', () => {
  renderCharacterCard({ card: undefined })
  expect(screen.getByText('卡片数据不可用')).toBeInTheDocument()
})
