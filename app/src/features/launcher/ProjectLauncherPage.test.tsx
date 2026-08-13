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
import {
  ProjectLauncherPage,
  type RecipeParser,
} from './ProjectLauncherPage'

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
  parseRecipe = vi.fn<RecipeParser>().mockResolvedValue(undefined),
  strictMode = false,
  initialEntry = '/',
  homeContentRepository = makeHomeContentRepository(),
  communityRepository = makeCommunityRepository(),
}: {
  repository?: ReturnType<typeof makeRepository>
  parseRecipe?: RecipeParser
  strictMode?: boolean
  initialEntry?: string
  homeContentRepository?: ReturnType<typeof makeHomeContentRepository>
  communityRepository?: ReturnType<typeof makeCommunityRepository>
} = {}) {
  const routes: RouteObject[] = [
    {
      path: '/',
      element: (
        <ProjectLauncherPage
          repository={repository}
          parseRecipe={parseRecipe}
          homeContentRepository={homeContentRepository}
          communityRepository={communityRepository}
        />
      ),
    },
    {
      path: '/project/:projectId',
      element: (
        <main>
          <h1>项目画布</h1>
        </main>
      ),
    },
  ]

  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] })
  const routerProvider = (
    <RouterProvider
      router={router}
    />
  )
  const view = render(
    strictMode ? <StrictMode>{routerProvider}</StrictMode> : routerProvider,
  )

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
  test('renders the public-style account actions as real local routes', () => {
    renderLauncher()

    const navigation = screen.getByRole('navigation', { name: '首页账户入口' })
    expect(within(navigation).getByRole('link', { name: '积分超市' })).toHaveAttribute(
      'href',
      '/account#credits',
    )
    expect(within(navigation).getByRole('link', { name: '开通会员' })).toHaveAttribute(
      'href',
      '/account#membership',
    )
    expect(within(navigation).getByRole('link', { name: '注册/登录' })).toHaveAttribute(
      'href',
      '/account',
    )
  })

  test('opens a locally seeded mode with its canvas hint persisted', async () => {
    const user = userEvent.setup()
    const { repository } = renderLauncher()

    await user.click(
      await screen.findByRole('button', { name: /逐帧拉片/ }),
    )

    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(repository.save.mock.calls[0][0]).toMatchObject({
      title: '逐帧拉片',
      intent: expect.stringContaining('逐帧拉片模式'),
    })
  })

  test('preselects a workflow from the URL without creating a project', async () => {
    const { repository } = renderLauncher({
      initialEntry: '/?recipe=brand-atmosphere',
    })

    expect(
      await screen.findByRole('radio', { name: /品牌氛围片/ }),
    ).toBeChecked()
    expect(repository.save).not.toHaveBeenCalled()
  })

  test('creates a recipe project with independently referenced starter nodes and opens its canvas', async () => {
    const user = userEvent.setup()
    const { repository } = renderLauncher()

    expect(screen.getAllByRole('radio')).toHaveLength(3)
    await user.click(screen.getByRole('radio', { name: /电影感叙事/ }))
    await user.type(
      screen.getByLabelText('描述你想创作的短片'),
      '一位女子在雨夜寻找失踪的弟弟',
    )
    await user.click(screen.getByRole('button', { name: '创建项目' }))

    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    expect(repository.save).toHaveBeenCalledTimes(1)
    const savedProject = repository.save.mock.calls[0][0]
    expect(savedProject.intent).toBe('一位女子在雨夜寻找失踪的弟弟')
    expect(savedProject.nodes.map((node) => node.kind)).toEqual([
      'character',
      'scene',
      'storyboard',
    ])
    expect(savedProject.nodes.map((node) => node.versions[0].assetId)).toEqual([
      'asset-character-reference',
      'asset-scene-reference',
      'asset-storyboard-01',
    ])
    expect(new Set(savedProject.nodes.map((node) => node.versions[0].assetId)).size).toBe(3)
    expect(useProjectStore.getState().activeProjectId).toBe(savedProject.id)
  })

  test('requires a creative intent before parsing', async () => {
    const user = userEvent.setup()
    const parseRecipe = vi.fn<RecipeParser>().mockResolvedValue(undefined)
    const { repository } = renderLauncher({ parseRecipe })

    await user.click(screen.getByRole('button', { name: '创建项目' }))

    expect(screen.getByRole('alert')).toHaveTextContent('请先描述短片主题')
    expect(parseRecipe).not.toHaveBeenCalled()
    expect(repository.save).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '创建你的第一部短片' })).toBeVisible()
  })

  test('cancels parsing without persisting or leaving the launcher', async () => {
    const user = userEvent.setup()
    let parsingSignal: AbortSignal | undefined
    const parseRecipe = vi.fn<RecipeParser>((_recipeId, _intent, signal) => {
      parsingSignal = signal
      return new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('已取消', 'AbortError')),
        )
      })
    })
    const { repository } = renderLauncher({ parseRecipe })

    await user.type(screen.getByLabelText('描述你想创作的短片'), '雨夜寻人')
    await user.click(screen.getByRole('button', { name: '创建项目' }))
    expect(
      screen.getByText('正在整理角色、场景与镜头结构'),
    ).toBeVisible()
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(parsingSignal?.aborted).toBe(true)
    expect(repository.save).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '创建你的第一部短片' })).toBeVisible()
    expect(screen.getByLabelText('描述你想创作的短片')).toHaveValue('雨夜寻人')
  })

  test('removes cancellation once parsing finishes while project creation is pending', async () => {
    const user = userEvent.setup()
    const saveDeferred = createDeferred<void>()
    const repository = makeRepository()
    repository.save.mockImplementationOnce(async (project) => {
      repository.projects.set(project.id, project)
      await saveDeferred.promise
    })
    renderLauncher({ repository })

    await user.type(screen.getByLabelText('描述你想创作的短片'), '雨夜寻人')
    await user.click(screen.getByRole('button', { name: '创建项目' }))
    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))

    expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument()
    expect(screen.getByText('正在创建项目')).toBeVisible()

    saveDeferred.resolve(undefined)
    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
  })

  test('aborts the active parser when the launcher unmounts', async () => {
    const user = userEvent.setup()
    let parsingSignal: AbortSignal | undefined
    const parseRecipe = vi.fn<RecipeParser>((_recipeId, _intent, signal) => {
      parsingSignal = signal
      return new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('已取消', 'AbortError')),
        )
      })
    })
    const { repository, unmount } = renderLauncher({ parseRecipe })

    await user.type(screen.getByLabelText('描述你想创作的短片'), '雨夜寻人')
    await user.click(screen.getByRole('button', { name: '创建项目' }))
    expect(parsingSignal?.aborted).toBe(false)

    unmount()

    expect(parsingSignal?.aborted).toBe(true)
    expect(repository.save).not.toHaveBeenCalled()
  })

  test('does not activate or navigate after unmounting during project save', async () => {
    const user = userEvent.setup()
    const saveDeferred = createDeferred<void>()
    const repository = makeRepository()
    repository.save.mockImplementationOnce(async (project) => {
      repository.projects.set(project.id, project)
      await saveDeferred.promise
    })
    const { router, unmount } = renderLauncher({ repository })

    await user.type(screen.getByLabelText('描述你想创作的短片'), '雨夜寻人')
    await user.click(screen.getByRole('button', { name: '创建项目' }))
    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))
    unmount()

    await act(async () => {
      saveDeferred.resolve(undefined)
      await saveDeferred.promise
      await Promise.resolve()
    })

    expect(repository.load).not.toHaveBeenCalled()
    expect(useProjectStore.getState().activeProject).toBeUndefined()
    expect(router.state.location.pathname).toBe('/')
  })

  test('does not activate or navigate after unmounting during project hydration', async () => {
    const user = userEvent.setup()
    const loadDeferred = createDeferred<Project | undefined>()
    const repository = makeRepository()
    repository.load.mockImplementationOnce(() => loadDeferred.promise)
    const { router, unmount } = renderLauncher({ repository })

    await user.type(screen.getByLabelText('描述你想创作的短片'), '雨夜寻人')
    await user.click(screen.getByRole('button', { name: '创建项目' }))
    await waitFor(() => expect(repository.load).toHaveBeenCalledTimes(1))
    const savedProject = repository.save.mock.calls[0][0]
    unmount()

    await act(async () => {
      loadDeferred.resolve(savedProject)
      await loadDeferred.promise
      await Promise.resolve()
    })

    expect(useProjectStore.getState().activeProject).toBeUndefined()
    expect(router.state.location.pathname).toBe('/')
  })

  test('keeps the original intent and offers recovery actions after parsing fails', async () => {
    const user = userEvent.setup()
    const parseRecipe = vi.fn<RecipeParser>().mockRejectedValue(
      new Error('暂时无法解析创作意图'),
    )
    renderLauncher({ parseRecipe })

    await user.type(screen.getByLabelText('描述你想创作的短片'), '雾中灯塔')
    await user.click(screen.getByRole('button', { name: '创建项目' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法解析创作意图')
    expect(screen.getByLabelText('描述你想创作的短片')).toHaveValue('雾中灯塔')
    expect(screen.getByRole('button', { name: '重试' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: '直接进入空白画布' }),
    ).toBeVisible()
  })

  test('retries the retained recipe request and opens the resulting project', async () => {
    const user = userEvent.setup()
    const parseRecipe = vi
      .fn<RecipeParser>()
      .mockRejectedValueOnce(new Error('解析服务繁忙'))
      .mockResolvedValueOnce(undefined)
    const { repository } = renderLauncher({ parseRecipe })

    await user.type(screen.getByLabelText('描述你想创作的短片'), '雾中灯塔')
    await user.click(screen.getByRole('button', { name: '创建项目' }))
    await user.click(await screen.findByRole('button', { name: '重试' }))

    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    expect(parseRecipe).toHaveBeenCalledTimes(2)
    expect(repository.save).toHaveBeenCalledTimes(1)
  })

  test('starts only one recipe recovery when retry is activated twice rapidly', async () => {
    const user = userEvent.setup()
    const saveDeferred = createDeferred<void>()
    const repository = makeRepository()
    repository.save.mockImplementationOnce(async (project) => {
      repository.projects.set(project.id, project)
      await saveDeferred.promise
    })
    const parseRecipe = vi
      .fn<RecipeParser>()
      .mockRejectedValueOnce(new Error('解析服务繁忙'))
      .mockResolvedValue(undefined)
    renderLauncher({ repository, parseRecipe })

    await user.type(screen.getByLabelText('描述你想创作的短片'), '雾中灯塔')
    await user.click(screen.getByRole('button', { name: '创建项目' }))
    const retry = await screen.findByRole('button', { name: '重试' })
    act(() => {
      retry.click()
      retry.click()
    })
    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))

    expect(parseRecipe).toHaveBeenCalledTimes(2)
    saveDeferred.resolve(undefined)
    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
  })

  test('opens a persisted empty project when recipe parsing cannot recover', async () => {
    const user = userEvent.setup()
    const parseRecipe = vi.fn<RecipeParser>().mockRejectedValue(
      new Error('解析服务繁忙'),
    )
    const { repository } = renderLauncher({ parseRecipe })

    await user.type(screen.getByLabelText('描述你想创作的短片'), '雾中灯塔')
    await user.click(screen.getByRole('button', { name: '创建项目' }))
    await user.click(
      await screen.findByRole('button', { name: '直接进入空白画布' }),
    )

    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    const savedProject = repository.save.mock.calls[0][0]
    expect(savedProject.intent).toBe('雾中灯塔')
    expect(savedProject.nodes).toEqual([])
    expect(savedProject.assets).toEqual([])
  })

  test('shows one complete clickable example when there are no recent projects', async () => {
    renderLauncher()

    const recentRegion = await screen.findByRole('region', { name: '最近项目' })
    const example = within(recentRegion).getByRole('link', {
      name: /霜河渡.*雨夜河岸.*3 个创作节点/,
    })

    expect(example).toHaveAttribute('href', '/project/project-frost-river')
    expect(within(recentRegion).getAllByRole('link')).toHaveLength(2)
    expect(within(recentRegion).getByRole('link', { name: '查看全部项目' })).toHaveAttribute(
      'href',
      '/projects',
    )
  })

  test('loads recent projects after StrictMode replays mount effects', async () => {
    const repository = makeRepository()
    renderLauncher({ repository, strictMode: true })

    const recentRegion = await screen.findByRole('region', { name: '最近项目' })

    expect(
      await within(recentRegion).findByRole('link', { name: /完整示例/ }),
    ).toBeVisible()
    expect(repository.listRecent).toHaveBeenCalledTimes(2)
  })

  test('shows an honest recent-project error and retries the list operation', async () => {
    const user = userEvent.setup()
    const repository = makeRepository()
    repository.listRecent
      .mockRejectedValueOnce(new Error('无法读取项目'))
      .mockResolvedValueOnce([])
    renderLauncher({ repository })
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })

    expect(within(recentRegion).getByRole('alert')).toHaveTextContent(
      '无法读取最近项目',
    )
    expect(
      within(recentRegion).queryByRole('link', { name: /完整示例/ }),
    ).not.toBeInTheDocument()

    await user.click(
      within(recentRegion).getByRole('button', { name: '重试加载最近项目' }),
    )

    expect(
      await within(recentRegion).findByRole('link', { name: /完整示例/ }),
    ).toBeVisible()
    expect(repository.listRecent).toHaveBeenCalledTimes(2)
  })

  test('starts only one recent-list retry when recovery is activated twice rapidly', async () => {
    const retryDeferred = createDeferred<Project[]>()
    const repository = makeRepository()
    repository.listRecent
      .mockRejectedValueOnce(new Error('无法读取项目'))
      .mockImplementationOnce(() => retryDeferred.promise)
    renderLauncher({ repository })
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })
    const retry = within(recentRegion).getByRole('button', {
      name: '重试加载最近项目',
    })

    act(() => {
      retry.click()
      retry.click()
    })

    expect(repository.listRecent).toHaveBeenCalledTimes(2)
    retryDeferred.resolve([])
    expect(
      await within(recentRegion).findByRole('link', { name: /完整示例/ }),
    ).toBeVisible()
  })

  test('persists and activates the complete example before opening its canvas', async () => {
    const user = userEvent.setup()
    const { repository } = renderLauncher()
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })

    await user.click(
      within(recentRegion).getByRole('link', {
        name: /霜河渡.*雨夜河岸.*3 个创作节点/,
      }),
    )

    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(useProjectStore.getState().activeProjectId).toBe(
      'project-frost-river',
    )
    expect(
      useProjectStore.getState().activeProject?.nodes.map((node) => node.kind),
    ).toEqual(['character', 'scene', 'storyboard'])
  })

  test('persists the complete example only once when its link is activated twice rapidly', async () => {
    const saveDeferred = createDeferred<void>()
    const repository = makeRepository()
    repository.save.mockImplementation(async (project) => {
      repository.projects.set(project.id, project)
      await saveDeferred.promise
    })
    renderLauncher({ repository })
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })
    const example = within(recentRegion).getByRole('link', {
      name: /完整示例/,
    })

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
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })

    await user.click(
      within(recentRegion).getByRole('link', {
        name: /霜河渡.*雨夜寻找失踪的弟弟.*2 个创作节点/,
      }),
    )

    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    expect(repository.save).not.toHaveBeenCalled()
    expect(useProjectStore.getState().activeProject).toEqual(recentProject)
  })

  test('loads a recent project only once when its link is activated twice rapidly', async () => {
    const loadDeferred = createDeferred<Project | undefined>()
    const recentProject = makeProjectFixture()
    const repository = makeRepository([recentProject])
    repository.load.mockImplementation(() => loadDeferred.promise)
    renderLauncher({ repository })
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })
    const recentLink = within(recentRegion).getByRole('link', {
      name: /霜河渡/,
    })

    act(() => {
      recentLink.click()
      recentLink.click()
    })

    expect(repository.load).toHaveBeenCalledTimes(1)
    loadDeferred.resolve(recentProject)
    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
  })

  test('retries the failed recent-project load instead of parsing a recipe', async () => {
    const user = userEvent.setup()
    const recentProject = makeProjectFixture()
    const repository = makeRepository([recentProject])
    repository.load.mockRejectedValueOnce(new Error('项目读取失败'))
    const parseRecipe = vi.fn<RecipeParser>().mockResolvedValue(undefined)
    renderLauncher({ repository, parseRecipe })
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })

    await user.click(
      within(recentRegion).getByRole('link', { name: /霜河渡/ }),
    )
    await user.click(await screen.findByRole('button', { name: '重试' }))

    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    expect(repository.load).toHaveBeenCalledTimes(2)
    expect(parseRecipe).not.toHaveBeenCalled()
  })

  test('retries a failed complete-example save without parsing a recipe', async () => {
    const user = userEvent.setup()
    const repository = makeRepository()
    repository.save.mockRejectedValueOnce(new Error('示例保存失败'))
    const parseRecipe = vi.fn<RecipeParser>().mockResolvedValue(undefined)
    renderLauncher({ repository, parseRecipe })
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })

    await user.click(
      within(recentRegion).getByRole('link', { name: /完整示例/ }),
    )
    await user.click(await screen.findByRole('button', { name: '重试' }))

    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    expect(repository.save).toHaveBeenCalledTimes(2)
    expect(parseRecipe).not.toHaveBeenCalled()
  })

  test('does not navigate or retain another active project when a recent project is missing', async () => {
    const user = userEvent.setup()
    const previousProject = makeProjectFixture()
    useProjectStore.setState({
      projectsById: { [previousProject.id]: previousProject },
      activeProjectId: previousProject.id,
      activeProject: previousProject,
    })
    const missingProject = {
      ...makeProjectFixture(),
      id: 'project-missing',
      title: '已移除项目',
    }
    const repository = makeRepository([missingProject])
    repository.load.mockResolvedValueOnce(undefined)
    const { router } = renderLauncher({ repository })
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })

    await user.click(
      within(recentRegion).getByRole('link', { name: /已移除项目/ }),
    )
    await waitFor(() => expect(repository.load).toHaveBeenCalledTimes(1))

    expect(router.state.location.pathname).toBe('/')
    expect(useProjectStore.getState().activeProject).toBeUndefined()
    expect(screen.getByRole('alert')).toHaveTextContent('未找到该项目')
  })

  test('keeps the latest recent-project selection active when an older load finishes last', async () => {
    const user = userEvent.setup()
    const firstProject = {
      ...makeProjectFixture(),
      id: 'project-first',
      title: '先选项目',
      intent: '先选创作意图',
    }
    const secondProject = {
      ...makeProjectFixture(),
      id: 'project-second',
      title: '后选项目',
      intent: '后选创作意图',
    }
    const firstLoad = createDeferred<Project | undefined>()
    const secondLoad = createDeferred<Project | undefined>()
    const repository = makeRepository([firstProject, secondProject])
    repository.load.mockImplementation((projectId) =>
      projectId === firstProject.id ? firstLoad.promise : secondLoad.promise,
    )
    const { router } = renderLauncher({ repository })
    const recentRegion = await screen.findByRole('region', { name: '最近项目' })

    await user.click(within(recentRegion).getByRole('link', { name: /先选项目/ }))
    await user.click(within(recentRegion).getByRole('link', { name: /后选项目/ }))
    secondLoad.resolve(secondProject)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/project/project-second'),
    )

    await act(async () => {
      firstLoad.resolve(firstProject)
      await firstLoad.promise
      await Promise.resolve()
    })

    expect(router.state.location.pathname).toBe('/project/project-second')
    expect(useProjectStore.getState().activeProject?.id).toBe('project-second')
  })
})
