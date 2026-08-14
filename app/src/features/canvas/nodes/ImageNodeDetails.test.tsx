import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { CreativeNodeData } from '../node-types'
import { ImageGenerationPanel } from './ImageNodeDetails'

function makeData(
  overrides: Partial<CreativeNodeData> = {},
): CreativeNodeData {
  return {
    node: {
      id: 'image-node',
      kind: 'image',
      title: 'L1',
      position: { x: 0, y: 0 },
      versions: [
        {
          id: 'image-version',
          createdAt: '2026-08-14T00:00:00.000Z',
          prompt: '雾中茶山',
          assetId: 'image-asset',
        },
      ],
      activeVersionId: 'image-version',
      sourceChanged: false,
    },
    asset: {
      id: 'image-asset',
      kind: 'image',
      url: '/demo/shot-river.png',
      mimeType: 'image/png',
      width: 1456,
      height: 816,
    },
    selected: true,
    contextual: true,
    actionsPlacement: 'after',
    connectionMode: false,
    connectionSource: false,
    focusOnMount: false,
    focusRequestVersion: 0,
    onAction: vi.fn(),
    onSelect: vi.fn(),
    onHandleActivate: vi.fn(),
    onFocusComplete: vi.fn(),
    onDelete: vi.fn(),
    onUpdateImageGenerationSettings: vi.fn(),
    onSelectModelProvider: vi.fn(),
    onStartImageReferenceSelection: vi.fn(),
    onEndImageReferenceSelection: vi.fn(),
    onLocalImageGenerate: vi.fn(),
    ...overrides,
  }
}

test('exposes the verified MJ image settings with persistent accessible controls', async () => {
  const user = userEvent.setup()
  const data = makeData()
  render(<ImageGenerationPanel data={data} />)
  const panel = screen.getByRole('region', { name: 'L1 生成参数' })

  const model = within(panel).getByRole('combobox', { name: '图片模型' })
  expect(model).toHaveValue('mock-mj-image')
  expect(within(model).getByRole('option', { name: /Mock Studio.*MJ 风格图片.*15 积分\/次.*演示/ })).toBeEnabled()
  expect(within(model).getByRole('option', { name: /通义万相.*待接入/ })).toBeDisabled()
  expect(within(panel).getByText('演示', { exact: true })).toBeVisible()
  await user.selectOptions(model, 'mock-mj-image')
  expect(data.onSelectModelProvider).toHaveBeenCalledWith('mock-mj-image')

  await user.click(
    within(panel).getByRole('button', { name: '展开高级设置' }),
  )
  expect(within(panel).getByLabelText('个性化风格 P 值')).toHaveValue('')
  expect(within(panel).getByText(/同步你的 MJ 专属风格/)).toBeVisible()
  expect(within(panel).getByLabelText('风格化程度')).toHaveAttribute('step', '50')
  expect(within(panel).getByLabelText('风格化程度')).toHaveValue('150')
  expect(within(panel).getByLabelText('怪异度')).toHaveAttribute('step', '50')
  expect(within(panel).getByLabelText('怪异度')).toHaveValue('50')
  expect(within(panel).getByLabelText('多样性')).toHaveAttribute('step', '5')
  expect(within(panel).getByLabelText('多样性')).toHaveValue('5')
  expect(within(panel).getByLabelText('智能引用 AutoLink')).toBeChecked()
  expect(within(panel).getByText('预计成本 15')).toBeVisible()

  await user.type(within(panel).getByLabelText('个性化风格 P 值'), 'p-demo')
  fireEvent.blur(within(panel).getByLabelText('个性化风格 P 值'))
  fireEvent.change(within(panel).getByLabelText('风格化程度'), {
    target: { value: '250' },
  })
  await user.click(within(panel).getByLabelText('智能引用 AutoLink'))

  expect(data.onUpdateImageGenerationSettings).toHaveBeenCalledWith({
    pValue: 'p-demo',
  })
  expect(data.onUpdateImageGenerationSettings).toHaveBeenCalledWith({
    stylization: 250,
  })
  expect(data.onUpdateImageGenerationSettings).toHaveBeenCalledWith({
    autoLink: false,
  })
})

