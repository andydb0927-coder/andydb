import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

import type { Project } from '../project/model'
import {
  CanvasAgentPanel,
  CanvasStoryboardView,
  CanvasViewControls,
  SelectionContextBar,
  WorkspaceSidePanel,
} from './CanvasWorkspace'

const project: Project = {
  id: 'workspace-project',
  title: '工作台演示',
  intent: '测试画布工作台',
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
  assets: [
    {
      id: 'image-asset',
      kind: 'image',
      url: '/demo/image.png',
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
    },
    {
      id: 'video-asset',
      kind: 'video',
      url: '/demo/video.mp4',
      mimeType: 'video/mp4',
      durationSeconds: 5,
    },
  ],
  nodes: [
    {
      id: 'text-node',
      kind: 'text',
      title: '旁白',
      position: { x: 0, y: 0 },
      versions: [{ id: 'text-v1', createdAt: '2026-08-13T00:00:00.000Z', prompt: '雨夜' }],
      activeVersionId: 'text-v1',
      sourceChanged: false,
    },
    {
      id: 'image-node',
      kind: 'image',
      title: '角色图',
      position: { x: 300, y: 0 },
      versions: [{ id: 'image-v1', createdAt: '2026-08-13T00:01:00.000Z', prompt: '角色', assetId: 'image-asset' }],
      activeVersionId: 'image-v1',
      sourceChanged: false,
      storyboardDialogue: '别回头。',
    },
    {
      id: 'video-node',
      kind: 'video',
      title: '视频 01',
      position: { x: 600, y: 0 },
      versions: [{ id: 'video-v1', createdAt: '2026-08-13T00:02:00.000Z', prompt: '镜头', assetId: 'video-asset' }],
      activeVersionId: 'video-v1',
      sourceChanged: false,
    },
    {
      id: 'image-node-2',
      kind: 'storyboard',
      title: '河岸镜头',
      position: { x: 460, y: 120 },
      versions: [{ id: 'image-v2', createdAt: '2026-08-13T00:01:30.000Z', prompt: '河岸', assetId: 'image-asset' }],
      activeVersionId: 'image-v2',
      sourceChanged: false,
    },
  ],
  edges: [],
  timeline: [],
  jobs: [
    {
      id: 'job-1',
      projectId: 'workspace-project',
      nodeId: 'video-node',
      status: 'succeeded',
      prompt: '镜头',
      createdAt: '2026-08-13T00:02:00.000Z',
      updatedAt: '2026-08-13T00:03:00.000Z',
      providerId: 'mock-kling-video',
      providerName: 'Mock Studio',
      modelName: '可灵风格视频',
      progress: 100,
      creditsSpent: 24,
    },
  ],
  exportJobs: [],
}

test('groups project nodes into storyboard sections, saves dialogue, and reports totals', async () => {
  const user = userEvent.setup()
  const onOpenNode = vi.fn()
  const onUpdateDialogue = vi.fn()
  render(
    <CanvasStoryboardView
      project={project}
      onOpenNode={onOpenNode}
      onReorderNodes={vi.fn()}
      onUpdateDialogue={onUpdateDialogue}
    />,
  )

  for (const section of ['文本区', '图片区', '视频区']) {
    expect(screen.getByRole('region', { name: section })).toBeVisible()
  }
  const imageCard = screen.getByRole('article', { name: '图片故事板卡 角色图' })
  expect(within(imageCard).getByText('1024 × 1024')).toBeVisible()
  const dialogue = within(imageCard).getByRole('textbox', { name: '角色图对白' })
  expect(dialogue).toHaveValue('别回头。')
  await user.clear(dialogue)
  await user.type(dialogue, '林渊：等等我。')
  await user.click(within(imageCard).getByRole('button', { name: '保存角色图对白' }))
  expect(onUpdateDialogue).toHaveBeenCalledWith('image-node', '林渊：等等我。')
  const stats = screen.getByRole('status', { name: '故事板统计' })
  expect(stats).toHaveTextContent('总镜头数 3')
  expect(stats).toHaveTextContent('总时长 00:05')

  await user.click(within(imageCard).getByRole('button', { name: '定位 角色图' }))
  expect(onOpenNode).toHaveBeenCalledWith('image-node')
})

