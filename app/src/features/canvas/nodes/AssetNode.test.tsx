import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { CreativeFlowNode, CreativeNodeData } from '../node-types'
import { AssetNode } from './AssetNode'
import { createDefaultProviderRegistry } from '../../generation/model-provider-registry'
import { createFixtureProviderRegistry } from '../../../test/provider-fixtures'

function renderNode(onHandleActivate = vi.fn(), onRenameNode = vi.fn()) {
  const data: CreativeNodeData = {
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
    onHandleActivate,
    onRenameNode,
    onFocusComplete: vi.fn(),
    onDelete: vi.fn(),
  }
  const node: CreativeFlowNode = {
    id: data.node.id,
    type: data.node.kind,
    position: data.node.position,
    initialWidth: 320,
    initialHeight: 220,
    data,
  }

  const view = render(
    <div style={{ width: 600, height: 400 }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={[node]}
          edges={[]}
          nodeTypes={{ character: AssetNode }}
        />
      </ReactFlowProvider>
    </div>,
  )

  return { ...view, onHandleActivate, onRenameNode }
}

test('uses real React Flow handles with button semantics and keyboard actions', async () => {
  const user = userEvent.setup()
  const { onHandleActivate } = renderNode()
  const target = screen.getByRole('button', { name: '连接到角色参考' })
  const source = screen.getByRole('button', {
    name: '从角色参考建立连接',
  })

  expect(target.tagName).toBe('DIV')
  expect(source.tagName).toBe('DIV')
  expect(target).toHaveAttribute('tabindex', '0')
  expect(source).toHaveAttribute('tabindex', '0')

  source.focus()
  await user.keyboard('{Enter}')
  expect(onHandleActivate).toHaveBeenLastCalledWith('source', source)

  target.focus()
  await user.keyboard(' ')
  expect(onHandleActivate).toHaveBeenLastCalledWith('target', target)
})

test('exposes connection mode and selected-source state on the real node shell', () => {
  const { container } = renderNode()

  expect(container.querySelector('.creative-node')).toHaveClass(
    'creative-node--connection-mode',
    'creative-node--connection-source',
  )
})

test('edits a Liblib media node title from its floating heading', async () => {
  const user = userEvent.setup()
  const onRenameNode = vi.fn()
  renderNode(vi.fn(), onRenameNode)

  const title = screen.getByRole('textbox', { name: '节点名称' })
  expect(title).toHaveValue('角色参考')
  await user.clear(title)
  await user.type(title, '雨夜角色{Enter}')

  expect(onRenameNode).toHaveBeenCalledOnce()
  expect(onRenameNode).toHaveBeenCalledWith('雨夜角色')
})

test('keeps image nodes folded until they become the current selection', async () => {
  const user = userEvent.setup()
  const onSetActiveResult = vi.fn()
  const baseData = {
    node: {
      id: 'image-node',
      kind: 'image' as const,
      title: 'L1',
      position: { x: 0, y: 0 },
      versions: [{ id: 'v1', createdAt: '2026-08-14T00:00:00.000Z', prompt: '雾中茶山', assetId: 'asset-1' }],
      activeVersionId: 'v1',
      activeResultId: 'result-1',
      imageResults: [
        { id: 'result-1', assetId: 'asset-1' },
        { id: 'result-2', assetId: 'asset-2' },
        { id: 'result-3', assetId: 'asset-3' },
        { id: 'result-4', assetId: 'asset-4' },
      ],
      sourceChanged: false,
    },
    asset: { id: 'asset-1', kind: 'image' as const, url: '/one.png', mimeType: 'image/png', width: 1456, height: 816 },
    imageResults: [1, 2, 3, 4].map((number) => ({
      id: `result-${number}`,
      asset: { id: `asset-${number}`, kind: 'image' as const, url: `/${number}.png`, mimeType: 'image/png', width: 1456, height: 816 },
    })),
    selected: false,
    contextual: false,
    actionsPlacement: 'after' as const,
    connectionMode: false,
    connectionSource: false,
    focusOnMount: false,
    focusRequestVersion: 0,
    onAction: vi.fn(),
    onSelect: vi.fn(),
    onHandleActivate: vi.fn(),
    onFocusComplete: vi.fn(),
    onDelete: vi.fn(),
    onSetActiveResult,
  }

  const renderWith = (data: typeof baseData) => (
    <div style={{ width: 900, height: 700 }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={[{ id: 'image-node', type: 'image', position: { x: 0, y: 0 }, initialWidth: 360, initialHeight: 620, data }]}
          edges={[]}
          nodeTypes={{ image: AssetNode }}
        />
      </ReactFlowProvider>
    </div>
  )
  const view = render(renderWith(baseData))

  expect(screen.getByText('1456 × 816')).toBeVisible()
  expect(screen.getByRole('button', { name: '查看 4 张结果' })).toBeVisible()
  expect(screen.queryByRole('region', { name: 'L1 生成参数' })).not.toBeInTheDocument()

  view.rerender(renderWith({ ...baseData, selected: true, contextual: true }))
  const generation = screen.getByRole('region', { name: 'L1 生成参数' })
  const mediaCard = screen.getByRole('article')
  const floatingTitle = screen
    .getByRole('textbox', { name: '节点名称' })
    .closest('.creative-node__floating-title')
  expect(mediaCard).toHaveClass('creative-node--liblib-media')
  expect(floatingTitle).toBeVisible()
  expect(mediaCard).not.toContainElement(floatingTitle as HTMLElement)
  expect(floatingTitle?.nextElementSibling).toBe(mediaCard)
  expect(mediaCard).not.toContainElement(generation)
  expect(generation.parentElement).toHaveClass('creative-node-composer')
  expect(
    within(generation)
      .getAllByRole('toolbar', { name: '图片主操作' })[0]
      ?.querySelectorAll('button'),
  ).toHaveLength(3)
  expect(
    within(within(generation).getByRole('toolbar', { name: '图片主操作' }))
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['参考', '标记', '风格'])
  expect(screen.queryByRole('toolbar', { name: '图片快捷尝试' })).not.toBeInTheDocument()
  const prompt = within(generation).getByRole('textbox', { name: '提示词' })
  expect(prompt).toHaveAttribute('contenteditable', 'true')
  expect(prompt).toHaveAttribute(
    'aria-placeholder',
    '可直接文字生图，或上传图片输入文字指令对图片进行编辑，如：将背景改为雪夜',
  )
  expect(prompt).toHaveTextContent('雾中茶山')
  const imageModel = within(generation).getByRole('combobox', { name: '图片模型' })
  expect(imageModel).toHaveValue('seedream-5-pro-api')
  expect(within(imageModel).queryByRole('option', { name: /可灵图片/ })).not.toBeInTheDocument()
  expect(within(generation).getByText('预计成本 18')).toBeVisible()
  expect(screen.getByRole('button', { name: '查看 4 张结果' })).toHaveTextContent('4张')

  await user.click(screen.getByRole('button', { name: '查看 4 张结果' }))
  const results = screen.getByRole('region', { name: 'L1 的 4 张结果' })
  expect(within(results).getAllByRole('img')).toHaveLength(4)
  await user.click(within(results).getByRole('button', { name: '将结果 2 设为主图' }))
  expect(screen.getByRole('alertdialog', { name: '设为主图' })).toHaveTextContent(
    '下游引用将使用新的主图',
  )
  await user.click(screen.getByRole('button', { name: '确认设为主图' }))
  expect(onSetActiveResult).toHaveBeenCalledWith('result-2')
})

test('matches the empty Liblib image card attempts and three composer actions', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  const onStartImageReferenceSelection = vi.fn()
  const onImportImageReference = vi.fn()
  const onCreateImageToolNode = vi.fn()
  const data = {
    node: {
      id: 'empty-image',
      kind: 'image' as const,
      title: '图片节点 1',
      position: { x: 0, y: 0 },
      versions: [{ id: 'v1', createdAt: '2026-08-20T00:00:00.000Z', prompt: '' }],
      activeVersionId: 'v1',
      sourceChanged: false,
    },
    selected: true,
    contextual: true,
    actionsPlacement: 'after' as const,
    connectionMode: false,
    connectionSource: false,
    focusOnMount: false,
    focusRequestVersion: 0,
    onAction: vi.fn(),
    onSelect,
    onHandleActivate: vi.fn(),
    onFocusComplete: vi.fn(),
    onDelete: vi.fn(),
    onStartImageReferenceSelection,
    onImportImageReference,
    onCreateImageToolNode,
  }

  render(
    <div style={{ width: 1000, height: 800 }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={[{
            id: 'empty-image',
            type: 'image',
            position: { x: 0, y: 0 },
            initialWidth: 320,
            initialHeight: 240,
            data,
          }]}
          edges={[]}
          nodeTypes={{ image: AssetNode }}
        />
      </ReactFlowProvider>
    </div>,
  )

  const card = screen.getByRole('article')
  expect(within(card).getByText('尚未添加图片')).toHaveClass('visually-hidden')
  const attempts = within(card).getByRole('toolbar', { name: '图片快捷尝试' })
  expect(within(attempts).getByText('尝试：')).toBeVisible()
  expect(
    within(attempts)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['图生图', '图片高清'])
  expect(
    within(screen.getByRole('toolbar', { name: '图片主操作' }))
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['参考', '标记', '风格'])

  const imageToImage = within(attempts).getByRole('button', { name: '图生图' })
  await user.click(imageToImage)
  expect(onSelect).toHaveBeenCalledOnce()
  expect(onStartImageReferenceSelection).not.toHaveBeenCalled()
  expect(screen.getByRole('status')).toHaveTextContent(
    '已切换图生图模式，请上传参考图片或使用“参考”从画布选择',
  )
  const referenceFile = new File(['image'], 'reference.png', {
    type: 'image/png',
  })
  fireEvent.change(screen.getByLabelText('为图片节点 1上传图生图参考'), {
    target: { files: [referenceFile] },
  })
  expect(onImportImageReference).toHaveBeenCalledWith(referenceFile)

  await user.click(within(attempts).getByRole('button', { name: '图片高清' }))
  expect(within(attempts).getByRole('button', { name: '图片高清' })).toBeDisabled()
  expect(screen.queryByRole('alertdialog', { name: '将添加工具节点' })).not.toBeInTheDocument()
  expect(onCreateImageToolNode).not.toHaveBeenCalled()
})

type TestNodeDetails = Record<string, unknown> & { type: string }

function renderSpecializedNode(
  title: string,
  kind: 'text' | 'script' | 'storyboard' | 'video',
  details: TestNodeDetails,
  contextual = true,
  options: Partial<CreativeNodeData> = {},
) {
  const onUpdateNodeDetails = vi.fn()
  const onCreateTextToVideoPreset = vi.fn()
  const node = {
    id: `${details.type}-node`,
    kind,
    title,
    position: { x: 0, y: 0 },
    versions: [{
      id: `${details.type}-version`,
      createdAt: '2026-08-15T00:00:00.000Z',
      prompt: '本地演示内容',
    }],
    activeVersionId: `${details.type}-version`,
    sourceChanged: false,
    details,
  } as unknown as CreativeNodeData['node']
  const data = {
    node,
    selected: contextual,
    actionsPlacement: 'after',
    contextual,
    connectionMode: false,
    connectionSource: false,
    focusOnMount: false,
    focusRequestVersion: 0,
    onAction: vi.fn(),
    onSelect: vi.fn(),
    onHandleActivate: vi.fn(),
    onFocusComplete: vi.fn(),
    onDelete: vi.fn(),
    onUpdateNodeDetails,
    onCreateTextToVideoPreset,
    ...options,
  } as unknown as CreativeNodeData
  const flowNode: CreativeFlowNode = {
    id: node.id,
    type: kind,
    position: node.position,
    initialWidth: 420,
    initialHeight: 720,
    data,
  }

  const view = render(
    <div style={{ width: 1000, height: 900 }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={[flowNode]}
          edges={[]}
          nodeTypes={{
            text: AssetNode,
            script: AssetNode,
            storyboard: AssetNode,
            video: AssetNode,
          }}
        />
      </ReactFlowProvider>
    </div>,
  )

  return {
    ...view,
    data,
    flowNode,
    onUpdateNodeDetails,
    onCreateTextToVideoPreset,
  }
}

test('keeps specialized nodes folded until selected and edits text details', async () => {
  const user = userEvent.setup()
  const details = {
    type: 'text',
    content: '雨巷旁白',
    fontStyle: '正文',
  }
  const folded = renderSpecializedNode('文本 01', 'text', details, false)

  expect(screen.getByRole('textbox', { name: '节点名称' })).toHaveValue('文本 01')
  expect(screen.getByRole('toolbar', { name: '文本快捷尝试' })).toBeVisible()
  expect(
    within(screen.getByRole('toolbar', { name: '文本快捷尝试' }))
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['自己编写内容', '文生视频', '图片反推提示词', '文字生音乐'])
  expect(screen.queryByRole('region', { name: '文本 01 文本参数' })).not.toBeInTheDocument()
  expect(screen.queryByText('本地演示内容')).not.toBeInTheDocument()
  expect(screen.queryByText('就绪')).not.toBeInTheDocument()
  await user.click(
    within(screen.getByRole('toolbar', { name: '文本快捷尝试' })).getByRole('button', {
      name: '自己编写内容',
    }),
  )
  expect(folded.onUpdateNodeDetails).toHaveBeenLastCalledWith(
    expect.objectContaining({ editorMode: 'manual', content: '雨巷旁白' }),
  )
  folded.unmount()

  const { container, onUpdateNodeDetails } = renderSpecializedNode('文本 01', 'text', details)
  const panel = screen.getByRole('region', { name: '文本 01 文本参数' })
  expect(container.querySelector('.creative-node-composer--text')).toContainElement(panel)
  expect(container.querySelector('.creative-node--liblib-text')).toBeVisible()
  expect(within(panel).getByRole('textbox', { name: '文本生成提示词' })).toHaveAttribute(
    'placeholder',
    '写下你想讲的故事、场景或角色设定。例如：一个来自未来的机器人，在城市屋顶看星星。',
  )
  const editor = within(panel).getByRole('textbox', { name: '文本内容' })
  expect(editor).toHaveValue('雨巷旁白')
  expect(within(panel).getByText('4 / 5000')).toBeVisible()
  await user.selectOptions(within(panel).getByRole('combobox', { name: '字体样式' }), '引用')
  expect(onUpdateNodeDetails).toHaveBeenLastCalledWith({ ...details, fontStyle: '引用' })
})

test('starts the connected text-to-video preset from the text quick action', async () => {
  const user = userEvent.setup()
  const details = {
    type: 'text',
    content: '高原广告镜头，雪山下的金色麦浪',
    fontStyle: '正文',
    prompt: '',
  }
  const { onCreateTextToVideoPreset, onUpdateNodeDetails } = renderSpecializedNode(
    '文本节点 08',
    'text',
    details,
    false,
  )

  await user.click(
    within(screen.getByRole('toolbar', { name: '文本快捷尝试' })).getByRole('button', {
      name: '文生视频',
    }),
  )

  expect(onCreateTextToVideoPreset).toHaveBeenCalledOnce()
  expect(onUpdateNodeDetails).not.toHaveBeenCalled()
})

test('edits manual text inside the compact node with a Liblib formatting toolbar', async () => {
  const user = userEvent.setup()
  const details = {
    type: 'text',
    content: '城市屋顶的星光',
    fontStyle: '正文',
    editorMode: 'manual',
    editorBlockStyle: 'paragraph',
    editorBold: false,
    editorItalic: false,
    editorListStyle: 'none',
  }
  const { container, onUpdateNodeDetails } = renderSpecializedNode(
    '文本 05',
    'text',
    details,
  )

  expect(screen.queryByRole('region', { name: '文本 05 文本参数' })).not.toBeInTheDocument()
  expect(container.querySelector('.creative-node--manual-text')).toBeVisible()
  const toolbar = screen.getByRole('toolbar', { name: '文本格式工具' })
  for (const name of [
    '清除文本格式',
    '一级标题',
    '二级标题',
    '三级标题',
    '正文',
    '加粗',
    '斜体',
    '无序列表',
    '有序列表',
    '插入分隔线',
    '复制文本',
    '展开文本节点',
  ]) {
    expect(within(toolbar).getByRole('button', { name })).toBeVisible()
  }

  const editor = screen.getByRole('textbox', { name: '自己编写内容' })
  expect(editor).toHaveValue('城市屋顶的星光')
  await user.clear(editor)
  await user.type(editor, '雨夜重逢')
  expect(onUpdateNodeDetails).toHaveBeenLastCalledWith(
    expect.objectContaining({ editorMode: 'manual', content: '雨夜重逢' }),
  )

  await user.click(within(toolbar).getByRole('button', { name: '一级标题' }))
  expect(onUpdateNodeDetails).toHaveBeenLastCalledWith(
    expect.objectContaining({ editorBlockStyle: 'h1' }),
  )
  await user.click(within(toolbar).getByRole('button', { name: '加粗' }))
  expect(onUpdateNodeDetails).toHaveBeenLastCalledWith(
    expect.objectContaining({ editorBold: true }),
  )
  await user.click(within(toolbar).getByRole('button', { name: '复制文本' }))
  expect(screen.getByRole('status')).toHaveTextContent('已复制文本')
  await user.click(within(toolbar).getByRole('button', { name: '展开文本节点' }))
  expect(container.querySelector('.creative-node--manual-text-expanded')).toBeVisible()
  expect(within(toolbar).getByRole('button', { name: '收起文本节点' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('removes text demo tiers and explains the unavailable real model without fabricating text', async () => {
  const user = userEvent.setup()
  const onGenerateText = vi.fn()
  renderSpecializedNode('文本 01', 'text', { type: 'text', content: '', fontStyle: '正文', modelProviderId: 'mock-text-llm', prompt: '' }, true, { onGenerateText })
  const panel = screen.getByRole('region', { name: '文本 01 文本参数' })
  const model = within(panel).getByRole('combobox', { name: '文本模型' })
  expect(within(model).getAllByRole('option')).toHaveLength(1)
  expect(within(model).getByRole('option', { name: /豆包.*未启用/ })).toBeDisabled()
  expect(model).toHaveValue('ark-text-llm')
  await user.type(within(panel).getByRole('textbox', { name: '文本生成提示词' }), '雨夜重逢宣传文案')
  const generate = within(panel).getByRole('button', { name: '生成文本，预计成本 1' })
  expect(generate).toBeDisabled()
  await user.click(generate)
  expect(onGenerateText).not.toHaveBeenCalled()
})

test('groups the configured Ark text model as an official API and dispatches real text generation', async () => {
  const user = userEvent.setup()
  const onGenerateText = vi.fn()
  const registry = createDefaultProviderRegistry({
    arkText: {
      mode: 'ark-text-dev',
      apiKey: 'fixture-key',
      fetchFn: vi.fn<typeof fetch>(),
    },
  })
  const details = {
    type: 'text',
    content: '',
    fontStyle: '正文',
    modelProviderId: 'ark-text-llm',
    modelVariant: 'basic-copy',
    prompt: '',
  }
  const { onUpdateNodeDetails } = renderSpecializedNode(
    '文本 01',
    'text',
    details,
    true,
    { providerRegistry: registry, onGenerateText } as Partial<CreativeNodeData>,
  )
  const panel = screen.getByRole('region', { name: '文本 01 文本参数' })
  const model = within(panel).getByRole('combobox', { name: '文本模型' })

  expect(within(model).getByRole('group', { name: '官方 API 已接（开发直连）' }))
    .toBeVisible()
  expect(within(model).getByRole('option', { name: '豆包 Seed 2.1 Pro · 1 积分' }))
    .toBeEnabled()

  await user.selectOptions(model, 'ark-text-llm')
  expect(onUpdateNodeDetails).toHaveBeenLastCalledWith(expect.objectContaining({
    modelProviderId: 'ark-text-llm',
    modelVariant: undefined,
  }))
  await user.type(
    within(panel).getByRole('textbox', { name: '文本生成提示词' }),
    '清晨薄雾中的古桥',
  )
  await user.click(
    within(panel).getByRole('button', { name: '生成文本，预计成本 1' }),
  )

  expect(onGenerateText).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'text',
      modelProviderId: 'ark-text-llm',
      prompt: '清晨薄雾中的古桥',
    }),
    '清晨薄雾中的古桥',
  )
  expect(within(panel).getByRole('status')).toHaveTextContent('文本生成任务已提交')
})

test('dispatches a configured Ark script generation with outline and scene count', async () => {
  const user = userEvent.setup()
  const onGenerateText = vi.fn()
  const registry = createDefaultProviderRegistry({
    arkText: {
      mode: 'seedream-direct-dev',
      apiKey: 'fixture-key',
      fetchFn: vi.fn<typeof fetch>(),
    },
  })
  const details = {
    type: 'script',
    chapters: [],
    modelProviderId: 'ark-text-llm',
    outline: '',
    sceneCount: 2,
  }
  renderSpecializedNode('脚本 01', 'script', details, true, {
    providerRegistry: registry,
    onGenerateText,
  } as Partial<CreativeNodeData>)
  const panel = screen.getByRole('region', { name: '脚本 01 脚本参数' })

  expect(within(panel).getByRole('combobox', { name: '脚本模型' }))
    .toHaveValue('ark-text-llm')
  await user.type(within(panel).getByRole('textbox', { name: '剧情大纲' }), '河灯引出旧案')
  await user.click(within(panel).getByRole('button', { name: '生成脚本，预计成本 1' }))

  expect(onGenerateText).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'script',
      modelProviderId: 'ark-text-llm',
      outline: '河灯引出旧案',
      sceneCount: 2,
    }),
    '河灯引出旧案',
  )
})

test('shows editable script chapters, summaries, and word counts', async () => {
  const user = userEvent.setup()
  const details = {
    type: 'script',
    chapters: [{ id: 'chapter-1', title: '第一章', summary: '主角在雨夜重逢' }],
  }
  const { onUpdateNodeDetails } = renderSpecializedNode('脚本 01', 'script', details)
  const panel = screen.getByRole('region', { name: '脚本 01 脚本参数' })
  expect(within(panel).getByRole('list', { name: '章节列表' })).toBeVisible()
  expect(within(panel).getByText('共 10 字')).toBeVisible()
  await user.clear(within(panel).getByRole('textbox', { name: '第一章情节摘要' }))
  await user.type(within(panel).getByRole('textbox', { name: '第一章情节摘要' }), '河灯熄灭')
  expect(onUpdateNodeDetails).toHaveBeenCalled()
})

test('preserves script drafting while unconfigured real generation remains disabled', async () => {
  const user = userEvent.setup()
  const onGenerateText = vi.fn()
  const { onUpdateNodeDetails } = renderSpecializedNode('脚本 01', 'script', { type: 'script', chapters: [], modelProviderId: 'mock-text-llm', outline: '', sceneCount: 3 }, true, { onGenerateText })
  const panel = screen.getByRole('region', { name: '脚本 01 脚本参数' })
  await user.type(within(panel).getByRole('textbox', { name: '剧情大纲' }), '一盏河灯引出失踪真相')
  await user.clear(within(panel).getByRole('spinbutton', { name: '场次数量' }))
  await user.type(within(panel).getByRole('spinbutton', { name: '场次数量' }), '2')
  expect(within(panel).getByRole('combobox', { name: '脚本模型' })).toHaveValue('ark-text-llm')
  expect(within(panel).getByRole('button', { name: '生成脚本，预计成本 1' })).toBeDisabled()
  expect(within(panel).getByRole('spinbutton', { name: '场次数量' })).toHaveValue(2)
  expect(onUpdateNodeDetails).not.toHaveBeenCalled()
  expect(onGenerateText).not.toHaveBeenCalled()
})

test('shows persistent audio duration, voice, speed, and volume controls', async () => {
  const user = userEvent.setup()
  const details = {
    type: 'audio',
    durationSeconds: 12,
    voice: '温暖女声',
    speed: 1,
    volume: 80,
  }
  const { onUpdateNodeDetails } = renderSpecializedNode('音频 01', 'text', details)
  const panel = screen.getByRole('region', { name: '音频 01 音频参数' })
  expect(within(panel).getByText('00:12')).toBeVisible()
  expect(within(panel).getByRole('button', { name: '音频智能断句切分' })).toBeDisabled()
  expect(within(panel).getByText(/待接入音频智能断句切分服务/, { selector: 'small' })).toBeVisible()
  await user.selectOptions(within(panel).getByRole('combobox', { name: '音色' }), '沉稳男声')
  await user.clear(within(panel).getByRole('spinbutton', { name: '语速' }))
  await user.type(within(panel).getByRole('spinbutton', { name: '语速' }), '1.2')
  expect(onUpdateNodeDetails).toHaveBeenCalled()
})

test('switches between real audio providers with manifest defaults and estimated cost', async () => {
  const user = userEvent.setup()
  const details = { type: 'audio', durationSeconds: 12, voice: '温暖女声', speed: 1, volume: 80, modelProviderId: 'ark-tts' }
  const { onUpdateNodeDetails } = renderSpecializedNode('音频 01', 'text', details, true, { providerRegistry: createFixtureProviderRegistry() })
  const panel = screen.getByRole('region', { name: '音频 01 音频参数' })
  const model = within(panel).getByRole('combobox', { name: '音频模型' })
  expect(within(model).getAllByRole('option')).toHaveLength(4)
  expect(within(panel).getByText('预计成本 1')).toBeVisible()
  await user.selectOptions(model, 'ark-audio-gen')
  expect(onUpdateNodeDetails).toHaveBeenLastCalledWith(expect.objectContaining({ modelProviderId: 'ark-audio-gen', modelVariant: undefined }))
  expect(within(panel).getByText('预计成本 12')).toBeVisible()
  expect(within(panel).queryByText('本地演示')).not.toBeInTheDocument()
})

test.each(['mock', 'configured'] as const)('explains both unavailable Ark audio tools without side effects (%s)', async (mode) => {
  const user = userEvent.setup()
  const onGenerateAudio = vi.fn()
  const onProcessAudio = vi.fn()
  const { onUpdateNodeDetails } = renderSpecializedNode('音频 01', 'text', {
    type: 'audio', durationSeconds: 12, voice: '温暖女声', speed: 1, volume: 80,
  }, true, {
    providerRegistry: mode === 'mock' ? createDefaultProviderRegistry() : createFixtureProviderRegistry(),
    onGenerateAudio, onProcessAudio,
  })
  const panel = screen.getByRole('region', { name: '音频 01 音频参数' })
  for (const [name, alternative] of [['人声/背景音分离', 'AI MediaKit'], ['音频智能断句切分', '豆包语音 ASR']]) {
    const button = within(panel).getByRole('button', { name })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(expect.stringContaining('当前 Ark 接口不支持'))
    expect(button).toHaveAccessibleDescription(expect.stringContaining(alternative))
    const reason = document.getElementById(button.getAttribute('aria-describedby')!)!
    expect(reason).toBeVisible()
    expect(reason).toHaveTextContent('非官方报价')
    expect(reason).toHaveTextContent('不会扣费')
    await user.click(button)
  }
  expect(onUpdateNodeDetails).not.toHaveBeenCalled()
  expect(onGenerateAudio).not.toHaveBeenCalled()
  expect(onProcessAudio).not.toHaveBeenCalled()
})

test('groups live Ark audio models and dispatches TTS with persisted node parameters', async () => {
  const user = userEvent.setup()
  const onGenerateAudio = vi.fn()
  const registry = createDefaultProviderRegistry({
    arkTts: {
      mode: 'seedream-direct-dev',
      apiKey: 'fixture-speech-key',
      apiBase: 'https://fixture.speech.invalid/api/v3',
      fetchFn: vi.fn<typeof fetch>(),
    },
    arkAudio: {
      mode: 'seedream-direct-dev',
      apiKey: 'fixture-speech-key',
      apiBase: 'https://fixture.speech.invalid/api/v3',
      fetchFn: vi.fn<typeof fetch>(),
    },
  })
  const details = {
    type: 'audio',
    durationSeconds: 12,
    voice: '温暖女声',
    speed: 1,
    volume: 75,
    modelProviderId: 'ark-tts',
    modelVariant: 'ambience',
    prompt: '',
    sampleRate: 24000,
    format: 'mp3',
  }
  renderSpecializedNode('音频 01', 'text', details, true, {
    providerRegistry: registry,
    onGenerateAudio,
  } as Partial<CreativeNodeData>)
  const panel = screen.getByRole('region', { name: '音频 01 音频参数' })
  const model = within(panel).getByRole('combobox', { name: '音频模型' })

  expect(within(model).getByRole('group', { name: '官方 API 已接（开发直连）' }))
    .toBeVisible()
  expect(within(model).getByRole('option', { name: '豆包语音合成 2.0 · 1 积分/次' }))
    .toBeEnabled()
  expect(within(model).getByRole('option', { name: '豆包音频生成 1.0 · 1 积分/秒' }))
    .toBeEnabled()

  await user.selectOptions(model, 'ark-tts')
  await user.type(
    within(panel).getByRole('textbox', { name: '音频生成提示词' }),
    '清晨薄雾中的古桥旁白',
  )
  await user.selectOptions(within(panel).getByRole('combobox', { name: '输出格式' }), 'wav')
  await user.click(within(panel).getByRole('button', { name: '生成音频，预计成本 1' }))

  expect(onGenerateAudio).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'audio',
      modelProviderId: 'ark-tts',
      prompt: '清晨薄雾中的古桥旁白',
      format: 'wav',
      sampleRate: 24000,
    }),
    '清晨薄雾中的古桥旁白',
  )
})

