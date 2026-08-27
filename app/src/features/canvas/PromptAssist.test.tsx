import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'

import { PromptAssist } from './PromptAssist'

function Harness({
  initialPrompt = '',
  onImageSettings = vi.fn(),
  onCreateNode = vi.fn(),
  onApplyAutoLink = vi.fn(),
  onOpenAnalysisTool,
}: {
  initialPrompt?: string
  onImageSettings?: (settings: Record<string, unknown>) => void
  onCreateNode?: (kind: 'image' | 'storyboard' | 'video') => void
  onApplyAutoLink?: (candidate: { nodeId: string }) => void
  onOpenAnalysisTool?: (id: string, prompt?: string) => void
}) {
  const [prompt, setPrompt] = useState(initialPrompt)
  return (
    <div className="creative-node-composer">
      <textarea
        aria-label="测试提示词"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <PromptAssist
        context="image"
        prompt={prompt}
        autoLinkEnabled
        candidates={[
          { nodeId: 'role-1', title: '雨夜主角', kind: 'image', tags: ['人物', '雨夜'] },
        ]}
        linkedNodeIds={[]}
        onPromptChange={setPrompt}
        onImageSettings={onImageSettings}
        onCreateNode={onCreateNode}
        onApplyAutoLink={onApplyAutoLink as never}
        onOpenAnalysisTool={onOpenAnalysisTool}
      />
    </div>
  )
}

describe('prompt assist UI', () => {
  test('opens slash commands and executes a parameter command with the keyboard', async () => {
    const user = userEvent.setup()
    const onImageSettings = vi.fn()
    render(<Harness initialPrompt="海边 /" onImageSettings={onImageSettings} />)

    expect(screen.getByRole('dialog', { name: 'Slash 命令面板' })).toBeVisible()
    expect(screen.getByText('预设')).toBeVisible()
    expect(screen.getByText('工具命令')).toBeVisible()
    expect(screen.getByText('参数预览')).toBeVisible()

    const input = screen.getByRole('textbox', { name: '测试提示词' })
    await user.type(input, '竖屏')
    await user.keyboard('{Enter}')

    expect(input).toHaveValue('海边 竖屏电影构图，')
    expect(onImageSettings).toHaveBeenCalledWith({
      aspectRatio: '9:16',
      resolution: '2K',
      count: 1,
    })
    expect(screen.queryByRole('dialog', { name: 'Slash 命令面板' })).not.toBeInTheDocument()
  })

  test('executes tool commands and applies a local AutoLink candidate', async () => {
    const user = userEvent.setup()
    const onCreateNode = vi.fn()
    const onApplyAutoLink = vi.fn()
    const { unmount } = render(
      <Harness initialPrompt="/参考节点" onCreateNode={onCreateNode} />,
    )

    await user.click(screen.getByRole('option', { name: /插入参考图片节点/ }))
    expect(onCreateNode).toHaveBeenCalledWith('image')

    unmount()
    render(
      <Harness initialPrompt="让雨夜主角走入镜头" onApplyAutoLink={onApplyAutoLink} />,
    )
    expect(screen.getByLabelText('AutoLink 本地候选')).toBeVisible()
    await user.click(screen.getByRole('option', { name: /雨夜主角/ }))
    expect(onApplyAutoLink).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'role-1' }))
    expect(screen.getByRole('textbox', { name: '测试提示词' })).toHaveValue(
      '让雨夜主角走入镜头 @雨夜主角 ',
    )
  })

  test('closes slash commands with Escape without triggering canvas shortcuts', async () => {
    const user = userEvent.setup()
    render(<Harness initialPrompt="风景 /" />)
    const input = screen.getByRole('textbox', { name: '测试提示词' })
    input.focus()
    await user.keyboard('{Escape}')
    expect(input).toHaveValue('风景 ')
    expect(screen.queryByRole('dialog', { name: 'Slash 命令面板' })).not.toBeInTheDocument()
  })

  test('explains AI slash presets before copying their prompt into the image node', async () => {
    const user = userEvent.setup()
    render(<Harness initialPrompt="古城 /设定图" />)

    await user.click(screen.getByRole('option', { name: /角色与场景设定图预设/ }))
    const dialog = screen.getByRole('alertdialog', { name: '设定图生成功能待接入' })
    expect(dialog).toHaveTextContent('待接入设定图生成服务')
    expect(dialog).toHaveTextContent('预计成本 24 积分')
    await user.click(within(dialog).getByRole('button', { name: '复制提示词到图片节点' }))

    expect(
      (screen.getByRole('textbox', { name: '测试提示词' }) as HTMLTextAreaElement).value,
    ).toContain('角色设定图')
    expect(screen.getByRole('status')).toHaveTextContent('已复制提示词')
  })

  test('routes a supported slash preset to confirmation without dispatching or reopening slash', async () => {
    const user = userEvent.setup()
    const onOpenAnalysisTool = vi.fn()
    render(<Harness initialPrompt="古城 /九宫格" onOpenAnalysisTool={onOpenAnalysisTool} />)
    await user.click(screen.getByRole('option', { name: /九宫格分镜预设/ }))
    expect(onOpenAnalysisTool).toHaveBeenCalledWith('multi-camera-grid-api', '古城')
    expect(screen.getByRole('textbox', { name: '测试提示词' })).toHaveValue('古城')
    expect(screen.queryByRole('dialog', { name: 'Slash 命令面板' })).not.toBeInTheDocument()
  })

  test('optimizes the current prompt with deterministic local rules', async () => {
    const user = userEvent.setup()
    render(<Harness initialPrompt="清晨薄雾中的古桥" />)

    const optimize = screen.getByRole('button', { name: '本地优化提示词' })
    expect(optimize).toHaveTextContent('待接入')
    await user.click(optimize)

    expect(
      (screen.getByRole('textbox', { name: '测试提示词' }) as HTMLTextAreaElement).value,
    ).toContain('镜头：')
    expect(screen.getByRole('status')).toHaveTextContent('本地规则优化完成')
  })
})