test('persists section collapse outside project data', async () => {
  localStorage.clear()
  const user = userEvent.setup()
  const props = {
    project,
    onOpenNode: vi.fn(),
    onReorderNodes: vi.fn(),
    onUpdateDialogue: vi.fn(),
  }
  const first = render(<CanvasStoryboardView {...props} />)

  const toggle = screen.getByRole('button', { name: '收起图片区' })
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await user.click(toggle)
  expect(screen.queryByRole('article', { name: '图片故事板卡 角色图' })).not.toBeInTheDocument()
  expect(localStorage.getItem(`wireless-canvas:storyboard-sections:${project.id}`)).toContain('"image":false')

  first.unmount()
  render(<CanvasStoryboardView {...props} />)
  expect(screen.getByRole('button', { name: '展开图片区' })).toHaveAttribute('aria-expanded', 'false')
})

test('drags cards to reorder the shared canvas node source', () => {
  localStorage.clear()
  const onReorderNodes = vi.fn()
  render(
    <CanvasStoryboardView
      project={project}
      onOpenNode={vi.fn()}
      onReorderNodes={onReorderNodes}
      onUpdateDialogue={vi.fn()}
    />,
  )
  const source = screen.getByRole('article', { name: '图片故事板卡 河岸镜头' })
  const target = screen.getByRole('article', { name: '图片故事板卡 角色图' })

  const dataTransfer = {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: vi.fn(),
    getData: vi.fn(() => 'image-node-2'),
  }
  fireEvent.dragStart(source, { dataTransfer })
  fireEvent.dragOver(target, { dataTransfer })
  fireEvent.drop(target, { dataTransfer })
  expect(onReorderNodes).toHaveBeenCalledWith('image-node-2', 'image-node')

  onReorderNodes.mockClear()
  const videoTarget = screen.getByRole('article', { name: '视频故事板卡 视频 01' })
  fireEvent.dragStart(source, { dataTransfer })
  fireEvent.dragOver(videoTarget, { dataTransfer })
  fireEvent.drop(videoTarget, { dataTransfer })
  expect(onReorderNodes).not.toHaveBeenCalled()
})

test('refreshes a saved storyboard dialogue after project history changes', async () => {
  localStorage.clear()
  const user = userEvent.setup()
  const props = {
    onOpenNode: vi.fn(),
    onReorderNodes: vi.fn(),
    onUpdateDialogue: vi.fn(),
  }
  const view = render(<CanvasStoryboardView project={project} {...props} />)
  const dialogue = screen.getByRole('textbox', { name: '角色图对白' })
  await user.clear(dialogue)
  await user.type(dialogue, '林渊：跟紧我。')

  const savedProject = {
    ...project,
    nodes: project.nodes.map((node) => node.id === 'image-node'
      ? { ...node, storyboardDialogue: '林渊：跟紧我。' }
      : node),
  }
  view.rerender(<CanvasStoryboardView project={savedProject} {...props} />)
  expect(screen.getByRole('textbox', { name: '角色图对白' })).toHaveValue('林渊：跟紧我。')

  view.rerender(<CanvasStoryboardView project={project} {...props} />)
  expect(screen.getByRole('textbox', { name: '角色图对白' })).toHaveValue('别回头。')
})