test('offers waveform selection, preview speed, and real WAV processing for audio assets', async () => {
  const user = userEvent.setup()
  const onProcessAudio = vi.fn(async () => undefined)
  const details = {
    type: 'audio',
    durationSeconds: 12,
    voice: '温暖女声',
    speed: 1,
    volume: 80,
    trimStartSeconds: 1,
    trimEndSeconds: 10,
    playbackRate: 1.5,
  }
  renderSpecializedNode('音频 01', 'text', details, true, {
    asset: {
      id: 'audio-asset',
      kind: 'audio',
      url: 'data:audio/wav;base64,UklGRg==',
      mimeType: 'audio/wav',
      durationSeconds: 12,
    },
    onProcessAudio,
  })
  const panel = screen.getByRole('region', { name: '音频 01 音频参数' })
  expect(within(panel).getByRole('img', { name: '真实音频波形' })).toBeVisible()
  expect(within(panel).getByLabelText('音频入点')).toHaveValue('1')
  expect(within(panel).getByLabelText('音频出点')).toHaveValue('10')
  expect(within(panel).getByLabelText('音频变速')).toHaveValue('1.5')
  await user.click(within(panel).getByRole('button', { name: '截取并导出 WAV' }))
  expect(onProcessAudio).toHaveBeenCalledWith({
    startSeconds: 1,
    endSeconds: 10,
    playbackRate: 1.5,
  })
})

