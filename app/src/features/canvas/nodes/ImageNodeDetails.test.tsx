import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { expect, test, vi } from 'vitest'

import type { CreativeNodeData } from '../node-types'
import { createDefaultProviderRegistry } from '../../generation/model-provider-registry'
import { ImageGenerationPanel } from './ImageNodeDetails'
import { createFixtureProviderRegistry } from '../../../test/provider-fixtures'

function panelProps(data: CreativeNodeData) {
  return {
    data,
    imageToImage: false,
    onImageToImageChange: vi.fn(),
    upscalePending: false,
    onUpscalePendingChange: vi.fn(),
    upscaleTriggerRef: createRef<HTMLButtonElement>(),
  }
}

function makeData(
  overrides: Partial<CreativeNodeData> = {},
): CreativeNodeData {
  return {
    providerRegistry: createFixtureProviderRegistry(),
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
    onCreateImageToolNode: vi.fn(),
    ...overrides,
  }
}

test('matches the Liblib image action bar and generation copy without legacy node actions', async () => {
  const user = userEvent.setup()
  const data = makeData()
  render(<ImageGenerationPanel {...panelProps(data)} />)
  const panel = screen.getByRole('region', { name: 'L1 生成参数' })
  const actions = within(panel).getByRole('toolbar', { name: '图片主操作' })

  expect(within(actions).getAllByRole('button').map((button) => button.textContent)).toEqual([
    '参考',
    '标记',
    '风格',
  ])
  expect(within(actions).queryByRole('button', { name: '图片高清' })).not.toBeInTheDocument()
  for (const removed of ['重生成', '扩展镜头', '生成视频', '删除', '角色']) {
    expect(within(panel).queryByRole('button', { name: removed })).not.toBeInTheDocument()
  }
  expect(within(panel).getByRole('textbox', { name: '提示词' })).toHaveAttribute(
    'aria-placeholder',
    '可直接文字生图，或上传图片输入文字指令对图片进行编辑，如：将背景改为雪夜',
  )
  expect(within(panel).getByText('2816×1584 · 2K · 1张')).toBeVisible()
  expect(within(panel).getByRole('combobox', { name: '图片模型' })).toBeVisible()
  expect(within(panel).getByText('预计成本 18')).toBeVisible()
  expect(within(panel).getByRole('button', { name: '生成图片，预计成本 18' })).toBeEnabled()

  const expand = within(panel).getByRole('button', { name: '放大编辑区' })
  await user.click(expand)
  expect(panel).toHaveClass('image-generation-panel--expanded')
  expect(within(panel).getByRole('button', { name: '退出放大编辑区' })).toBeVisible()
})