test('shows local assets, generation history and the complete four-group shortcut reference', () => {
  const { rerender } = render(
    <WorkspaceSidePanel panel="assets" project={project} onClose={vi.fn()} onSelectNode={vi.fn()} />,
  )
  expect(screen.getByRole('complementary', { name: '资产管理' })).toHaveTextContent('角色图')

  rerender(
    <WorkspaceSidePanel panel="history" project={project} onClose={vi.fn()} onSelectNode={vi.fn()} />,
  )
  expect(screen.getByRole('complementary', { name: '历史' })).toHaveTextContent('已完成')
  expect(screen.getByRole('complementary', { name: '历史' })).toHaveTextContent('Mock Studio · 可灵风格视频')
  expect(screen.getByRole('complementary', { name: '历史' })).toHaveTextContent('消耗 24 积分')

  rerender(
    <WorkspaceSidePanel panel="shortcuts" project={project} onClose={vi.fn()} onSelectNode={vi.fn()} />,
  )
  const panel = screen.getByRole('complementary', { name: '快捷键' })
  for (const group of ['创作', '缩放', '移动画布', '其他']) {
    expect(within(panel).getByRole('heading', { name: group })).toBeVisible()
  }
  for (const [action, shortcut] of [
    ['成组', 'G'],
    ['合并分镜组', '⌥ G'],
    ['解组', '⇧ G'],
    ['连线', 'L'],
    ['复制节点和连线', 'D'],
    ['生成', 'Enter'],
    ['新建节点', 'Tab'],
    ['节点复制', '⌥ 拖动节点'],
    ['创建副本', '⌥ 拖动'],
    ['放大', '+'],
    ['缩小', '−'],
    ['适应画布', '0'],
    ['移动工具', 'V'],
    ['抓手工具', 'H'],
    ['整理画布', '⌥ ⇧ F'],
    ['撤销', '⌘ Z'],
    ['重做', '⌘ ⇧ Z'],
    ['删除', 'Delete'],
  ]) {
    const row = within(panel).getByText(action).closest('div')
    expect(row).toHaveTextContent(shortcut)
  }
  expect(panel).toHaveTextContent('键盘：按住 Space 临时平移')
  expect(panel).toHaveTextContent('触控板：双指移动与缩放')
  expect(panel).toHaveTextContent('鼠标：滚轮缩放，抓手模式拖动平移')
})

test('shows the compact four-category tutorial drawer and links to the full tutorial center', () => {
  render(
    <MemoryRouter>
      <WorkspaceSidePanel panel="help" project={project} onClose={vi.fn()} onSelectNode={vi.fn()} />
    </MemoryRouter>,
  )

  const drawer = screen.getByRole('complementary', { name: '教程' })
  for (const category of ['入门', '图片创作', '视频创作', '高级']) {
    expect(within(drawer).getByRole('heading', { name: category })).toBeVisible()
  }
  expect(within(drawer).getByRole('link', { name: '查看完整教程' })).toHaveAttribute(
    'href',
    '/tutorials',
  )
})

test('exposes independent workspace view controls', async () => {
  const user = userEvent.setup()
  const onToggleMinimap = vi.fn()
  const onToggleSnap = vi.fn()
  const onFitView = vi.fn()
  render(
    <CanvasViewControls
      minimapVisible={false}
      snapToGrid={false}
      zoomPercent={100}
      onToggleMinimap={onToggleMinimap}
      onToggleSnap={onToggleSnap}
      onFitView={onFitView}
    />,
  )

  await user.click(screen.getByRole('button', { name: '显示小地图' }))
  await user.click(screen.getByRole('button', { name: '开启网格吸附' }))
  await user.click(screen.getByRole('button', { name: '适配画布' }))
  expect(onToggleMinimap).toHaveBeenCalledOnce()
  expect(onToggleSnap).toHaveBeenCalledOnce()
  expect(onFitView).toHaveBeenCalledOnce()
  expect(screen.getByText('100%')).toBeVisible()
})

test('keeps the agent in a named side panel and provides an explicit close action', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(<CanvasAgentPanel onClose={onClose}><p>AI 导演内容</p></CanvasAgentPanel>)
  expect(screen.getByRole('complementary', { name: 'Agent 工作区' })).toHaveTextContent('AI 导演内容')
  await user.click(screen.getByRole('button', { name: '关闭 Agent' }))
  expect(onClose).toHaveBeenCalledOnce()
})

