import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { CreativeFlowNode, CreativeNodeData } from '../node-types'
import { VideoNode } from './VideoNode'
import { VideoToolDetails } from './VideoNodeDetails'

function makeData(contextual: boolean): CreativeNodeData {
  return {
    node: {
      id: 'video-node-16',
      kind: 'video',
      title: '视频节点 16',
      position: { x: 0, y: 0 },
      versions: [
        {
          id: 'video-version-1',
          createdAt: '2026-08-14T00:00:00.000Z',
          prompt: '摄影机沿平台边缘缓慢向右横移',
          assetId: 'video-asset-1',
        },
      ],
      activeVersionId: 'video-version-1',
      sourceChanged: false,
    },
    asset: {
      id: 'video-asset-1',
      kind: 'video',
      url: '/demo/video.mp4',
      mimeType: 'video/mp4',
      width: 1280,
      height: 720,
      durationSeconds: 3.041,
    },
    videoReferences: [
      {
        id: 'image-node-1',
        title: '图片节点 1',
        asset: {
          id: 'image-asset-1',
          kind: 'image',
          url: '/demo/reference.png',
          mimeType: 'image/png',
          width: 1456,
          height: 816,
        },
      },
    ],
    selected: contextual,
    contextual,
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
    onCreateVideoToolNode: vi.fn(),
    onSelectModelProvider: vi.fn(),
    onLocalVideoGenerate: vi.fn(),
  }
}

function renderVideo(data: CreativeNodeData) {
  const node: CreativeFlowNode = {
    id: data.node.id,
    type: 'video',
    position: data.node.position,
    initialWidth: 420,
    initialHeight: 760,
    data,
  }

  return (
    <div style={{ width: 1000, height: 900 }}>
      <ReactFlowProvider>
        <ReactFlow nodes={[node]} edges={[]} nodeTypes={{ video: VideoNode }} />
      </ReactFlowProvider>
    </div>
  )
}

test('keeps a video as a folded media card until it becomes the current node', () => {
  const view = render(renderVideo(makeData(false)))

  expect(screen.getByLabelText('视频节点 16')).toContainElement(
    document.querySelector('video'),
  )
  expect(screen.getByText('1280 × 720')).toBeVisible()
  expect(screen.getByText('1 个结果')).toBeVisible()
  expect(
    screen.queryByRole('region', { name: '视频节点 16 生成参数' }),
  ).not.toBeInTheDocument()

  view.rerender(renderVideo(makeData(true)))
  expect(
    screen.getByRole('region', { name: '视频节点 16 生成参数' }),
  ).toBeVisible()
  expect(screen.getByRole('button', { name: '连接到视频节点 16' })).toHaveStyle({
    top: '112px',
  })
  expect(
    screen.getByRole('button', { name: '从视频节点 16建立连接' }),
  ).toHaveStyle({ top: '112px' })
})

test('renders an empty selected video as a Liblib media card with a separate compact composer', () => {
  const data = makeData(true)
  data.node = {
    ...data.node,
    title: '视频节点 7',
    versions: [{
      id: 'empty-video-version',
      createdAt: '2026-08-20T00:00:00.000Z',
      prompt: '',
    }],
    activeVersionId: 'empty-video-version',
  }
  data.asset = undefined

  render(renderVideo(data))

  const card = screen.getByRole('article')
  const composer = screen.getByRole('region', { name: '视频节点 7 生成参数' })
  const floatingTitle = screen
    .getByRole('textbox', { name: '节点名称' })
    .closest('.creative-node__floating-title')
  expect(card).toHaveClass('creative-node--liblib-media')
  expect(floatingTitle).toBeVisible()
  expect(card).not.toContainElement(floatingTitle as HTMLElement)
  expect(floatingTitle?.nextElementSibling).toBe(card)
  expect(card).not.toContainElement(composer)
  expect(composer.parentElement).toHaveClass('creative-node-composer')
  expect(within(composer).getByRole('toolbar', { name: '视频主操作' })).toBeVisible()
  expect(within(composer).getByLabelText('生成模式')).toHaveValue('全能参考')
  expect(within(composer).getByText('16:9 · 720P · 5s · 1个')).toBeVisible()
})

