import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import { buildDemoWorks } from './demo-works'
import { CreationProcessPage } from './CreationProcessPage'

describe('read-only creation process', () => {
  test('groups nodes by time, toggles connections and copies the project', async () => {
    const user = userEvent.setup()
    const work = buildDemoWorks()[0]
    const projectRepository = { save: vi.fn().mockResolvedValue(undefined) }
    render(
      <MemoryRouter initialEntries={[`/detail/${work.id}/process`]}>
        <Routes>
          <Route
            path="/detail/:workId/process"
            element={
              <CreationProcessPage
                communityRepository={{ get: vi.fn().mockResolvedValue(work) }}
                projectRepository={projectRepository}
                environment={{
                  now: () => '2026-08-13T12:00:00.000Z',
                  randomId: () => 'copied-project',
                }}
              />
            }
          />
          <Route path="/project/:projectId" element={<h1>项目画布</h1>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '霜河渡 · 创作过程' })).toBeVisible()
    expect(screen.getByText('只读模式；复制会在当前浏览器创建一个新项目')).toBeVisible()
    const timeline = screen.getByRole('region', { name: '时间分组节点列表' })
    expect(within(timeline).getAllByRole('article').length).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: '依赖连线' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '隐藏连线' }))
    expect(screen.queryByRole('region', { name: '依赖连线' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '显示连线' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '复制项目' }))
    expect(projectRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'copied-project',
      title: '霜河渡 副本',
    }))
    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
  })
})