test('offers the exact eleven image actions and confirms only click-to-insert tools', async () => {
  const user = userEvent.setup()
  const onCreateToolNode = vi.fn()
  const { rerender } = render(
    <SelectionContextBar project={project} node={project.nodes[0]} onCreateToolNode={onCreateToolNode} onRotateImage={vi.fn()} />,
  )
  expect(screen.queryByRole('toolbar', { name: '图片创作工具' })).not.toBeInTheDocument()

  rerender(
    <SelectionContextBar project={project} node={project.nodes[1]} onCreateToolNode={onCreateToolNode} onRotateImage={vi.fn()} />,
  )
  for (const label of ['人像质感调节', '全景', '多角度', '打光', '九宫格', '高清', '宫格切分', '标注', '旋转', '下载', '预览']) {
    expect(screen.getByRole('button', { name: label })).toBeVisible()
  }
  const imageToolbar = screen.getByRole('toolbar', { name: '图片创作工具' })
  const portrait = within(imageToolbar).getByRole('button', { name: '人像质感调节' })
  expect(portrait).toHaveAttribute('aria-haspopup', 'menu')
  expect(within(portrait).getByText('NEW')).toBeVisible()
  expect(portrait.querySelector('.lucide-chevron-down')).toBeInTheDocument()
  const panorama = within(imageToolbar).getByRole('button', { name: '全景' })
  expect(panorama).toHaveAttribute('title', '基于当前场景创建720°全景图')
  expect(panorama.querySelector('.image-context-action__panorama-icon')).toHaveTextContent('720')
  for (const label of ['九宫格', '宫格切分']) {
    const menuTrigger = within(imageToolbar).getByRole('button', { name: label })
    expect(menuTrigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(menuTrigger.querySelector('.lucide-chevron-down')).toBeInTheDocument()
  }
  for (const label of ['人像质感调节', '全景', '多角度', '打光', '九宫格', '高清', '宫格切分']) {
    expect(within(imageToolbar).getByRole('button', { name: label })).toHaveAttribute('data-compact', 'false')
  }
  for (const label of ['标注', '旋转', '下载', '预览']) {
    expect(within(imageToolbar).getByRole('button', { name: label })).toHaveAttribute('data-compact', 'true')
  }

  await user.click(screen.getByRole('button', { name: '人像质感调节' }))
  expect(screen.getByRole('menuitem', { name: '人像调节' })).toBeVisible()
  expect(screen.getByRole('menuitem', { name: '情绪调节' })).toBeDisabled()
  expect(screen.getByText('情绪调节：尚未完成副作用实机核对，本地演示不可用。')).toBeVisible()
  await user.click(screen.getByRole('menuitem', { name: '人像调节' }))
  const confirmation = screen.getByRole('alertdialog', { name: '添加人像调节工具节点' })
  expect(confirmation).toHaveTextContent('将添加工具节点')
  expect(onCreateToolNode).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '确认添加' }))
  expect(onCreateToolNode).toHaveBeenCalledWith('人像调节')
})

test('keeps multi-angle, lighting, and annotation changes in drafts until submit', async () => {
  const user = userEvent.setup()
  const onCreateToolNode = vi.fn()
  render(
    <SelectionContextBar project={project} node={project.nodes[1]} onCreateToolNode={onCreateToolNode} onRotateImage={vi.fn()} />,
  )

  await user.click(screen.getByRole('button', { name: '多角度' }))
  const multiAngle = screen.getByRole('dialog', { name: '多角度编辑器' })
  for (const preset of ['自定义', '鱼眼视角', '倾斜视角', '正面俯拍', '正面仰拍', '全景俯拍', '背面视角']) {
    expect(within(multiAngle).getByRole('button', { name: preset })).toBeVisible()
  }
  expect(within(multiAngle).getByLabelText('水平环绕')).toHaveValue('0')
  expect(within(multiAngle).getByLabelText('垂直俯仰')).toHaveValue('0')
  expect(within(multiAngle).getByLabelText('景别缩放')).toHaveValue('5')
  expect(within(multiAngle).getByText('预计成本 1')).toBeVisible()
  expect(onCreateToolNode).not.toHaveBeenCalled()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: '多角度编辑器' })).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '打光' }))
  const lighting = screen.getByRole('dialog', { name: '打光编辑器' })
  for (const field of ['智能模式', '亮度级别', '亮度百分比', '颜色', '主光源', '轮廓光']) {
    expect(within(lighting).getByLabelText(field)).toBeVisible()
  }
  expect(within(lighting).getByText('调整任一参数后才可生成。')).toBeVisible()
  await user.keyboard('{Escape}')

  await user.click(screen.getByRole('button', { name: '标注' }))
  const annotation = screen.getByRole('dialog', { name: '标注编辑器' })
  for (const tool of ['画笔', '框注', '文字', '颜色', '线宽', '撤销', '重做']) {
    expect(within(annotation).getByLabelText(tool)).toBeVisible()
  }
  expect(within(annotation).getByRole('button', { name: '保存标注' })).toBeDisabled()
  expect(
    within(annotation).getByText('尚未创建标注，撤销、重做与保存均不可用。'),
  ).toBeVisible()
  await user.keyboard('{Escape}')
  expect(onCreateToolNode).not.toHaveBeenCalled()
})

