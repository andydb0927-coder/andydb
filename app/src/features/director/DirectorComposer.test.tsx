import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { DirectorComposer } from './DirectorComposer'

function renderComposer() {
  const onExecute = vi.fn()
  const view = render(
    <MemoryRouter>
      <DirectorComposer
        selectedNodeId="storyboard-01"
        projectTitle="雨夜重逢"
        selectedNodeTitle="分镜 01"
        assetNames={['角色参考', '雨夜街景']}
        onExecute={onExecute}
      />
    </MemoryRouter>,
  )
  return { ...view, onExecute }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('complete canvas Agent workspace', () => {
  test('exposes the conversation toolbar, recommendations, notification, and local-only disclosure', async () => {
    const user = userEvent.setup()
    renderComposer()

    const toolbar = screen.getByRole('toolbar', { name: 'Agent 对话工具' })
    for (const name of ['新对话', '历史', '分享', '设置', 'CLI 与 Skill']) {
      expect(within(toolbar).getByRole('button', { name })).toBeVisible()
    }
    expect(within(toolbar).getByRole('button', { name: '分享' })).toBeDisabled()
    expect(screen.getByRole('region', { name: '推荐 Skill' })).toHaveTextContent('批量生成分镜提示词')
    await user.click(screen.getByRole('button', { name: '刷新' }))
    expect(screen.getByRole('region', { name: '推荐 Skill' })).toHaveTextContent('时间线时长统计')
    expect(screen.getByRole('status')).toHaveTextContent('本地演示')

    await user.click(within(toolbar).getByRole('button', { name: '历史' }))
    expect(screen.getByRole('region', { name: '对话历史' })).toHaveTextContent('当前画布诊断')

    await user.type(screen.getByLabelText('告诉我下一步要做什么'), '分享这次对话')
    await user.click(within(toolbar).getByRole('button', { name: '分享' }))
    expect(screen.getByLabelText('本地分享链接')).toHaveValue('local://agent/雨夜重逢')

    await user.click(within(toolbar).getByRole('button', { name: 'CLI 与 Skill' }))
    expect(screen.getByRole('region', { name: 'CLI 与 Skill' })).toHaveTextContent('libtv canvas inspect --local')

    await user.click(within(toolbar).getByRole('button', { name: '新对话' }))
    expect(screen.getByLabelText('告诉我下一步要做什么')).toHaveValue('')
    expect(within(toolbar).getByRole('button', { name: '分享' })).toBeDisabled()
  })

  test('reads independent image and video model choices from ProviderRegistry', () => {
    renderComposer()

    const imageModel = screen.getByRole('combobox', { name: '图片模型' })
    const videoModel = screen.getByRole('combobox', { name: '视频模型' })
    expect(within(imageModel).getByRole('option', { name: /MJ 风格图片/ })).toBeVisible()
    expect(within(videoModel).getByRole('option', { name: /可灵风格视频/ })).toBeVisible()
    expect(within(videoModel).getByRole('option', { name: /Seedance 风格视频/ })).toBeVisible()
    expect(within(videoModel).getByRole('option', { name: /Kling 官方 API/ })).toBeDisabled()
    expect(screen.getByText('模型选择只保存到本机，不会发起第三方请求。')).toBeVisible()
  })

  test('inserts workflow, node, and resource mentions and manages local attachments', async () => {
    const user = userEvent.setup()
    renderComposer()

    await user.click(screen.getByRole('button', { name: '添加 @ 引用' }))
    const references = screen.getByRole('menu', { name: '可引用的画布上下文' })
    await user.click(within(references).getByRole('menuitem', { name: '引用工作流 雨夜重逢' }))
    await user.click(screen.getByRole('button', { name: '添加 @ 引用' }))
    await user.click(within(screen.getByRole('menu', { name: '可引用的画布上下文' })).getByRole('menuitem', { name: '引用节点 分镜 01' }))
    await user.click(screen.getByRole('button', { name: '添加 @ 引用' }))
    await user.click(within(screen.getByRole('menu', { name: '可引用的画布上下文' })).getByRole('menuitem', { name: '引用资源 角色参考' }))

    expect(screen.getByLabelText('告诉我下一步要做什么')).toHaveValue(
      '@工作流:雨夜重逢 @节点:分镜 01 @资源:角色参考 ',
    )

    await user.upload(screen.getByLabelText('上传附件'), new File(['demo'], 'brief.txt', { type: 'text/plain' }))
    expect(screen.getByRole('list', { name: '已添加附件' })).toHaveTextContent('brief.txt')

    await user.click(screen.getByRole('button', { name: '从资产库添加' }))
    await user.click(screen.getByRole('option', { name: '雨夜街景' }))
    expect(screen.getByRole('list', { name: '已添加附件' })).toHaveTextContent('雨夜街景')
  })

  test('provides the complete Skill selector with filtering, details, favorites, selection, and local creation', async () => {
    const user = userEvent.setup()
    renderComposer()
    await user.click(screen.getByRole('button', { name: '选择 Skill' }))
    const dialog = screen.getByRole('dialog', { name: 'Skill 选择器' })

    for (const tab of ['创建', '全部', '通用', '收藏', '我的']) {
      expect(within(dialog).getByRole('tab', { name: tab })).toBeVisible()
    }
    await user.type(within(dialog).getByRole('searchbox', { name: '搜索 Skill' }), '分镜')
    expect(within(dialog).getByText('批量生成分镜提示词')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: '查看批量生成分镜提示词详情' }))
    expect(within(dialog).getByRole('region', { name: 'Skill 详情' })).toHaveTextContent('根据项目意图')
    await user.click(within(dialog).getByRole('button', { name: '收藏此 Skill' }))
    await user.click(within(dialog).getByRole('button', { name: '使用此 Skill' }))
    expect(screen.getByRole('status')).toHaveTextContent('已选择 Skill：批量生成分镜提示词')

    await user.click(screen.getByRole('button', { name: '选择 Skill' }))
    await user.click(screen.getByRole('tab', { name: '创建' }))
    await user.type(screen.getByLabelText('Skill 名称'), '我的镜头检查')
    await user.type(screen.getByLabelText('Skill 描述'), '检查镜头连续性')
    await user.click(screen.getByRole('button', { name: '保存为本地 Skill' }))
    expect(screen.getByRole('status')).toHaveTextContent('已选择 Skill：我的镜头检查')
  })

  test('persists generation mode and settings while preserving the Director safety flow', async () => {
    const user = userEvent.setup()
    const first = renderComposer()

    await user.click(screen.getByRole('radio', { name: '自动' }))
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('checkbox', { name: '自动生成' }))
    await user.click(screen.getByRole('checkbox', { name: '浏览器通知' }))
    await user.click(screen.getByRole('checkbox', { name: '提示音' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '视频模型' }), 'mock-seedance-video')
    first.unmount()

    const second = renderComposer()
    expect(screen.getByRole('radio', { name: '自动' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: '设置' }))
    expect(screen.getByRole('checkbox', { name: '自动生成' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '浏览器通知' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '提示音' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: '视频模型' })).toHaveValue('mock-seedance-video')

    const input = screen.getByLabelText('告诉我下一步要做什么')
    await user.type(input, '删除这个节点')
    await user.click(screen.getByRole('button', { name: '提交给 AI 导演' }))
    expect(screen.getByText('删除所选节点；相关下游内容会标记为来源已变更。')).toBeVisible()
    expect(second.onExecute).not.toHaveBeenCalled()
  })
})
