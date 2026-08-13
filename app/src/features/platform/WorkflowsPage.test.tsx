import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import type { Project } from '../project/model'
import { buildWorkflowRun, type WorkflowRun } from '../workflow/workflow-model'
import { WorkflowsPage } from './WorkflowsPage'

function runFixture() {
  const project = makeProjectFixture()
  const run = buildWorkflowRun(
    project,
    ['shot-1'],
    'parallel',
    {
      now: () => '2026-08-13T10:00:00.000Z',
      randomId: (() => {
        let value = 0
        return () => `workflow-${++value}`
      })(),
    },
  )
  return {
    project,
    run: {
      ...run,
      id: 'run-failed',
      status: 'failed' as const,
      updatedAt: '2026-08-13T10:03:00.000Z',
      nodes: run.nodes.map((node) => ({
        ...node,
        status: 'failed' as const,
        progress: 40,
        error: '临时失败',
      })),
    },
  }
}

function renderPage(options?: {
  projects?: Project[]
  runs?: WorkflowRun[]
  reject?: boolean
}) {
  const fixture = runFixture()
  const projectList = options?.projects ?? [fixture.project]
  const runs = options?.runs ?? [fixture.run]
  const projectRepository = {
    listAll: options?.reject
      ? vi.fn().mockRejectedValue(new Error('PRIVATE project path'))
      : vi.fn().mockResolvedValue(projectList),
  }
  const workflowRepository = {
    listAll: options?.reject
      ? vi.fn().mockRejectedValue(new Error('PRIVATE workflow details'))
      : vi.fn().mockResolvedValue(runs),
  }
  const view = render(
    <MemoryRouter>
      <WorkflowsPage
        projectRepository={projectRepository}
        workflowRepository={workflowRepository}
      />
    </MemoryRouter>,
  )
  return { ...view, fixture, projectRepository, workflowRepository }
}

describe('WorkflowsPage', () => {
  test('shows an accessible task graph and routes every recipe to the launcher', async () => {
    renderPage({ runs: [] })

    expect(
      screen.getByRole('link', { name: '使用品牌氛围片' }),
    ).toHaveAttribute('href', '/?recipe=brand-atmosphere')
    const graphs = screen.getAllByRole('list', { name: /任务图/ })
    expect(graphs).toHaveLength(3)
    expect(within(graphs[0]).getAllByRole('listitem')).toHaveLength(3)
    expect(within(graphs[0]).getByText('角色参考')).toBeVisible()
    expect(within(graphs[0]).getByText('场景设定')).toBeVisible()
    expect(within(graphs[0]).getByText('首个分镜')).toBeVisible()
    expect(await screen.findByText('暂无运行记录')).toBeVisible()
  })

  test('aggregates project runs with progress and a source-canvas link', async () => {
    const { fixture, projectRepository, workflowRepository } = renderPage()

    const article = await screen.findByRole('article', { name: '运行 run-failed' })
    expect(projectRepository.listAll).toHaveBeenCalledTimes(1)
    expect(workflowRepository.listAll).toHaveBeenCalledTimes(1)
    expect(within(article).getByText(fixture.project.title)).toBeVisible()
    expect(within(article).getByText('已失败')).toBeVisible()
    expect(within(article).getByText('并行 · 1 个节点')).toBeVisible()
    expect(within(article).getByRole('progressbar')).toHaveAttribute('value', '40')
    expect(within(article).getByRole('link', { name: '打开项目处理运行' })).toHaveAttribute(
      'href',
      `/project/${fixture.project.id}`,
    )
  })

  test('filters runs without mutating repository data', async () => {
    const user = userEvent.setup()
    const fixture = runFixture()
    const succeeded = {
      ...fixture.run,
      id: 'run-succeeded',
      status: 'succeeded' as const,
      updatedAt: '2026-08-13T11:00:00.000Z',
      nodes: fixture.run.nodes.map((node) => ({
        ...node,
        status: 'succeeded' as const,
        progress: 100,
        error: undefined,
      })),
    }
    renderPage({ runs: [succeeded, fixture.run] })
    await screen.findByRole('article', { name: '运行 run-succeeded' })

    await user.click(screen.getByRole('radio', { name: '失败' }))
    expect(screen.getByRole('article', { name: '运行 run-failed' })).toBeVisible()
    expect(screen.queryByRole('article', { name: '运行 run-succeeded' })).not.toBeInTheDocument()
    expect(fixture.run.status).toBe('failed')

    await user.click(screen.getByRole('radio', { name: '运行中' }))
    expect(screen.getByText('没有匹配的运行')).toBeVisible()
  })

  test('shows a fixed load error without leaking repository details', async () => {
    renderPage({ reject: true })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('无法读取运行记录')
    expect(alert).not.toHaveTextContent('PRIVATE')
  })
})