test('opens the complete Liblib image parameter picker and persists its live summary', async () => {
  const user = userEvent.setup()
  const data = makeData()
  render(<ImageGenerationPanel {...panelProps(data)} />)
  const panel = screen.getByRole('region', { name: 'L1 生成参数' })
  const trigger = within(panel).getByRole('button', { name: '图片生成参数' })

  expect(trigger).toHaveTextContent('2816×1584 · 2K · 1张')
  await user.click(trigger)

  const dialog = within(panel).getByRole('dialog', { name: '图片生成参数' })
  expect(within(dialog).queryByRole('group', { name: '画质' })).not.toBeInTheDocument()
  const resolution = within(dialog).getByRole('group', { name: '清晰度' })
  const ratio = within(dialog).getByRole('group', { name: '比例' })
  const count = within(dialog).getByRole('group', { name: '生成数量' })

  expect(within(resolution).getAllByRole('button')).toHaveLength(3)
  expect(within(ratio).getAllByRole('button')).toHaveLength(15)
  expect(within(count).getAllByRole('button')).toHaveLength(3)
  expect(within(resolution).getByRole('button', { name: '2K' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(within(ratio).getByRole('button', { name: '16:9' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(within(count).getByRole('button', { name: '1张' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await user.click(within(resolution).getByRole('button', { name: '1.5K' }))
  await user.click(within(ratio).getByRole('button', { name: '9:16' }))
  await user.click(within(count).getByRole('button', { name: '2张' }))

  expect(trigger).toHaveTextContent('1152×2048 · 1.5K · 2张')
  expect(within(panel).getByText('预计成本 36')).toBeVisible()
  expect(data.onUpdateImageGenerationSettings).toHaveBeenCalledWith({
    resolution: '1.5K',
  })
  expect(data.onUpdateImageGenerationSettings).toHaveBeenCalledWith({
    aspectRatio: '9:16',
  })
  expect(data.onUpdateImageGenerationSettings).toHaveBeenCalledWith({ count: 2 })

  await user.keyboard('{Escape}')
  expect(within(panel).queryByRole('dialog', { name: '图片生成参数' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

test('opens the grouped Liblib image template catalog and guards AI templates behind placeholders', async () => {
  const user = userEvent.setup()
  const data = makeData({ onOpenAnalysisTool: vi.fn() })
  render(<ImageGenerationPanel {...panelProps(data)} />)
  const panel = screen.getByRole('region', { name: 'L1 生成参数' })
  const trigger = within(panel).getByRole('button', { name: '图片创作模板' })

  await user.click(trigger)
  const dialog = screen.getByRole('dialog', { name: '图片创作模板' })
  expect(within(dialog).getByRole('group', { name: '分镜叙事' })).toBeVisible()
  expect(within(dialog).getByRole('group', { name: '质感调节' })).toBeVisible()
  expect(within(dialog).getByRole('group', { name: '空间与机位' })).toBeVisible()
  expect(within(dialog).getByRole('group', { name: '设定图' })).toBeVisible()
  expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual([
    '调度故事板',
    '故事板',
    '25宫格连贯分镜',
    '剧情推演四宫格',
    '画面推演 - 3秒后',
    '画面推演 - 5秒前',
    '人像质感调节',
    '电影级光影校正',
    '720全景',
    '多机位九宫格',
    '角色脸部三视图待接入',
    '角色设定图待接入',
    '角色三视图待接入',
    '场景设定图待接入',
    '产品设定图待接入',
  ])

  await user.keyboard('{Escape}')
  expect(within(panel).queryByRole('dialog', { name: '图片创作模板' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()

  await user.click(trigger)
  const panoramaCatalog = screen.getByRole('dialog', {
    name: '图片创作模板',
  })
  await user.click(
    within(panoramaCatalog).getByRole('button', { name: '720全景' }),
  )
  expect(data.onOpenAnalysisTool).toHaveBeenCalledWith('panorama-720-api', expect.any(String))
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(data.onCreateImageToolNode).not.toHaveBeenCalled()

  await user.click(trigger)
  const storyboardCatalog = screen.getByRole('dialog', {
    name: '图片创作模板',
  })
  await user.click(
    within(storyboardCatalog).getByRole('button', { name: '调度故事板' }),
  )
  await user.click(
    screen.getByRole('button', { name: '确认添加调度故事板工具节点' }),
  )
  expect(data.onCreateImageToolNode).toHaveBeenCalledWith('调度故事板')
})

test('keeps every image AI preset in the preset panel without changing the selected model', async () => {
  const user = userEvent.setup()
  const data = makeData({ providerRegistry: createDefaultProviderRegistry() })
  render(<ImageGenerationPanel {...panelProps(data)} />)
  const model = screen.getByRole('combobox', { name: '图片模型' })
  const trigger = screen.getByRole('button', { name: '图片创作模板' })
  expect(within(model).getAllByRole('option')).toHaveLength(1)
  expect(model).not.toHaveTextContent(/720全景|九宫格|四宫格|25宫格|光影|设定图/)
  expect(trigger).toHaveAttribute('title', expect.stringContaining('预设'))

  for (const [label, reason] of [
    ['720全景', '720全景开发验证配置未完成'],
    ['多机位九宫格', '多机位九宫格开发验证配置未完成'],
    ['剧情推演四宫格', '剧情推演四宫格开发验证配置未完成'],
    ['25宫格连贯分镜', '25宫格连贯分镜开发验证配置未完成'],
    ['电影级光影校正', '电影级光影矫正开发验证配置未完成'],
    ['角色设定图', '待接入设定图生成服务'],
  ]) {
    await user.click(trigger)
    const presets = screen.getByRole('dialog', { name: '图片创作模板' })
    await user.click(within(presets).getByRole('button', { name: label }))
    const notice = screen.getByRole('alertdialog')
    expect(notice).toHaveTextContent(reason)
    if (label === '720全景') {
      await user.click(within(notice).getByRole('button', { name: '复制提示词到图片节点' }))
      expect(screen.getByRole('textbox', { name: '提示词' })).toHaveTextContent('无缝等距柱状720全景')
      expect(within(notice).getByRole('status')).toHaveTextContent('选择已配置的图片模型生成')
    }
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(model).toHaveValue('seedream-5-pro-api')
  }
  expect(data.onSelectModelProvider).not.toHaveBeenCalled()
  expect(data.onLocalImageGenerate).not.toHaveBeenCalled()
  expect(data.onCreateImageToolNode).not.toHaveBeenCalled()
})

test('blocks an already requested legacy upscale confirmation without creating fake output', async () => {
  const user = userEvent.setup()
  const onCreateImageToolNode = vi.fn()
  const upscaleTriggerRef = createRef<HTMLButtonElement>()
  const onUpscalePendingChange = vi.fn()
  render(
    <ImageGenerationPanel
      data={makeData({ onCreateImageToolNode })}
      imageToImage={false}
      onImageToImageChange={vi.fn()}
      upscalePending
      onUpscalePendingChange={onUpscalePendingChange}
      upscaleTriggerRef={upscaleTriggerRef}
    />,
  )

  expect(screen.queryByRole('button', { name: '图片高清' })).not.toBeInTheDocument()
  const dialog = screen.getByRole('alertdialog', { name: '将添加工具节点' })
  expect(dialog).toHaveTextContent('未提供独立 2x/4x 图片超分接口')
  expect(onCreateImageToolNode).not.toHaveBeenCalled()
  await user.click(within(dialog).getByRole('button', { name: '确认添加图片高清工具节点' }))
  expect(within(dialog).getByRole('button', { name: '确认添加图片高清工具节点' })).toBeDisabled()
  expect(onCreateImageToolNode).not.toHaveBeenCalled()
  expect(onUpscalePendingChange).not.toHaveBeenCalled()
})

test('migrates retired image model selection to the real provider without losing the node', () => {
  const data = makeData({
    node: {
      ...makeData().node,
      modelProviderId: 'mock-style-image-v7',
      generationConfig: {
        targetKind: 'image',
        providerId: 'mock-style-image-v7',
        parameters: {},
        referenceAssets: [],
      },
    },
  })
  render(<ImageGenerationPanel {...panelProps(data)} />)

  const actions = screen.getByRole('toolbar', { name: '图片主操作' })
  expect(within(actions).getAllByRole('button').map((button) => button.textContent)).toEqual([
    '参考',
    '标记',
    '风格',
  ])
  expect(screen.getByRole('combobox', { name: '图片模型' })).toHaveValue('seedream-5-pro-api')
})

test('opens and safely exits the local element marking mode', async () => {
  const user = userEvent.setup()
  render(<ImageGenerationPanel {...panelProps(makeData())} />)

  const trigger = screen.getByRole('button', { name: '标记' })
  await user.click(trigger)
  expect(trigger).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('region', { name: '标记元素' })).toHaveTextContent(
    '点击图片选择局部元素',
  )

  await user.keyboard('{Escape}')
  expect(screen.queryByRole('region', { name: '标记元素' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

test('exposes the verified MJ image settings with persistent accessible controls', async () => {
  const user = userEvent.setup()
  const data = makeData()
  render(<ImageGenerationPanel {...panelProps(data)} />)
  const panel = screen.getByRole('region', { name: 'L1 生成参数' })

  const model = within(panel).getByRole('combobox', { name: '图片模型' })
  expect(model).toHaveValue('seedream-5-pro-api')
  expect(within(model).getByRole('option', { name: /Seedream 5\.0 Pro/ })).toBeEnabled()
  expect(within(model).getAllByRole('option')).toHaveLength(1)
  expect(within(model).queryByRole('option', { name: /Mock Studio|可灵图片|Lib Image|Qwen/ })).not.toBeInTheDocument()
  expect(within(panel).getByText('开发直连', { exact: true })).toBeVisible()
  await user.selectOptions(model, 'seedream-5-pro-api')
  expect(data.onSelectModelProvider).toHaveBeenCalledWith('seedream-5-pro-api')

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
  expect(within(panel).getByText('预计成本 18')).toBeVisible()

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

test('shows only the disabled real image provider when configuration is missing', () => {
  const data = makeData({ providerRegistry: createDefaultProviderRegistry() })
  render(<ImageGenerationPanel {...panelProps(data)} imageToImage />)
  const model = screen.getByRole('combobox', { name: '图片模型' })
  expect(Array.from(model.querySelectorAll('optgroup'), ({ label }) => label)).toEqual(['官方 API 已接（开发直连）'])
  expect(within(model).getAllByRole('option')).toHaveLength(1)
  expect(within(model).getByRole('option', { name: /Seedream.*配置未完成/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: '生成图片，预计成本 18' })).toBeDisabled()
  expect(model).not.toHaveTextContent('本地演示')
})

test('exposes an enabled Seedream 5.0 Pro live provider with real dimensions and truthful submit state', () => {
  const providerRegistry = createDefaultProviderRegistry({
    seedream: {
      mode: 'seedream-direct-dev',
      apiKey: 'fixture-api-key',
    },
  })
  const data = makeData({
    providerRegistry,
    node: {
      ...makeData().node,
      modelProviderId: 'seedream-5-pro-api',
      generationConfig: {
        targetKind: 'image',
        providerId: 'seedream-5-pro-api',
        parameters: {
          aspectRatio: '16:9',
          resolution: '2K',
          count: 1,
        },
        referenceAssets: [],
      },
    },
  })

  render(<ImageGenerationPanel {...panelProps(data)} />)
  const panel = screen.getByRole('region', { name: 'L1 生成参数' })
  const model = within(panel).getByRole('combobox', { name: '图片模型' })
  const liveOption = within(model).getByRole('option', {
    name: /Seedream 5\.0 Pro.*开发直连/,
  })

  expect(model).toHaveValue('seedream-5-pro-api')
  expect(liveOption).toBeEnabled()
  expect(within(panel).getByText('开发直连', { exact: true })).toBeVisible()
  expect(within(panel).getByText('2816×1584 · 2K · 1张')).toBeVisible()
  expect(
    within(panel).getByRole('button', { name: '生成图片，预计成本 18' }),
  ).toHaveAttribute('title', '调用真实 Seedream API；结果将保存到项目与生成历史')
})

test('confirms the multiplied live Seedream cost before submitting four serial images', async () => {
  const user = userEvent.setup()
  const providerRegistry = createDefaultProviderRegistry({
    seedream: {
      mode: 'seedream-direct-dev',
      apiKey: 'fixture-api-key',
    },
  })
  const data = makeData({
    providerRegistry,
    node: {
      ...makeData().node,
      modelProviderId: 'seedream-5-pro-api',
      generationConfig: {
        targetKind: 'image',
        providerId: 'seedream-5-pro-api',
        parameters: {
          aspectRatio: '5:4',
          resolution: '2K',
          count: 1,
        },
        referenceAssets: [],
      },
    },
  })

  render(<ImageGenerationPanel {...panelProps(data)} />)
  const panel = screen.getByRole('region', { name: 'L1 生成参数' })
  await user.click(within(panel).getByRole('button', { name: '图片生成参数' }))
  const parameterDialog = within(panel).getByRole('dialog', { name: '图片生成参数' })
  const ratio = within(parameterDialog).getByRole('group', { name: '比例' })
  const count = within(parameterDialog).getByRole('group', { name: '生成数量' })

  expect(within(ratio).getAllByRole('button')).toHaveLength(15)
  expect(within(count).getAllByRole('button')).toHaveLength(3)
  await user.click(within(count).getByRole('button', { name: '4张' }))
  expect(within(panel).getByText('预计成本 72')).toBeVisible()
  expect(within(panel).getByRole('button', { name: '图片生成参数' })).toHaveTextContent(
    '2280×1824 · 2K · 4张',
  )

  await user.click(within(panel).getByRole('button', { name: '生成图片，预计成本 72' }))
  expect(data.onLocalImageGenerate).not.toHaveBeenCalled()
  const confirmation = screen.getByRole('alertdialog', { name: '确认真实图片生成' })
  expect(within(confirmation).getByText('4 张 × 18 积分')).toBeVisible()
  expect(within(confirmation).getByText('总成本 72 积分')).toBeVisible()
  await user.click(within(confirmation).getByRole('button', { name: '确认生成 4 张图片' }))
  expect(data.onLocalImageGenerate).toHaveBeenCalledWith('雾中茶山')
})

test('supports adaptive and validated custom Seedream output sizes', async () => {
  const user = userEvent.setup()
  const providerRegistry = createDefaultProviderRegistry({
    seedream: {
      mode: 'seedream-direct-dev',
      apiKey: 'fixture-api-key',
    },
  })
  const data = makeData({
    providerRegistry,
    node: {
      ...makeData().node,
      modelProviderId: 'seedream-5-pro-api',
      generationConfig: {
        targetKind: 'image',
        providerId: 'seedream-5-pro-api',
        parameters: {
          aspectRatio: '16:9',
          resolution: '2K',
          count: 1,
        },
        referenceAssets: [],
      },
    },
  })

  render(<ImageGenerationPanel {...panelProps(data)} />)
  const panel = screen.getByRole('region', { name: 'L1 生成参数' })
  await user.click(within(panel).getByRole('button', { name: '图片生成参数' }))
  const dialog = within(panel).getByRole('dialog', { name: '图片生成参数' })
  const ratio = within(dialog).getByRole('group', { name: '比例' })

  expect(within(ratio).getByRole('button', { name: '自适应' })).toBeVisible()
  expect(
    within(within(dialog).getByRole('group', { name: '清晰度' }))
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['1K', '1.5K', '2K'])
  for (const option of ['1:2', '2:1', '4:3', '3:4', '5:4', '4:5', '21:9', '9:21']) {
    expect(within(ratio).getByRole('button', { name: option })).toBeVisible()
  }
  await user.click(within(ratio).getByRole('button', { name: '自定义' }))
  const width = within(dialog).getByRole('spinbutton', { name: '自定义宽度' })
  const height = within(dialog).getByRole('spinbutton', { name: '自定义高度' })
  expect(width).toHaveValue(2048)
  expect(height).toHaveValue(2048)

  await user.clear(width)
  await user.type(width, '512')
  await user.clear(height)
  await user.type(height, '512')
  expect(
    within(dialog).getByText('自定义尺寸总像素需在 921,600–4,624,220 之间。'),
  ).toBeVisible()
  expect(within(panel).getByRole('button', { name: '生成图片，预计成本 18' })).toBeDisabled()

  await user.clear(width)
  await user.type(width, '1600')
  await user.clear(height)
  await user.type(height, '2000')
  expect(within(dialog).getByText('当前比例 4:5 · 1600 × 2000')).toBeVisible()
  expect(within(panel).getByRole('button', { name: '生成图片，预计成本 18' })).toBeEnabled()
  expect(within(panel).getByRole('button', { name: '图片生成参数' })).toHaveTextContent(
    '1600×2000 · 2K · 1张',
  )
  expect(data.onUpdateImageGenerationSettings).toHaveBeenCalledWith({
    aspectRatio: '自定义',
  })
  expect(data.onUpdateImageGenerationSettings).toHaveBeenCalledWith({
    customWidth: 1600,
  })
  expect(data.onUpdateImageGenerationSettings).toHaveBeenCalledWith({
    customHeight: 2000,
  })
})

test('opens a searchable three-tab style gallery with ten categories and complete cards', async () => {
  const user = userEvent.setup()
  render(<ImageGenerationPanel {...panelProps(makeData())} />)
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
  render(<ImageGenerationPanel {...panelProps(data)} />)
  const panel = screen.getByRole('region', { name: 'L1 生成参数' })
  const submit = within(panel).getByRole('button', {
    name: '生成图片，预计成本 18',
  })

  expect(submit).toBeDisabled()
  expect(within(panel).getByText('请输入提示词或添加参考媒体后再生成。')).toBeVisible()
  expect(within(panel).getByRole('button', { name: '翻译提示词' })).toBeDisabled()
  expect(within(panel).getByText('翻译服务未接入，本地演示暂不可用。')).toBeVisible()

  const prompt = within(panel).getByLabelText('提示词')
  await user.type(prompt, '雨夜角色特写')
  expect(prompt).toHaveTextContent('雨夜角色特写')
  fireEvent.blur(prompt)
  expect(data.onUpdateImageGenerationSettings).toHaveBeenCalledWith({
    prompt: '雨夜角色特写',
  })
  expect(submit).toBeEnabled()
  await user.click(submit)
  expect(data.onLocalImageGenerate).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '确认生成 1 张图片' }))
  expect(data.onLocalImageGenerate).toHaveBeenCalledWith('雨夜角色特写')
})

test('flushes the current prompt before generating without requiring blur', async () => {
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
  const updateSettings = vi.mocked(data.onUpdateImageGenerationSettings!)
  const generateImage = vi.mocked(data.onLocalImageGenerate!)

  render(<ImageGenerationPanel {...panelProps(data)} />)
  const panel = screen.getByRole('region', { name: 'L1 生成参数' })
  const prompt = within(panel).getByLabelText('提示词')
  await user.type(prompt, '白色陶瓷杯产品摄影')
  await user.click(within(panel).getByRole('button', {
    name: '生成图片，预计成本 18',
  }))

  await user.click(screen.getByRole('button', { name: '确认生成 1 张图片' }))
  expect(updateSettings).toHaveBeenCalledWith({
    prompt: '白色陶瓷杯产品摄影',
  })
  expect(updateSettings.mock.invocationCallOrder[0]).toBeLessThan(
    generateImage.mock.invocationCallOrder[0],
  )
  expect(generateImage).toHaveBeenCalledWith('白色陶瓷杯产品摄影')
})

test('exposes canvas reference mode controls without creating an edge locally', async () => {
  const user = userEvent.setup()
  const data = makeData()
  const props = panelProps(data)
  const view = render(<ImageGenerationPanel {...props} />)

  const referenceTrigger = screen.getByRole('button', { name: '参考' })
  await user.click(referenceTrigger)
  expect(data.onStartImageReferenceSelection).toHaveBeenCalledWith(
    referenceTrigger,
  )

  view.rerender(
    <ImageGenerationPanel {...props} data={{ ...data, imageReferenceSelecting: true }} />,
  )
  const mode = screen.getByRole('region', { name: '从画布选择参考' })
  expect(mode).toHaveTextContent('从画布选择参考')
  expect(mode).toHaveTextContent('点画布其他节点建立引用连线')
  await user.click(within(mode).getByRole('button', { name: '返回节点' }))
  expect(data.onEndImageReferenceSelection).toHaveBeenCalledWith(true)
})
