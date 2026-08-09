import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { MAX_IMAGE_BYTES } from './image-file'
import {
  NodeDraftPanel,
  type NodeDraftFormValue,
} from './NodeDraftPanel'
import { clampDraftPanelPosition } from './draft-panel-position'

const defaultProps = {
  kind: 'storyboard' as const,
  initialTitle: '分镜 03',
  anchor: { x: 420, y: 300 },
  bounds: { width: 1280, height: 720 },
  onCancel: vi.fn(),
  onSubmit: vi.fn(),
}

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('node draft panel', () => {
  test.each([
    ['text', '创建文本节点', '文字内容'],
    ['image', '创建图片节点', '图片描述（选填）'],
    ['storyboard', '创建分镜节点', '画面提示词'],
    ['video', '创建视频节点', '视频提示词'],
  ] as const)(
    'renders the focused %s form with its exact fields',
    (kind, dialogName, contentLabel) => {
      render(
        <NodeDraftPanel
          {...defaultProps}
          kind={kind}
          initialTitle={`${dialogName} 01`}
        />,
      )

      expect(screen.getByRole('dialog', { name: dialogName })).toBeVisible()
      expect(screen.getByLabelText('标题')).toHaveFocus()
      expect(screen.getByLabelText(contentLabel)).toBeVisible()
      if (kind === 'image') {
        expect(screen.getByLabelText('本地图片')).toBeVisible()
      } else {
        expect(screen.queryByLabelText('本地图片')).not.toBeInTheDocument()
      }
    },
  )

  test.each([
    [{ x: -20, y: -30 }, { width: 1280, height: 720 }, [16, 16, 320, 440]],
    [{ x: 1200, y: 700 }, { width: 1280, height: 720 }, [944, 264, 320, 440]],
    [{ x: 300, y: 420 }, { width: 320, height: 440 }, [16, 16, 288, 408]],
    [{ x: 700, y: 760 }, { width: 721, height: 778 }, [385, 322, 320, 440]],
  ] as const)(
    'clamps anchor %# inside its visible bounds',
    (anchor, bounds, expected) => {
      expect(clampDraftPanelPosition(anchor, bounds)).toEqual({
        left: expected[0],
        top: expected[1],
        width: expected[2],
        maxHeight: expected[3],
      })
    },
  )

  test('links required errors to text fields without submitting', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <NodeDraftPanel
        {...defaultProps}
        kind="text"
        initialTitle=" "
        onSubmit={onSubmit}
      />,
    )

    await user.click(screen.getByRole('button', { name: '确认创建' }))

    const title = screen.getByLabelText('标题')
    const content = screen.getByLabelText('文字内容')
    expect(title).toHaveAccessibleDescription('请输入标题')
    expect(content).toHaveAccessibleDescription('请输入文字内容')
    expect(screen.getByText('请输入标题')).toHaveAttribute('role', 'alert')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('keeps plain Enter as a newline and submits with Control+Enter', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <NodeDraftPanel
        {...defaultProps}
        kind="text"
        initialTitle="文本 01"
        onSubmit={onSubmit}
      />,
    )
    const content = screen.getByLabelText('文字内容')

    await user.click(content)
    await user.keyboard('第一行{Enter}第二行')
    expect(content).toHaveValue('第一行\n第二行')
    expect(onSubmit).not.toHaveBeenCalled()

    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(onSubmit).toHaveBeenCalledWith({
      title: '文本 01',
      content: '第一行\n第二行',
    })
  })

  test('cancels with Escape', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onSubmit = vi.fn()
    render(
      <NodeDraftPanel
        {...defaultProps}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    )

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('surfaces image type and size errors without reading the file', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const read = vi.spyOn(FileReader.prototype, 'readAsDataURL')
    render(
      <NodeDraftPanel
        {...defaultProps}
        kind="image"
        initialTitle="图片 01"
      />,
    )
    const input = screen.getByLabelText('本地图片')

    await user.upload(
      input,
      new File(['gif'], 'frame.gif', { type: 'image/gif' }),
    )
    expect(screen.getByText('仅支持 PNG、JPEG 或 WebP 图片')).toBeVisible()

    await user.upload(
      input,
      new File(
        [new Uint8Array(MAX_IMAGE_BYTES + 1)],
        'large.png',
        { type: 'image/png' },
      ),
    )
    expect(screen.getByText('图片不能超过 8 MB')).toBeVisible()
    expect(read).not.toHaveBeenCalled()
  })

  test('preserves fields after a read failure and accepts a replacement image', async () => {
    const user = userEvent.setup()
    const originalRead = FileReader.prototype.readAsDataURL
    vi.spyOn(FileReader.prototype, 'readAsDataURL')
      .mockImplementationOnce(function failRead(this: FileReader) {
        this.dispatchEvent(new Event('error'))
      })
      .mockImplementation(function readNormally(this: FileReader, file: Blob) {
        originalRead.call(this, file)
      })
    const onSubmit = vi.fn()
    render(
      <NodeDraftPanel
        {...defaultProps}
        kind="image"
        initialTitle="图片 01"
        onSubmit={onSubmit}
      />,
    )
    const title = screen.getByLabelText('标题')
    const description = screen.getByLabelText('图片描述（选填）')
    const input = screen.getByLabelText('本地图片')
    await user.clear(title)
    await user.type(title, '雨夜参考')
    await user.type(description, '玻璃窗后的侧脸')

    await user.upload(
      input,
      new File(['broken'], 'broken.png', { type: 'image/png' }),
    )
    expect(await screen.findByText('无法读取图片，请重新选择')).toBeVisible()
    expect(title).toHaveValue('雨夜参考')
    expect(description).toHaveValue('玻璃窗后的侧脸')

    await user.upload(
      input,
      new File(['good'], 'good.png', { type: 'image/png' }),
    )
    expect(await screen.findByText('已选择 good.png')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '确认创建' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining<NodeDraftFormValue>({
        title: '雨夜参考',
        content: '玻璃窗后的侧脸',
        image: expect.objectContaining({
          mimeType: 'image/png',
          dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
        }),
      }),
    )
  })

  test('disables confirmation while an async submission is pending', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred()
    render(
      <NodeDraftPanel
        {...defaultProps}
        initialTitle="分镜 03"
        onSubmit={() => deferred.promise}
      />,
    )
    await user.type(screen.getByLabelText('画面提示词'), '远景，雨夜河岸')

    await user.click(screen.getByRole('button', { name: '确认创建' }))
    expect(screen.getByRole('button', { name: '创建中…' })).toBeDisabled()

    deferred.resolve()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '确认创建' })).toBeEnabled()
    })
  })

  test('disables confirmation while a selected image is still being read', async () => {
    const user = userEvent.setup()
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(() => {})
    render(
      <NodeDraftPanel
        {...defaultProps}
        kind="image"
        initialTitle="图片 01"
      />,
    )

    await user.upload(
      screen.getByLabelText('本地图片'),
      new File(['png'], 'pending.png', { type: 'image/png' }),
    )

    const dialog = screen.getByRole('dialog', { name: '创建图片节点' })
    expect(within(dialog).getByRole('button', { name: '读取图片中…' })).toBeDisabled()
  })
})