test('renders the verified video generation controls, disabled modes, and cost', async () => {
  const user = userEvent.setup()
  const data = makeData(true)
  render(renderVideo(data))
  const panel = screen.getByRole('region', { name: '视频节点 16 生成参数' })

  expect(within(panel).getByLabelText('提示词')).toHaveAttribute('maxlength', '2000')
  const model = within(panel).getByLabelText('模型')
  expect(model).toHaveValue('mock-seedance-video')
  expect(within(model).getByRole('option', { name: /Mock Studio.*Seedance 2.0.*135 积分\/次.*演示/ })).toBeEnabled()
  expect(within(model).getByRole('option', { name: /Mock Studio.*可灵风格视频.*24 积分\/次.*演示/ })).toBeEnabled()
  expect(within(model).getByRole('option', { name: /Kling.*待接入/ })).toBeDisabled()
  expect(within(panel).getByText('演示', { exact: true })).toBeVisible()
  await user.selectOptions(model, 'mock-kling-video')
  expect(data.onSelectModelProvider).toHaveBeenCalledWith('mock-kling-video')
  const mode = within(panel).getByLabelText('生成模式')
  expect(mode).toHaveValue('全能参考')
  expect(within(mode).getByRole('option', { name: '文生视频' })).toBeDisabled()
  expect(within(mode).getByRole('option', { name: '图片参考' })).toBeEnabled()
  await user.click(within(panel).getByRole('button', { name: '展开完整视频工具' }))
  expect(
    within(panel).getByText(/文生视频：当前节点已绑定全能参考配置/),
  ).toBeVisible()
  expect(within(panel).getByLabelText('比例')).toHaveValue('16:9')
  expect(within(panel).getByLabelText('时长')).toHaveValue('5')
  expect(within(panel).getByLabelText('生成数量')).toHaveValue('1')
  expect(within(panel).getByLabelText('画质')).toHaveValue('720P')
  expect(within(panel).getByLabelText('声音')).toHaveValue('开启')
  expect(within(panel).getByLabelText('智能分镜')).not.toBeChecked()
  expect(within(panel).getByLabelText('预计成本 135')).toBeVisible()

  await user.click(within(panel).getByRole('button', { name: '展开高级设置' }))
  expect(within(panel).getByLabelText('联网搜索')).toBeChecked()
  expect(within(panel).getByLabelText('自动校验素材')).toBeChecked()
  expect(within(panel).getByLabelText('智能引用 AutoLink')).toBeChecked()
})

test('recomputes video defaults, price, and advanced switches from the selected model', async () => {
  const user = userEvent.setup()
  const data = makeData(true)
  const view = render(renderVideo(data))
  const panel = screen.getByRole('region', { name: '视频节点 16 生成参数' })

  expect(within(panel).getByText('16:9 · 720P · 5s · 1个')).toBeVisible()
  expect(within(panel).getByLabelText('声音')).toHaveValue('开启')
  expect(within(panel).getByLabelText('预计成本 135')).toBeVisible()

  view.rerender(renderVideo({
    ...data,
    node: { ...data.node, modelProviderId: 'mock-kling-video' },
  }))

  expect(within(panel).getByText('16:9 · 标准 · 3s · 1个')).toBeVisible()
  expect(within(panel).getByLabelText('声音')).toHaveValue('关闭')
  expect(within(panel).getByLabelText('预计成本 24')).toBeVisible()
  await user.click(within(panel).getByRole('button', { name: '展开高级设置' }))
  expect(within(panel).getByLabelText('智能引用 AutoLink')).toBeChecked()
  expect(within(panel).queryByLabelText('联网搜索')).not.toBeInTheDocument()
  expect(within(panel).queryByLabelText('自动校验素材')).not.toBeInTheDocument()
})

