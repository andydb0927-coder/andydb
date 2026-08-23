import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { AgentSkillRegistry, type AgentSkillDefinition } from './agent-skill'
import { AgentsPage } from './AgentsPage'

function setup() {
  const project = makeProjectFixture()
  const repository = {
    listRecent: vi.fn().mockResolvedValue([project]),
    save: vi.fn().mockResolvedValue(undefined),
  }
  const timelineRepository = { load: vi.fn().mockResolvedValue(undefined) }
  const disabled = new Set<string>()
  const enablementStore = {
    isEnabled: (id: string) => !disabled.has(id),
    setEnabled: vi.fn((id: string, enabled: boolean) => {
      if (enabled) disabled.delete(id)
      else disabled.add(id)
    }),
  }
  const workspaceClient = {
    loadManifest: vi.fn().mockResolvedValue({
      namespace: 'wireless-canvas.workspace',
      commands: [
        { id: 'workspace.project.export', description: '导出无线画布项目 JSON' },
      ],
    }),
  }
  render(
    <MemoryRouter>
      <AgentsPage
        repository={repository}
        timelineRepository={timelineRepository}
        enablementStore={enablementStore}
        workspaceClient={workspaceClient}
        environment={{ now: () => '2026-08-13T10:00:00.000Z', randomId: () => 'result-node' }}
      />
    </MemoryRouter>,
  )
  return { project, repository, enablementStore, workspaceClient }
}

