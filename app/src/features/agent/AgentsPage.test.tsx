import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
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
  render(
    <MemoryRouter>
      <AgentsPage
        repository={repository}
        timelineRepository={timelineRepository}
        enablementStore={enablementStore}
        environment={{ now: () => '2026-08-13T10:00:00.000Z', randomId: () => 'result-node' }}
      />
    </MemoryRouter>,
  )
  return { project, repository, enablementStore }
}

describe('Agents page', () => {
  test('browses five local skills and persists enable/disable controls', async () => {
    const user = userEvent.setup()
    const { enablementStore } = setup()

    expect(await screen.findAllByRole('article')).toHaveLength(5)
    const card = screen.getByRole('article', { name: '素材整理报告' })
    const toggle = within(card).getByRole('checkbox', { name: '启用素材整理报告' })
    expect(toggle).toBeChecked()
    await user.click(toggle)
    expect(enablementStore.setEnabled).toHaveBeenCalledWith('assets.organize-report', false)
    expect(within(card).getByRole('button', { name: '运行技能' })).toBeDisabled()
  })

  test('executes a skill, displays a result card and writes it into a canvas node', async () => {
    const user = userEvent.setup()
    const { project, repository } = setup()

    const card = await screen.findByRole('article', { name: '批量生成分镜提示词' })
    await user.clear(within(card).getByLabelText('镜头数量'))
    await user.type(within(card).getByLabelText('镜头数量'), '2')
    await user.click(within(card).getByRole('button', { name: '运行技能' }))

    const result = await screen.findByRole('region', { name: '技能执行结果' })
    expect(within(result).getByText(/已生成 2 条/)).toBeVisible()
    await user.click(within(result).getByRole('button', { name: '写入画布节点' }))

    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))
    const saved = repository.save.mock.calls[0]![0]
    expect(saved.id).toBe(project.id)
    expect(saved.nodes.at(-1)).toMatchObject({ id: 'result-node', kind: 'text' })
    expect(await screen.findByText('结果已写入画布文本节点')).toBeVisible()
  })
})
