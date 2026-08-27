import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { CanvasNode } from '../project/model'
import { NodeListView } from './NodeListView'

test('list regeneration uses the same validated generate action as the node composer', async () => {
  const user = userEvent.setup()
  const onAction = vi.fn()
  const node: CanvasNode = {
    id: 'empty-video', kind: 'video', title: '空视频', position: { x: 0, y: 0 },
    versions: [{ id: 'v1', prompt: '', createdAt: '2026-08-27T00:00:00.000Z' }],
    activeVersionId: 'v1', sourceChanged: false,
  }
  render(<NodeListView nodes={[node]} edges={[]} timeline={[]} jobs={[]} onSelect={vi.fn()} onAction={onAction} onClose={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '重生成 空视频' }))
  expect(onAction).toHaveBeenCalledWith(node.id, 'generate')
  await user.click(screen.getByRole('button', { name: '加入时间线 空视频' }))
  expect(onAction).toHaveBeenLastCalledWith(node.id, 'add-to-timeline')
})
