import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import type { Project } from '../project/model'
import { useProjectStore } from '../project/project-store'
import { DiscoverPage } from './DiscoverPage'

function makeExampleRepository() {
  const projects = new Map<string, Project>()
  return {
    save: vi.fn(async (project: Project) => {
      projects.set(project.id, project)
    }),
    load: vi.fn(async (projectId: string) => projects.get(projectId)),
  }
}

function renderDiscover(repository = makeExampleRepository()) {
  const view = render(
    <MemoryRouter initialEntries={['/discover']}>
      <Routes>
        <Route path="/discover" element={<DiscoverPage repository={repository} />} />
        <Route path="/project/:projectId" element={<h1>项目画布</h1>} />
      </Routes>
    </MemoryRouter>,
  )
  return { repository, ...view }
}

afterEach(() => {
  vi.restoreAllMocks()
  useProjectStore.setState({
    projectsById: {},
    activeProjectId: undefined,
    activeProject: undefined,
    saveStatus: 'saved',
    past: [],
    future: [],
  })
})

test('persists and opens the example only after user action', async () => {
  const user = userEvent.setup()
  const { repository } = renderDiscover()

  expect(repository.save).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: '打开示例项目' }))

  expect(repository.save).toHaveBeenCalledTimes(1)
  expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
})