test('opens a searchable three-tab style gallery with ten categories and complete cards', async () => {
  const user = userEvent.setup()
  render(<ImageGenerationPanel data={makeData()} />)
  const styleTrigger = screen.getByRole('button', { name: '风格' })
  await user.click(styleTrigger)

  const dialog = screen.getByRole('dialog', { name: '风格广场' })
  const tabs = within(dialog).getByRole('tablist', { name: '风格来源' })
  for (const tab of ['风格广场', '我的收藏', '最近使用']) {
    expect(within(tabs).getByRole('tab', { name: tab })).toBeVisible()
  }
  expect(
    within(dialog).getByPlaceholderText('搜索风格名称、作者'),
  ).toBeVisible()
  expect(
    within(
      within(dialog).getByRole('navigation', { name: '风格分类' }),
    ).getAllByRole('button'),
  ).toHaveLength(10)
  expect(within(dialog).getByLabelText('仅看可商用')).not.toBeChecked()

  const firstCard = within(dialog).getAllByRole('article')[0]
  expect(firstCard).toHaveTextContent('J_漫剧素材三视图')
  expect(firstCard).toHaveTextContent('JM32')
  expect(firstCard).toHaveTextContent('4900')
  expect(firstCard).toHaveTextContent('商用')
  expect(firstCard).toHaveTextContent('Style Image V8.2')
  expect(within(firstCard).getByRole('button', { name: /收藏/ })).toBeVisible()
  await user.click(within(firstCard).getByRole('button', { name: /详情/ }))
  expect(
    within(dialog).getByRole('region', { name: 'J_漫剧素材三视图详情' }),
  ).toBeVisible()

  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: '风格广场' })).not.toBeInTheDocument()
  expect(styleTrigger).toHaveFocus()
})

test('requires prompt or media and a visible cost before local image submission', async () => {
  const user = userEvent.setup()
  const data = makeData({
    asset: undefined,
    node: {
      ...makeData().node,
      versions: [
        {
          id: 'blank-version',
          createdAt: '2026-08-14T00:00:00.000Z',
          prompt: '',
        },
      ],
      activeVersionId: 'blank-version',
    },
  })
  render(<ImageGenerationPanel data={data} />)
  const panel = screen.getByRole('region', { name: 'L1 生成参数' })
  const submit = within(panel).getByRole('button', {
    name: '生成图片，预计成本 15',
  })

  expect(submit).toBeDisabled()
  expect(within(panel).getByText('请输入提示词或添加参考媒体后再生成。')).toBeVisible()
  expect(within(panel).getByRole('button', { name: '翻译提示词' })).toBeDisabled()
  expect(within(panel).getByText('翻译服务未接入，本地演示暂不可用。')).toBeVisible()

  await user.type(within(panel).getByLabelText('提示词'), '雨夜角色特写')
  expect(submit).toBeEnabled()
  await user.click(submit)
  expect(data.onLocalImageGenerate).toHaveBeenCalledOnce()
})

test('exposes canvas reference mode controls without creating an edge locally', async () => {
  const user = userEvent.setup()
  const data = makeData()
  const view = render(<ImageGenerationPanel data={data} />)

  const referenceTrigger = screen.getByRole('button', { name: '参考' })
  await user.click(referenceTrigger)
  expect(data.onStartImageReferenceSelection).toHaveBeenCalledWith(
    referenceTrigger,
  )

  view.rerender(
    <ImageGenerationPanel data={{ ...data, imageReferenceSelecting: true }} />,
  )
  const mode = screen.getByRole('region', { name: '从画布选择参考' })
  expect(mode).toHaveTextContent('从画布选择参考')
  expect(mode).toHaveTextContent('在当前画布中添加参考')
  await user.click(within(mode).getByRole('button', { name: '返回节点' }))
  expect(data.onEndImageReferenceSelection).toHaveBeenCalledWith(true)
})
