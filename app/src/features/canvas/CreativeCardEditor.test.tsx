import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { LibraryAssetRecord } from '../assets/library-model'
import type { CreativeCardKind } from '../project/model'
import { CreativeCardEditor } from './CreativeCardEditor'

const image: LibraryAssetRecord = {
  id: 'look-image',
  name: '林渊定妆.png',
  kind: 'image',
  mimeType: 'image/png',
  url: 'data:image/png;base64,AA==',
  createdAt: '2026-08-13T08:00:00.000Z',
  source: 'upload',
}

const video: LibraryAssetRecord = {
  ...image,
  id: 'reference-video',
  name: '动作参考.mp4',
  kind: 'video',
  mimeType: 'video/mp4',
}

const defaultProps = {
  kind: 'script' as const,
  initialTitle: '剧本卡 01',
  anchor: { x: 420, y: 300 },
  bounds: { width: 1280, height: 720 },
  libraryRepository: { list: vi.fn().mockResolvedValue([]) },
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
})

describe('creative card editor', () => {
  test('announces the in-progress image library read', () => {
    const pending = createDeferred()
    render(
      <CreativeCardEditor
        {...defaultProps}
        libraryRepository={{ list: vi.fn(() => pending.promise.then(() => [])) }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('正在读取图片素材')
  })

  test.each([
    ['script', '创建剧本卡', ['分场', '对白', '镜头备注']],
    [
      'character-card',
      '创建角色卡',
      ['姓名', '外貌锚点', '服化道', '关系'],
    ],
    ['worldview', '创建世界观卡', ['背景', '美术风格', '规则']],
  ] as const)('renders the focused %s structured form', (kind, name, labels) => {
    render(
      <CreativeCardEditor
        {...defaultProps}
        kind={kind as CreativeCardKind}
        initialTitle={`${name} 01`}
      />,
    )

    expect(screen.getByRole('dialog', { name })).toBeVisible()
    expect(screen.getByLabelText('标题')).toHaveFocus()
    for (const label of labels) {
      expect(screen.getByLabelText(label)).toBeVisible()
    }
    expect(screen.getByLabelText('引用图片素材')).toBeVisible()
  })

  test('loads only image assets and submits a complete character draft', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const libraryRepository = {
      list: vi.fn().mockResolvedValue([video, image]),
    }
    render(
      <CreativeCardEditor
        {...defaultProps}
        kind="character-card"
        initialTitle="林渊角色卡"
        libraryRepository={libraryRepository}
        onSubmit={onSubmit}
      />,
    )

    expect(await screen.findByRole('option', { name: '林渊定妆.png' })).toBeVisible()
    expect(screen.queryByRole('option', { name: '动作参考.mp4' })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('姓名'), '林渊')
    await user.type(screen.getByLabelText('外貌锚点'), '短发，右眼下有小痣')
    await user.type(screen.getByLabelText('服化道'), '深灰长风衣')
    await user.type(screen.getByLabelText('关系'), '林舟的姐姐')
    await user.selectOptions(screen.getByLabelText('引用图片素材'), image.id)
    await user.click(screen.getByRole('button', { name: '确认创建' }))

    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'character-card',
      title: '林渊角色卡',
      name: '林渊',
      appearance: '短发，右眼下有小痣',
      wardrobe: '深灰长风衣',
      relationships: '林舟的姐姐',
      image,
    })
  })

  test('links structured validation errors and supports Control+Enter', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <CreativeCardEditor {...defaultProps} onSubmit={onSubmit} />,
    )

    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(screen.getByLabelText('分场')).toHaveAccessibleDescription('请输入分场')
    expect(onSubmit).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('分场'), '场一：雨夜河岸')
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'script',
      title: '剧本卡 01',
      scenes: '场一：雨夜河岸',
      dialogue: '',
      shotNotes: '',
    })
  })

  test('edits existing card values and cancels with Escape', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <CreativeCardEditor
        {...defaultProps}
        kind="worldview"
        initialTitle="潮汐城世界观"
        initialCard={{
          kind: 'worldview',
          background: '雨季淹城三天',
          artStyle: '低饱和蓝绿胶片',
          rules: '铜铃后不直呼失踪者姓名',
          imageAssetId: image.id,
        }}
        initialImage={image}
        libraryRepository={{ list: vi.fn().mockResolvedValue([]) }}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByRole('dialog', { name: '编辑世界观卡' })).toBeVisible()
    expect(screen.getByLabelText('背景')).toHaveValue('雨季淹城三天')
    expect(await screen.findByRole('option', { name: '林渊定妆.png' })).toBeVisible()
    expect(screen.getByLabelText('引用图片素材')).toHaveValue(image.id)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  test('keeps card editing available when the asset library cannot load', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <CreativeCardEditor
        {...defaultProps}
        kind="worldview"
        initialTitle="潮汐城世界观"
        libraryRepository={{ list: vi.fn().mockRejectedValue(new Error('offline')) }}
        onSubmit={onSubmit}
      />,
    )

    expect(
      await screen.findByText('素材库暂不可用，仍可保存卡片'),
    ).toHaveAttribute('role', 'alert')
    await user.type(screen.getByLabelText('背景'), '雨季淹城三天')
    await user.type(screen.getByLabelText('美术风格'), '低饱和蓝绿胶片')
    await user.click(screen.getByRole('button', { name: '确认创建' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  })

  test('blocks repeat submission while a save is pending', async () => {
    const user = userEvent.setup()
    const pending = createDeferred()
    const onSubmit = vi.fn(() => pending.promise)
    render(<CreativeCardEditor {...defaultProps} onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('分场'), '场一：雨夜河岸')

    const submit = screen.getByRole('button', { name: '确认创建' })
    await user.click(submit)
    expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '保存中…' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)

    pending.resolve()
    await waitFor(() => expect(submit).toBeEnabled())
  })
})