test('adds, sorts, and removes director shots with camera hints', async () => {
  const user = userEvent.setup()
  const details = {
    type: 'director',
    shots: [
      { id: 'shot-a', title: '远景建立', cameraHint: '稳定机位' },
      { id: 'shot-b', title: '人物入画', cameraHint: '滑轨前推' },
    ],
  }
  const { onUpdateNodeDetails } = renderSpecializedNode('导演台 01', 'script', details)
  const panel = screen.getByRole('region', { name: '导演台 01 导演台参数' })
  expect(within(panel).getByRole('list', { name: '分镜编排列表' })).toBeVisible()
  expect(within(panel).getByRole('button', { name: '深度动作捕捉' })).toBeDisabled()
  expect(within(panel).getByText(/待接入深度动作捕捉服务/)).toBeVisible()
  expect(within(panel).getByRole('textbox', { name: '远景建立机位提示' })).toHaveValue('稳定机位')
  await user.click(within(panel).getByRole('button', { name: '上移人物入画' }))
  expect(onUpdateNodeDetails).toHaveBeenLastCalledWith({
    ...details,
    shots: [details.shots[1], details.shots[0]],
  })
  await user.click(within(panel).getByRole('button', { name: '删除远景建立' }))
  expect(onUpdateNodeDetails).toHaveBeenCalledWith({
    ...details,
    shots: [details.shots[1]],
  })
  await user.click(within(panel).getByRole('button', { name: '新增分镜' }))
  expect(onUpdateNodeDetails).toHaveBeenLastCalledWith({
    ...details,
    shots: [
      ...details.shots,
      expect.objectContaining({ title: '分镜 03' }),
    ],
  })
})

