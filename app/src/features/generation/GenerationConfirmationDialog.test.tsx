import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { GenerationConfirmationDialog } from './GenerationConfirmationDialog'

const selection = {
  projectUuid: '11111111-2222-3333-4444-555555555555',
  projectName: '低成本验收画布',
  imageModelName: 'Image Model',
  videoModelName: 'Video Model',
}

const request = {
  projectId: 'local-project',
  nodeId: 'storyboard',
  operation: 'regenerate' as const,
  targetKind: 'image' as const,
  prompt: '雨夜人物特写',
  referenceAssets: [
    { url: '/reference.png', kind: 'image' as const, mimeType: 'image/png' },
  ],
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('GenerationConfirmationDialog', () => {
  test('describes the billable remote operation and initially focuses Cancel', () => {
    const trigger = document.createElement('button')
    trigger.textContent = '重生成'
    document.body.append(trigger)
    trigger.focus()

    render(
      <GenerationConfirmationDialog
        request={request}
        selection={selection}
        returnFocusTo={trigger}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '确认 LibTV 实际生成' })
    expect(dialog).toHaveTextContent('低成本验收画布')
    expect(dialog).toHaveTextContent('Image Model')
    expect(dialog).toHaveTextContent('重生成')
    expect(dialog).toHaveTextContent('1 个参考素材')
    expect(dialog).toHaveTextContent('会在远程画布创建生成节点')
    expect(dialog).toHaveTextContent('1 个参考素材会先上传到 LibTV')
    expect(dialog).toHaveTextContent('可能消耗 LibTV 积分')
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus()
  })

  test('closes with Escape, restores focus, and submits at most once', async () => {
    const user = userEvent.setup()
    const trigger = document.createElement('button')
    trigger.textContent = '生成视频'
    document.body.append(trigger)
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const view = render(
      <GenerationConfirmationDialog
        request={{ ...request, operation: 'generate-video', targetKind: 'video' }}
        selection={selection}
        returnFocusTo={trigger}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(trigger).toHaveFocus())

    view.unmount()
    render(
      <GenerationConfirmationDialog
        request={{ ...request, operation: 'generate-video', targetKind: 'video' }}
        selection={selection}
        returnFocusTo={trigger}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )
    const confirm = screen.getByRole('button', { name: '确认并提交 LibTV' })
    await user.dblClick(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
