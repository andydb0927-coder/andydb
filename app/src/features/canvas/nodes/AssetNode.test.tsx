import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { CreativeNodeShell } from './AssetNode'

vi.mock('@xyflow/react', () => ({
  Handle: (props: { 'aria-label': string }) => (
    <button type="button" aria-label={props['aria-label']} />
  ),
  Position: { Left: 'left', Right: 'right' },
}))

test('names both ports and exposes connection source state', () => {
  const { container } = render(
    <CreativeNodeShell
      data={{
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
        onFocusComplete: vi.fn(),
        onDelete: vi.fn(),
      }}
    />,
  )

  expect(screen.getByRole('button', { name: '连接到角色参考' })).toBeVisible()
  expect(
    screen.getByRole('button', { name: '从角色参考建立连接' }),
  ).toBeVisible()
  expect(container.querySelector('.creative-node')).toHaveClass(
    'creative-node--connection-mode',
    'creative-node--connection-source',
  )
})
