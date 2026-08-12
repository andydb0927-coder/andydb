import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { buildWorkflowRun, type WorkflowRun } from './workflow-model'
import { WorkflowRunPanel } from './WorkflowRunPanel'

function makeRun(): WorkflowRun {
  const project = makeProjectFixture()
  const run = buildWorkflowRun(project, ['shot-1'], 'serial', {
    now: () => '2026-08-13T08:00:00.000Z',
    randomId: (() => {
      const ids = ['run-1', 'task-1']
      return () => ids.shift()!
    })(),
  })
  return {
    ...run,
    status: 'running',
    nodes: run.nodes.map((node) => ({
      ...node,
      status: 'running',
      progress: 55,
      attempt: 2,
    })),
    logs: [
      ...run.logs,
      {
        id: 'log-started',
        timestamp: '2026-08-13T08:00:01.000Z',
        level: 'info',
        message: '节点开始执行',
        nodeRunId: 'task-1',
      },
    ],
  }
}

describe('workflow run panel', () => {
  test('creates a run with the selected serial or parallel mode', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    const { rerender } = render(
      <WorkflowRunPanel
        selectedCount={0}
        runs={[]}
        onCreate={onCreate}
        onCancel={vi.fn()}
        onRetryNode={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '创建运行' })).toBeDisabled()

    rerender(
      <WorkflowRunPanel
        selectedCount={3}
        runs={[]}
        onCreate={onCreate}
        onCancel={vi.fn()}
        onRetryNode={vi.fn()}
      />,
    )
    expect(screen.getByText('已选 3 个可执行节点')).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: '执行模式' }), 'parallel')
    await user.click(screen.getByRole('button', { name: '创建运行' }))

    expect(onCreate).toHaveBeenCalledWith('parallel')
  })

  test('shows overall and per-node progress, attempts, logs, and cancellation', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <WorkflowRunPanel
        selectedCount={1}
        runs={[makeRun()]}
        onCreate={vi.fn()}
        onCancel={onCancel}
        onRetryNode={vi.fn()}
      />,
    )

    const run = screen.getByRole('article', { name: '运行 run-1' })
    expect(within(run).getByText('运行中')).toBeInTheDocument()
    expect(within(run).getByText('串行 · 55%')).toBeInTheDocument()
    expect(within(run).getByText(/第 2 次/)).toBeInTheDocument()
    expect(within(run).getByRole('progressbar', { name: '河岸寻人进度' })).toHaveValue(55)
    await user.click(within(run).getByText('运行日志'))
    expect(within(run).getByText('节点开始执行')).toBeInTheDocument()
    await user.click(within(run).getByRole('button', { name: '取消运行' }))

    expect(onCancel).toHaveBeenCalledWith('run-1')
  })

  test('offers retry only for failed nodes and sorts newest runs first', async () => {
    const user = userEvent.setup()
    const onRetryNode = vi.fn()
    const running = makeRun()
    const failed: WorkflowRun = {
      ...running,
      id: 'run-newer',
      status: 'failed',
      updatedAt: '2026-08-13T09:00:00.000Z',
      nodes: running.nodes.map((node) => ({
        ...node,
        id: 'task-failed',
        status: 'failed',
        error: '本地演示失败',
      })),
    }
    render(
      <WorkflowRunPanel
        selectedCount={0}
        runs={[running, failed]}
        onCreate={vi.fn()}
        onCancel={vi.fn()}
        onRetryNode={onRetryNode}
      />,
    )

    const articles = screen.getAllByRole('article')
    expect(articles[0]).toHaveAccessibleName('运行 run-newer')
    expect(within(articles[0]).getByText('本地演示失败')).toBeInTheDocument()
    expect(within(articles[1]).queryByRole('button', { name: '重试河岸寻人' })).not.toBeInTheDocument()

    await user.click(within(articles[0]).getByRole('button', { name: '重试河岸寻人' }))
    expect(onRetryNode).toHaveBeenCalledWith('run-newer', 'task-failed')
  })
})