test('opens the verified nine-grid, split, and canvas-image preview read-only surfaces', async () => {
  const user = userEvent.setup()
  render(
    <SelectionContextBar project={project} node={project.nodes[1]} onCreateToolNode={vi.fn()} onRotateImage={vi.fn()} />,
  )

  await user.click(screen.getByRole('button', { name: '九宫格' }))
  const templates = screen.getByRole('menu', { name: '九宫格模板' })
  expect(within(templates).getAllByRole('menuitem')).toHaveLength(11)
  expect(
    within(templates).getByText('规格仅核对至菜单层，本地演示不执行模板。'),
  ).toBeVisible()
  await user.keyboard('{Escape}')

  await user.click(screen.getByRole('button', { name: '宫格切分' }))
  const split = screen.getByRole('menu', { name: '宫格切分规格' })
  for (const option of ['4 宫格（2×2）', '9 宫格（3×3）', '16 宫格（4×4）', '25 宫格（5×5）', '自定义']) {
    expect(within(split).getByRole('menuitem', { name: option })).toBeVisible()
  }
  expect(
    within(split).getByText('规格未验证切分输出，本地演示不执行。'),
  ).toBeVisible()
  await user.keyboard('{Escape}')

  await user.click(screen.getByRole('button', { name: '预览' }))
  expect(screen.getByRole('dialog', { name: '画布图片预览' })).toBeVisible()
})