test('exposes frame confirmations and all seven reference controls without mutating on escape', async () => {
  const user = userEvent.setup()
  const data = makeData(true)
  render(renderVideo(data))

  await user.click(screen.getByRole('button', { name: '展开完整视频工具' }))

  const frameTools = screen.getByRole('toolbar', { name: '帧操作' })
  for (const label of ['截取首帧', '截取尾帧', '截取当前帧', '相机截取当前帧']) {
    expect(within(frameTools).getByRole('button', { name: label })).toBeVisible()
  }
  await user.click(within(frameTools).getByRole('button', { name: '截取首帧' }))
  expect(screen.getByRole('alertdialog', { name: '添加截取首帧工具节点' })).toHaveTextContent(
    '将添加工具节点',
  )
  await user.keyboard('{Escape}')
  expect(data.onCreateVideoToolNode).not.toHaveBeenCalled()

  const referenceTools = screen.getByRole('toolbar', { name: '引用与控制' })
  for (const label of ['参考', '标记', '特效', '主体', '角色库', '运镜', '1 @']) {
    expect(within(referenceTools).getByRole('button', { name: label })).toBeVisible()
  }
  await user.click(within(referenceTools).getByRole('button', { name: '参考' }))
  expect(screen.getByRole('region', { name: '从画布选择参考' })).toHaveTextContent(
    '在当前画布中添加参考',
  )
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('region', { name: '从画布选择参考' })).not.toBeInTheDocument()

  await user.click(within(referenceTools).getByRole('button', { name: '1 @' }))
  expect(screen.getByRole('region', { name: '1 个引用' })).toHaveTextContent('图片节点 1')
})

test('opens the verified mark, effects, subject, character, and camera-motion surfaces', async () => {
  const user = userEvent.setup()
  render(renderVideo(makeData(true)))
  await user.click(screen.getByRole('button', { name: '展开完整视频工具' }))
  const tools = screen.getByRole('toolbar', { name: '引用与控制' })

  await user.click(within(tools).getByRole('button', { name: '标记' }))
  expect(screen.getByRole('region', { name: '元素选择模式' })).toHaveTextContent(
    '点击图片选择局部元素',
  )
  await user.keyboard('{Escape}')

  await user.click(within(tools).getByRole('button', { name: '特效' }))
  const effects = screen.getByRole('dialog', { name: '特效面板' })
  expect(within(effects).getByRole('tab', { name: '特效广场' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(within(effects).getByPlaceholderText('搜索特效名称、作者')).toBeVisible()
  expect(
    within(effects).getByText('本地演示仅展示已核对列表，不执行应用或收藏。'),
  ).toBeVisible()
  await user.keyboard('{Escape}')

  await user.click(within(tools).getByRole('button', { name: '主体' }))
  expect(screen.getByRole('dialog', { name: '我的主体' })).toHaveTextContent('创建主体')
  await user.keyboard('{Escape}')

  await user.click(within(tools).getByRole('button', { name: '角色库' }))
  expect(screen.getByRole('dialog', { name: '角色库' })).toHaveTextContent('每页 10 项')
  await user.keyboard('{Escape}')

  await user.click(within(tools).getByRole('button', { name: '运镜' }))
  const camera = screen.getByRole('dialog', { name: '运镜面板' })
  expect(within(camera).getAllByRole('article')).toHaveLength(23)
})

test('renders exact local configurations for video upscale and frame analysis nodes', () => {
  const upscale = makeData(true)
  upscale.node = {
    ...upscale.node,
    kind: 'storyboard',
    title: '高清（1080P）',
    videoTool: {
      kind: 'upscale',
      model: 'Topazlabs',
      resolution: '1080P',
      interpolation: '不补帧',
      slowMotion: '1x',
      cost: 16,
    },
  }
  const view = render(<VideoToolDetails data={upscale} />)
  const panel = screen.getByRole('region', { name: '视频高清参数' })
  expect(within(panel).getByLabelText('模型')).toHaveValue('Topazlabs')
  expect(within(panel).getByLabelText('分辨率')).toHaveValue('1080P')
  expect(within(panel).getByLabelText('补帧')).toHaveValue('不补帧')
  expect(within(panel).getByLabelText('慢放倍数')).toHaveValue('1x')
  expect(within(panel).getByText('预计成本 16')).toBeVisible()

  const analysis = makeData(true)
  analysis.node = {
    ...analysis.node,
    kind: 'storyboard',
    title: '逐帧拉片',
    videoTool: {
      kind: 'frame-analysis',
      model: 'SD2.5',
      dimensions: ['分镜', '动态', '音乐'],
    },
  }
  view.rerender(<VideoToolDetails data={analysis} />)
  const analysisPanel = screen.getByRole('region', { name: '逐帧拉片参数' })
  for (const dimension of ['分镜', '动态', '音乐']) {
    expect(within(analysisPanel).getByLabelText(dimension)).toBeChecked()
  }
})