test('configures frame analysis dimensions while exposing the managed AI placeholder', async () => {
  const user = userEvent.setup()
  const details = {
    type: 'frame-analysis',
    sourceName: '待选择素材',
    sourceSummary: '尚未绑定视频',
    dimensions: { storyboard: true, motion: true, music: true },
  }
  const { onUpdateNodeDetails } = renderSpecializedNode('逐帧拉片 01', 'storyboard', details)
  const panel = screen.getByRole('region', { name: '逐帧拉片 01 逐帧拉片参数' })
  expect(within(panel).getByText('尚未绑定视频')).toBeVisible()
  await user.upload(
    within(panel).getByLabelText('替换素材'),
    new File(['demo'], '雨夜镜头.mp4', { type: 'video/mp4' }),
  )
  expect(onUpdateNodeDetails).toHaveBeenCalledWith({
    ...details,
    sourceName: '雨夜镜头.mp4',
    sourceSummary: 'video/mp4 · 1 KB',
  })
  await user.click(within(panel).getByRole('checkbox', { name: '音乐维度' }))
  expect(onUpdateNodeDetails).toHaveBeenLastCalledWith({
    ...details,
    dimensions: { ...details.dimensions, music: false },
  })
  expect(within(panel).getByRole('button', { name: '开始拉片' })).toBeDisabled()
  expect(within(panel).getByText(/待接入逐帧拉片分析服务/)).toBeVisible()
})

test('shows smart-edit tracks, clips, and export duration', () => {
  const details = {
    type: 'smart-edit',
    tracks: [
      { id: 'video-track', name: '主视频轨' },
      { id: 'audio-track', name: '音频轨' },
    ],
    clips: [
      { id: 'clip-a', name: '片段 01', durationSeconds: 4 },
      { id: 'clip-b', name: '片段 02', durationSeconds: 3 },
    ],
    exportDurationSeconds: 7,
  }
  renderSpecializedNode('智能剪辑 01', 'video', details)
  const panel = screen.getByRole('region', { name: '智能剪辑 01 智能剪辑参数' })
  expect(within(panel).getByRole('list', { name: '剪辑轨道' })).toHaveTextContent('主视频轨')
  expect(within(panel).getByRole('textbox', { name: '片段 02名称' })).toHaveValue('片段 02')
  expect(within(panel).getByText('导出时长 00:07')).toBeVisible()
  expect(within(panel).getByRole('button', { name: '智能粗剪' })).toBeDisabled()
  expect(within(panel).getByRole('button', { name: '智能混剪' })).toBeDisabled()
  expect(within(panel).getByText(/待接入智能剪辑粗剪\/混剪服务/)).toBeVisible()
})
