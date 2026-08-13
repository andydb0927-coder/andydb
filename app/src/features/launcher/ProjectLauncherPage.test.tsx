import { StrictMode } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  RouterProvider,
  createMemoryRouter,
  type RouteObject,
} from 'react-router-dom'

import type { Project } from '../project/model'
import { useProjectStore } from '../project/project-store'
import { makeProjectFixture } from '../../test/fixtures'
import { buildDemoWorks } from '../community/demo-works'
import { buildHomeContentSeed } from '../home/home-content'
import { ProjectLauncherPage } from './ProjectLauncherPage'

function makeRepository(recent: Project[] = []) {
  const projects = new Map(recent.map((project) => [project.id, project]))
  return {
    projects,
    save: vi.fn(async (project: Project) => {
      projects.set(project.id, project)
    }),
    load: vi.fn(async (projectId: string) => projects.get(projectId)),
    listRecent: vi.fn(async () => recent),
  }
}

function makeHomeContentRepository() {
  return {
    ensureSeed: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue(buildHomeContentSeed()),
  }
}

function makeCommunityRepository() {
  return {
    ensureDemoWorks: vi.fn().mockResolvedValue(true),
    listPublished: vi.fn().mockResolvedValue(buildDemoWorks()),
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function renderLauncher({
  repository = makeRepository(),
  strictMode = false,
  homeContentRepository = makeHomeContentRepository(),
  communityRepository = makeCommunityRepository(),
}: {
  repository?: ReturnType<typeof makeRepository>
  strictMode?: boolean
  homeContentRepository?: ReturnType<typeof makeHomeContentRepository>
  communityRepository?: ReturnType<typeof makeCommunityRepository>
} = {}) {
  const routes: RouteObject[] = [
    {
      path: '/',
      element: (
        <ProjectLauncherPage
          repository={repository}
          homeContentRepository={homeContentRepository}
          communityRepository={communityRepository}
        />
      ),
    },
    {
      path: '/project/:projectId',
      element: <main><h1>项目画布</h1></main>,
    },
  ]
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })
  const provider = <RouterProvider router={router} />
  const view = render(strictMode ? <StrictMode>{provider}</StrictMode> : provider)
  return { repository, router, ...view }
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

describe('project launcher', () => {
  test('does not duplicate the shell-owned account actions inside the home page', () => {
    renderLauncher()
    expect(screen.queryByRole('navigation', { name: '首页账户入口' })).not.toBeInTheDocument()
  })

  test('keeps the home flow compact without the legacy project form', async () => {
    renderLauncher()
    expect(await screen.findByRole('link', { name: '新建画布创作' })).toHaveAttribute('href', '/projects/new')
    expect(document.querySelector('#create-project')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('描述你想创作的短片')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '创建项目' })).not.toBeInTheDocument()
  })

  test('opens a locally seeded mode with its canvas hint persisted', async () => {
    const user = userEvent.setup()
    const { repository } = renderLauncher()
    await user.click(await screen.findByRole('button', { name: /逐帧拉片/ }))
    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(repository.save.mock.calls[0][0]).toMatchObject({
      title: '逐帧拉片',
      intent: expect.stringContaining('逐帧拉片模式'),
    })
  })

  test('shows one complete clickable example when there are no recent projects', async () => {
    renderLauncher()
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })
    expect(within(recentRegion).getByRole('link', { name: /霜河渡.*雨夜河岸.*3 个创作节点/ })).toHaveAttribute('href', '/project/project-frost-river')
    expect(within(recentRegion).getAllByRole('link')).toHaveLength(2)
  })

  test('loads recent projects after StrictMode replays mount effects', async () => {
    const repository = makeRepository()
    renderLauncher({ repository, strictMode: true })
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })
    expect(await within(recentRegion).findByRole('link', { name: /完整示例/ })).toBeVisible()
    expect(repository.listRecent).toHaveBeenCalledTimes(2)
  })

  test('shows an honest recent-project error and retries the list operation', async () => {
    const user = userEvent.setup()
    const repository = makeRepository()
    repository.listRecent.mockRejectedValueOnce(new Error('无法读取项目')).mockResolvedValueOnce([])
    renderLauncher({ repository })
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })
    expect(within(recentRegion).getByRole('alert')).toHaveTextContent('无法读取最近项目')
    await user.click(within(recentRegion).getByRole('button', { name: '重试加载最近项目' }))
    expect(await within(recentRegion).findByRole('link', { name: /完整示例/ })).toBeVisible()
  })

  test('starts only one recent-list retry when activated twice rapidly', async () => {
    const retryDeferred = createDeferred<Project[]>()
    const repository = makeRepository()
    repository.listRecent.mockRejectedValueOnce(new Error('无法读取项目')).mockImplementationOnce(() => retryDeferred.promise)
    renderLauncher({ repository })
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })
    const retry = within(recentRegion).getByRole('button', { name: '重试加载最近项目' })
    act(() => {
      retry.click()
      retry.click()
    })
    expect(repository.listRecent).toHaveBeenCalledTimes(2)
    retryDeferred.resolve([])
    expect(await within(recentRegion).findByRole('link', { name: /完整示例/ })).toBeVisible()
  })

  test('persists and activates the complete example before opening its canvas', async () => {
    const user = userEvent.setup()
    const { repository } = renderLauncher()
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })
    await user.click(within(recentRegion).getByRole('link', { name: /霜河渡/ }))
    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(useProjectStore.getState().activeProjectId).toBe('project-frost-river')
  })

  test('persists the complete example only once when activated twice rapidly', async () => {
    const saveDeferred = createDeferred<void>()
    const repository = makeRepository()
    repository.save.mockImplementation(async (project) => {
      repository.projects.set(project.id, project)
      await saveDeferred.promise
    })
    renderLauncher({ repository })
    const example = within(await screen.findByRole('region', { name: '最近项目' })).getByRole('link', { name: /完整示例/ })
    act(() => {
      example.click()
      example.click()
    })
    expect(repository.save).toHaveBeenCalledTimes(1)
    saveDeferred.resolve(undefined)
    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
  })

  test('hydrates a recent project before opening its canvas', async () => {
    const user = userEvent.setup()
    const recentProject = makeProjectFixture()
    const repository = makeRepository([recentProject])
    renderLauncher({ repository })
    await user.click(within(await screen.findByRole('region', { name: '最近项目' })).getByRole('link', { name: /霜河渡/ }))
    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    expect(repository.save).not.toHaveBeenCalled()
    expect(useProjectStore.getState().activeProject).toEqual(recentProject)
  })

  test('loads a recent project only once when activated twice rapidly', async () => {
    const loadDeferred = createDeferred<Project | undefined>()
    const recentProject = makeProjectFixture()
    const repository = makeRepository([recentProject])
    repository.load.mockImplementation(() => loadDeferred.promise)
    renderLauncher({ repository })
    const link = within(await screen.findByRole('region', { name: '最近项目' })).getByRole('link', { name: /霜河渡/ })
    act(() => {
      link.click()
      link.click()
    })
    expect(repository.load).toHaveBeenCalledTimes(1)
    loadDeferred.resolve(recentProject)
    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
  })

  test('retries a failed recent-project load', async () => {
    const user = userEvent.setup()
    const recentProject = makeProjectFixture()
    const repository = makeRepository([recentProject])
    repository.load.mockRejectedValueOnce(new Error('项目读取失败'))
    renderLauncher({ repository })
    await user.click(within(await screen.findByRole('region', { name: '最近项目' })).getByRole('link', { name: /霜河渡/ }))
    await user.click(await screen.findByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    expect(repository.load).toHaveBeenCalledTimes(2)
  })

  test('does not navigate or retain another project when a recent project is missing', async () => {
    const user = userEvent.setup()
    const previousProject = makeProjectFixture()
    useProjectStore.setState({
      projectsById: { [previousProject.id]: previousProject },
      activeProjectId: previousProject.id,
      activeProject: previousProject,
    })
    const missingProject = { ...makeProjectFixture(), id: 'project-missing', title: '已移除项目' }
    const repository = makeRepository([missingProject])
    repository.load.mockResolvedValueOnce(undefined)
    const { router } = renderLauncher({ repository })
    await user.click(within(await screen.findByRole('region', { name: '最近项目' })).getByRole('link', { name: /已移除项目/ }))
    await waitFor(() => expect(repository.load).toHaveBeenCalledTimes(1))
    expect(router.state.location.pathname).toBe('/')
    expect(useProjectStore.getState().activeProject).toBeUndefined()
    expect(screen.getByRole('alert')).toHaveTextContent('未找到该项目')
  })

  test('keeps the latest recent-project selection active when an older load finishes last', async () => {
    const user = userEvent.setup()
    const firstProject = { ...makeProjectFixture(), id: 'project-first', title: '先选项目' }
    const secondProject = { ...makeProjectFixture(), id: 'project-second', title: '后选项目' }
    const firstLoad = createDeferred<Project | undefined>()
    const secondLoad = createDeferred<Project | undefined>()
    const repository = makeRepository([firstProject, secondProject])
    repository.load.mockImplementation((projectId) => projectId === firstProject.id ? firstLoad.promise : secondLoad.promise)
    const { router } = renderLauncher({ repository })
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })
    await user.click(within(recentRegion).getByRole('link', { name: /先选项目/ }))
    await user.click(within(recentRegion).getByRole('link', { name: /后选项目/ }))
    secondLoad.resolve(secondProject)
    await waitFor(() => expect(router.state.location.pathname).toBe('/project/project-second'))
    firstLoad.resolve(firstProject)
    await firstLoad.promise
    expect(useProjectStore.getState().activeProject?.id).toBe('project-second')
  })
})