describe('Agents page', () => {
  test('adds the Liblib model and generation-mode selectors to the Skill input area', async () => {
    const user = userEvent.setup()
    setup()

    const model = await screen.findByRole('combobox', { name: '选择模型' })
    const mode = screen.getByRole('combobox', { name: '生成模式' })
    expect(model).toHaveValue('seedance-2.5')
    expect(mode).toHaveValue('smart')
    await user.selectOptions(model, 'minimax-h3')
    await user.selectOptions(mode, 'precise')
    expect(model).toHaveValue('minimax-h3')
    expect(mode).toHaveValue('precise')
  })

  test('shows Liblib-style Skill cards and filters them by category and search', async () => {
    const user = userEvent.setup()
    setup()

    const cards = await screen.findAllByRole('article')
    expect(cards).toHaveLength(5)
    const storyboard = screen.getByRole('article', { name: '批量生成分镜提示词' })
    expect(within(storyboard).getByRole('img', { name: '批量生成分镜提示词封面' })).toBeVisible()
    expect(within(storyboard).getByText('无线导演')).toBeVisible()
    expect(within(storyboard).getByText('1.8K 次使用')).toBeVisible()
    expect(within(storyboard).getByRole('button', { name: '使用批量生成分镜提示词' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Skill 运行面板' })).not.toBeInTheDocument()

    const filters = screen.getByRole('region', { name: 'Skill 分类与搜索' })
    expect(within(filters).getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(filters).getByRole('button', { name: '专业影视' })).toBeVisible()
    expect(within(filters).getByRole('button', { name: '商业广告' })).toBeVisible()

    await user.type(within(filters).getByRole('searchbox', { name: '搜索 Skill' }), '发布文案')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('article', { name: '作品发布文案生成' })).toBeVisible()

    await user.clear(within(filters).getByRole('searchbox', { name: '搜索 Skill' }))
    await user.click(within(filters).getByRole('button', { name: '通用技能' }))
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(screen.getByRole('article', { name: '素材整理报告' })).toBeVisible()
    expect(screen.getByRole('article', { name: '时间线时长统计' })).toBeVisible()
    expect(screen.getByRole('article', { name: '项目备份检查' })).toBeVisible()
  })

  test('orders the instruction box, local browse tabs, and catalog tools without faking remote data', async () => {
    const user = userEvent.setup()
    setup()

    const instruction = screen.getByRole('region', { name: 'Skill 创作输入' })
    const tabs = screen.getByRole('tablist', { name: 'Skill 浏览范围' })
    const tools = screen.getByRole('region', { name: 'Skill 分类与搜索' })
    expect(instruction.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tabs.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const assetCard = await screen.findByRole('article', { name: '素材整理报告' })
    await user.click(within(assetCard).getByRole('checkbox', { name: '启用素材整理报告' }))
    await user.click(within(tabs).getByRole('tab', { name: '收藏' }))
    expect(screen.getByText('“收藏”映射为当前设备已启用的 Skill。')).toBeVisible()
    expect(screen.queryByRole('article', { name: '素材整理报告' })).not.toBeInTheDocument()

    await user.click(within(tabs).getByRole('tab', { name: '我的' }))
    expect(screen.getByText('“我的”映射为本地工作区已注册的 Skill。')).toBeVisible()
    expect(screen.getAllByRole('article')).toHaveLength(5)
  })

  test('selects a compact card and focuses its independent run panel', async () => {
    const user = userEvent.setup()
    setup()

    const card = await screen.findByRole('article', { name: '素材整理报告' })
    await user.click(within(card).getByRole('button', { name: '使用素材整理报告' }))

    const runner = screen.getByRole('region', { name: 'Skill 运行面板' })
    expect(within(runner).getByRole('heading', { name: '素材整理报告' })).toBeVisible()
    expect(within(runner).getByText('此 Skill 无需额外参数。')).toBeVisible()
    await waitFor(() => expect(runner).toHaveFocus())
  })

  test('browses five local skills and persists enable/disable controls', async () => {
    const user = userEvent.setup()
    const { enablementStore } = setup()

    expect(await screen.findAllByRole('article')).toHaveLength(5)
    const card = screen.getByRole('article', { name: '素材整理报告' })
    const toggle = within(card).getByRole('checkbox', { name: '启用素材整理报告' })
    expect(toggle).toBeChecked()
    await user.click(toggle)
    expect(enablementStore.setEnabled).toHaveBeenCalledWith('assets.organize-report', false)
    await user.click(within(card).getByRole('button', { name: '使用素材整理报告' }))
    expect(within(screen.getByRole('region', { name: 'Skill 运行面板' })).getByRole('button', { name: '运行技能' })).toBeDisabled()
  })

  test('executes a skill, displays a result card and writes it into a canvas node', async () => {
    const user = userEvent.setup()
    const { project, repository } = setup()

    const card = await screen.findByRole('article', { name: '批量生成分镜提示词' })
    await user.click(within(card).getByRole('button', { name: '使用批量生成分镜提示词' }))
    const runner = screen.getByRole('region', { name: 'Skill 运行面板' })
    await user.clear(within(runner).getByLabelText('镜头数量'))
    await user.type(within(runner).getByLabelText('镜头数量'), '2')
    await user.click(within(runner).getByRole('button', { name: '运行技能' }))

    const result = await screen.findByRole('region', { name: '技能执行结果' })
    expect(within(result).getByText(/已生成 2 条/)).toBeVisible()
    await user.click(within(result).getByRole('button', { name: '写入画布节点' }))

    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))
    const saved = repository.save.mock.calls[0]![0]
    expect(saved.id).toBe(project.id)
    expect(saved.nodes.at(-1)).toMatchObject({ id: 'result-node', kind: 'text' })
    expect(await screen.findByText('结果已写入画布文本节点')).toBeVisible()
    expect(within(result).getByRole('button', { name: '已写入画布' })).toBeDisabled()
    expect(repository.save).toHaveBeenCalledTimes(1)
  })

  test('shows the same-origin workspace CLI manifest without executing a command', async () => {
    const { workspaceClient } = setup()

    const panel = await screen.findByRole('region', { name: '本地工作区 CLI' })
    expect(panel).toHaveAttribute('id', 'workspace-bridge')
    expect(within(panel).getByText('CLI 桥接已连接')).toBeVisible()
    expect(within(panel).getByText('workspace.project.export')).toBeVisible()
    expect(workspaceClient.loadManifest).toHaveBeenCalledTimes(1)
  })

  test('cancels one asynchronous skill and blocks cross-skill duplicate execution', async () => {
    const project = makeProjectFixture()
    const repository = { listRecent: vi.fn().mockResolvedValue([project]), save: vi.fn() }
    let resolveSlow!: (value: { title: string; summary: string; content: string; format: 'text' }) => void
    const slow: AgentSkillDefinition = {
      id: 'test.slow', version: 1, name: '慢速技能', description: '异步测试', category: 'maintenance', outputMode: 'card-or-node',
      inputSchema: { type: 'object', properties: {} },
      execute: () => new Promise((resolve) => { resolveSlow = resolve }),
    }
    const other: AgentSkillDefinition = {
      ...slow,
      id: 'test.other',
      name: '其他技能',
      execute: () => ({ title: '其他', summary: '其他', content: '其他', format: 'text' }),
    }
    const runtime = { definitions: [slow, other], registry: new AgentSkillRegistry([slow, other]) }
    render(
      <MemoryRouter>
        <AgentsPage
          repository={repository}
          timelineRepository={{ load: vi.fn().mockResolvedValue(undefined) }}
          enablementStore={{ isEnabled: () => true, setEnabled: vi.fn() }}
          runtime={runtime}
          workspaceClient={{ loadManifest: vi.fn().mockRejectedValue(new Error('PRIVATE network')) }}
        />
      </MemoryRouter>,
    )

    const slowCard = await screen.findByRole('article', { name: '慢速技能' })
    const otherCard = screen.getByRole('article', { name: '其他技能' })
    await userEvent.click(within(slowCard).getByRole('button', { name: '使用慢速技能' }))
    const runner = screen.getByRole('region', { name: 'Skill 运行面板' })
    await userEvent.click(within(runner).getByRole('button', { name: '运行技能' }))
    expect(within(otherCard).getByRole('button', { name: '使用其他技能' })).toBeDisabled()
    await userEvent.click(within(runner).getByRole('button', { name: '取消执行' }))
    resolveSlow({ title: '过期', summary: '过期', content: '过期', format: 'text' })

    expect(await screen.findByText('技能执行已取消')).toBeVisible()
    expect(screen.queryByRole('region', { name: '技能执行结果' })).not.toBeInTheDocument()
    const cliPanel = await screen.findByRole('region', { name: '本地工作区 CLI' })
    expect(within(cliPanel).getByText('当前构建未启用本地 CLI 桥接')).toBeVisible()
    expect(cliPanel).not.toHaveTextContent('PRIVATE')
  })
})
