import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { Position } from '@xyflow/react'
import { expect, test, vi } from 'vitest'

import { DependencyEdge } from './DependencyEdge'

vi.mock('@xyflow/react', () => ({
  BaseEdge: () => null,
  EdgeLabelRenderer: ({ children }: PropsWithChildren) => children,
  Position: { Left: 'left', Right: 'right' },
  getBezierPath: () => ['M0 0L100 100', 50, 50],
}))

test('renders the selected edge delete action at the path label point', async () => {
  const user = userEvent.setup()
  const onDelete = vi.fn()
  render(
    <DependencyEdge
      id="edge-a-b"
      source="a"
      target="b"
      sourceX={0}
      sourceY={0}
      targetX={100}
      targetY={100}
      sourcePosition={Position.Right}
      targetPosition={Position.Left}
      selected
      data={{
        sourceChanged: false,
        ariaLabel: '角色参考 → 分镜 01',
        onDelete,
      }}
    />,
  )
  await user.click(
    screen.getByRole('button', { name: '删除连接：角色参考 → 分镜 01' }),
  )
  expect(onDelete).toHaveBeenCalledWith('edge-a-b')
})

test('does not render the edge delete action until selected', () => {
  render(
    <DependencyEdge
      id="edge-a-b"
      source="a"
      target="b"
      sourceX={0}
      sourceY={0}
      targetX={100}
      targetY={100}
      sourcePosition={Position.Right}
      targetPosition={Position.Left}
      selected={false}
      data={{
        sourceChanged: false,
        ariaLabel: '角色参考 → 分镜 01',
        onDelete: vi.fn(),
      }}
    />,
  )

  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
