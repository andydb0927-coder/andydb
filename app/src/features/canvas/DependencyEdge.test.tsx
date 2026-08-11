import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSyncExternalStore, type PropsWithChildren } from 'react'
import { Position } from '@xyflow/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { DependencyEdge } from './DependencyEdge'

const flowStore = vi.hoisted(() => ({
  transform: [0, 0, 1] as [number, number, number],
  width: 0,
  height: 0,
  useStoreCallCount: 0,
  domNode: null as { getBoundingClientRect(): DOMRect } | null,
}))

const bezierPath = vi.hoisted(() => ({ labelX: 50, labelY: 50 }))

vi.mock('@xyflow/react', () => ({
  BaseEdge: ({
    path,
    interactionWidth,
    ...props
  }: {
    path: string
    interactionWidth?: number
    [key: string]: unknown
  }) => (
    <path
      {...props}
      d={path}
      data-interaction-width={interactionWidth}
      data-testid="dependency-visible-path"
    />
  ),
  EdgeLabelRenderer: ({ children }: PropsWithChildren) => children,
  Position: { Left: 'left', Right: 'right' },
  getBezierPath: () => [
    'M0 0L100 100',
    bezierPath.labelX,
    bezierPath.labelY,
  ],
  useStore: (selector: (state: typeof flowStore) => unknown) => {
    flowStore.useStoreCallCount += 1
    useSyncExternalStore(
      () => () => {},
      () => flowStore,
      () => flowStore,
    )
    return selector(flowStore)
  },
}))

beforeEach(() => {
  flowStore.transform = [0, 0, 1]
  flowStore.width = 0
  flowStore.height = 0
  flowStore.useStoreCallCount = 0
  flowStore.domNode = null
  bezierPath.labelX = 50
  bezierPath.labelY = 50
})

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
        visible: true,
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

test.each([
  { zoom: 0.35, graphStrokeWidth: 68.57142857142857 },
  { zoom: 1, graphStrokeWidth: 24 },
  { zoom: 1.8, graphStrokeWidth: 13.333333333333332 },
])(
  'applies a $graphStrokeWidth graph-space interaction stroke at zoom $zoom',
  ({ zoom, graphStrokeWidth }) => {
    flowStore.transform = [0, 0, zoom]
    const { container } = render(
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
          visible: true,
          sourceChanged: false,
          ariaLabel: '角色参考 → 分镜 01',
          onDelete: vi.fn(),
        }}
      />,
    )

    expect(screen.getByTestId('dependency-visible-path')).toHaveAttribute(
      'vector-effect',
      'non-scaling-stroke',
    )
    expect(screen.getByTestId('dependency-visible-path')).toHaveAttribute(
      'data-interaction-width',
      '0',
    )
    const interaction = container.querySelector(
      '.dependency-edge__interaction',
    )
    expect(
      Number(interaction?.getAttribute('stroke-width')),
    ).toBeCloseTo(graphStrokeWidth, 8)
    expect(interaction).toHaveAttribute(
      'vector-effect',
      'non-scaling-stroke',
    )
  },
)

test('inverse-scales the selected delete action at minZoom', () => {
  flowStore.transform = [100, 80, 0.35]
  flowStore.width = 721
  flowStore.height = 778
  flowStore.domNode = {
    getBoundingClientRect: () =>
      ({
        left: 0,
        top: 0,
        right: 721,
        bottom: 778,
        width: 721,
        height: 778,
      }) as DOMRect,
  }
  bezierPath.labelX = 500
  bezierPath.labelY = 500

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
        visible: true,
        sourceChanged: false,
        ariaLabel: '角色参考 → 视频 01',
        onDelete: vi.fn(),
      }}
    />,
  )

  const scale = screen
    .getByRole('button', { name: '删除连接：角色参考 → 视频 01' })
    .style.transform.match(/scale\(([\d.]+)\)/)
  expect(scale).not.toBeNull()
  expect(Number(scale![1])).toBeCloseTo(1 / 0.35, 6)
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
        visible: true,
        sourceChanged: false,
        ariaLabel: '角色参考 → 分镜 01',
        onDelete: vi.fn(),
      }}
    />,
  )

  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('does not render paths, hit area, or delete action when hidden', () => {
  const { container } = render(
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
        visible: false,
        sourceChanged: false,
        ariaLabel: '角色参考 → 分镜 01',
        onDelete: vi.fn(),
      }}
    />,
  )

  expect(container.querySelector('.dependency-edge__paths')).toBeNull()
  expect(container.querySelector('.dependency-edge__interaction')).toBeNull()
  expect(
    screen.queryByRole('button', { name: /删除连接/ }),
  ).not.toBeInTheDocument()
})

test('can update from visible to hidden without changing Hook order', () => {
  const edgeProps = {
    id: 'edge-a-b',
    source: 'a',
    target: 'b',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected: true,
  }
  const { container, rerender } = render(
    <DependencyEdge
      {...edgeProps}
      data={{
        visible: true,
        sourceChanged: false,
        ariaLabel: '角色参考 → 分镜 01',
        onDelete: vi.fn(),
      }}
    />,
  )

  expect(() =>
    rerender(
      <DependencyEdge
        {...edgeProps}
        data={{
          visible: false,
          sourceChanged: false,
          ariaLabel: '角色参考 → 分镜 01',
          onDelete: vi.fn(),
        }}
      />,
    ),
  ).not.toThrow()
  expect(flowStore.useStoreCallCount).toBe(6)
  expect(container.querySelector('.dependency-edge__paths')).toBeNull()
  expect(container.querySelector('.dependency-edge__interaction')).toBeNull()
  expect(
    screen.queryByRole('button', { name: /删除连接/ }),
  ).not.toBeInTheDocument()
})

test('keeps the full delete control inside a 721 by 778 viewport after pan and zoom', () => {
  flowStore.transform = [500, 400, 2]
  flowStore.width = 721
  flowStore.height = 778
  flowStore.domNode = {
    getBoundingClientRect: () =>
      ({
        left: 0,
        top: 0,
        right: 721,
        bottom: 778,
        width: 721,
        height: 778,
      }) as DOMRect,
  }
  bezierPath.labelX = 200
  bezierPath.labelY = 200

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
        visible: true,
        sourceChanged: false,
        ariaLabel: '角色参考 → 视频 01',
        onDelete: vi.fn(),
      }}
    />,
  )

  const control = screen.getByRole('button', {
    name: '删除连接：角色参考 → 视频 01',
  })
  const match = control.style.transform.match(
    /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\) translate\(-50%, -50%\)$/,
  )
  expect(match).not.toBeNull()
  const screenCenterX = 500 + Number(match![1]) * 2
  const screenCenterY = 400 + Number(match![2]) * 2
  const renderedHalfSize = 16

  expect(Number(match![3])).toBeCloseTo(0.5, 6)
  expect(screenCenterX - renderedHalfSize).toBeGreaterThanOrEqual(0)
  expect(screenCenterX + renderedHalfSize).toBeLessThanOrEqual(721)
  expect(screenCenterY - renderedHalfSize).toBeGreaterThanOrEqual(0)
  expect(screenCenterY + renderedHalfSize).toBeLessThanOrEqual(778)
})