test('offers the exact eleven video media actions with visible disabled reasons', () => {
  render(
    <SelectionContextBar
      project={project}
      node={project.nodes[2]}
      onCreateToolNode={vi.fn()}
      onCreateVideoToolNode={vi.fn()}
      onSubmitVideoDraft={vi.fn()}
      onRotateImage={vi.fn()}
    />,
  )

  const toolbar = screen.getByRole('toolbar', { name: '视频媒体处理工具' })
  for (const label of [
    '剪辑',
    '片段重拍',
    '裁剪',
    '高清',
    '逐帧拉片',
    '智能续写',
    '智能去字幕',
    '音频分离',
    '画面编辑',
    '下载',
    '预览',
  ]) {
    expect(within(toolbar).getByRole('button', { name: label })).toBeVisible()
  }
  for (const label of ['智能去字幕', '音频分离', '画面编辑']) {
    const menuTrigger = within(toolbar).getByRole('button', { name: label })
    expect(menuTrigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(menuTrigger.querySelector('.lucide-chevron-down')).toBeInTheDocument()
  }
  for (const label of ['下载', '预览']) {
    expect(within(toolbar).getByRole('button', { name: label })).toHaveAttribute('data-compact', 'true')
  }
  expect(within(toolbar).getByRole('button', { name: '片段重拍' })).toBeDisabled()
  expect(within(toolbar).getByRole('button', { name: '智能续写' })).toBeDisabled()
  expect(screen.getByText(/当前仅支持时长不少于 4 秒/)).toBeVisible()
  expect(screen.getByText(/当前本地演示未配置续写模型能力/)).toBeVisible()
})

test('keeps clip and crop edits in node-local drafts until an explicit submit', async () => {
  const user = userEvent.setup()
  const onSubmitVideoDraft = vi.fn()
  render(
    <SelectionContextBar
      project={project}
      node={project.nodes[2]}
      onCreateToolNode={vi.fn()}
      onCreateVideoToolNode={vi.fn()}
      onSubmitVideoDraft={onSubmitVideoDraft}
      onRotateImage={vi.fn()}
    />,
  )

  await user.click(screen.getByRole('button', { name: '剪辑' }))
  const clip = screen.getByRole('dialog', { name: '剪辑内联编辑器' })
  expect(within(clip).getAllByRole('img', { name: /剪辑帧/ })).toHaveLength(12)
  expect(within(clip).getByRole('button', { name: '整数秒吸附' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  expect(within(clip).getByRole('button', { name: '选区循环播放' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await user.keyboard('{Escape}')
  expect(onSubmitVideoDraft).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: '裁剪' }))
  const crop = screen.getByRole('dialog', { name: '裁剪内联编辑器' })
  expect(within(crop).getAllByRole('button', { name: /裁剪控制点/ })).toHaveLength(8)
  expect(within(crop).getByText('1024 × 576')).toBeVisible()
  await user.keyboard('{Escape}')
  expect(onSubmitVideoDraft).not.toHaveBeenCalled()
})

test('confirms derived video nodes and exposes subtitle, audio, and picture-edit menus', async () => {
  const user = userEvent.setup()
  const onCreateVideoToolNode = vi.fn()
  render(
    <SelectionContextBar
      project={project}
      node={project.nodes[2]}
      onCreateToolNode={vi.fn()}
      onCreateVideoToolNode={onCreateVideoToolNode}
      onSubmitVideoDraft={vi.fn()}
      onRotateImage={vi.fn()}
    />,
  )

  await user.click(screen.getByRole('button', { name: '高清' }))
  const confirmation = screen.getByRole('alertdialog', {
    name: '添加视频高清工具节点',
  })
  expect(confirmation).toHaveTextContent('将添加工具节点')
  expect(onCreateVideoToolNode).not.toHaveBeenCalled()
  await user.click(within(confirmation).getByRole('button', { name: '确认添加' }))
  expect(onCreateVideoToolNode).toHaveBeenCalledWith('视频高清')

  await user.click(screen.getByRole('button', { name: '智能去字幕' }))
  const subtitle = screen.getByRole('menu', { name: '智能去字幕' })
  expect(within(subtitle).getByRole('menuitem', { name: '智能擦除' })).toBeVisible()
  expect(within(subtitle).getByRole('menuitem', { name: '框选擦除' })).toBeVisible()
  await user.keyboard('{Escape}')

  await user.click(screen.getByRole('button', { name: '音频分离' }))
  const audio = screen.getByRole('menu', { name: '音频分离' })
  expect(within(audio).getByRole('menuitem', { name: '人声分离' })).toBeDisabled()
  expect(within(audio).getByText('当前视频无音轨，无法使用人声分离')).toBeVisible()
  expect(within(audio).getByText('当前视频无音轨，无法分离音视频')).toBeVisible()
  await user.keyboard('{Escape}')

  await user.click(screen.getByRole('button', { name: '画面编辑' }))
  const picture = screen.getByRole('menu', { name: '画面编辑' })
  for (const label of ['主体消除', '主体修改', '主体替换', '智能抠像']) {
    expect(within(picture).getByRole('menuitem', { name: label })).toBeVisible()
  }
})

test('keeps subtitle, subject editing, and keying as escapable node-local drafts', async () => {
  const user = userEvent.setup()
  const onSubmitVideoDraft = vi.fn()
  render(
    <SelectionContextBar
      project={project}
      node={project.nodes[2]}
      onCreateToolNode={vi.fn()}
      onCreateVideoToolNode={vi.fn()}
      onSubmitVideoDraft={onSubmitVideoDraft}
      onRotateImage={vi.fn()}
    />,
  )

  await user.click(screen.getByRole('button', { name: '智能去字幕' }))
  await user.click(screen.getByRole('menuitem', { name: '框选擦除' }))
  const erase = screen.getByRole('dialog', { name: '框选擦除编辑器' })
  expect(within(erase).getByRole('button', { name: '提交框选擦除' })).toBeDisabled()
  expect(within(erase).getByText('请先框选字幕区域。')).toBeVisible()
  await user.click(within(erase).getByRole('button', { name: '框选区域' }))
  expect(within(erase).getByRole('button', { name: '提交框选擦除' })).toBeEnabled()
  await user.keyboard('{Escape}')
  expect(onSubmitVideoDraft).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: '画面编辑' }))
  await user.click(screen.getByRole('menuitem', { name: '主体消除' }))
  const subject = screen.getByRole('dialog', { name: '主体消除编辑器' })
  expect(within(subject).getByText('已选择主体 (0/4)')).toBeVisible()
  expect(within(subject).getByRole('toolbar', { name: '主体标注工具' })).toBeVisible()
  expect(within(subject).getByRole('button', { name: '确定' })).toBeDisabled()
  expect(within(subject).getByText('请先选择并标注主体。')).toBeVisible()
  await user.keyboard('{Escape}')

  await user.click(screen.getByRole('button', { name: '画面编辑' }))
  await user.click(screen.getByRole('menuitem', { name: '智能抠像' }))
  const keying = screen.getByRole('dialog', { name: '智能抠像编辑器' })
  expect(within(keying).getByText('预计成本 1')).toBeVisible()
  await user.keyboard('{Escape}')
  expect(onSubmitVideoDraft).not.toHaveBeenCalled()
})
