import { render, screen, within } from '@testing-library/react'
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

function renderLauncher({
  repository = makeRepository(),
  parseRecipe = vi.fn<RecipeParser>().mockResolvedValue(undefined),
}: {
  repository?: ReturnType<typeof makeRepository>
  parseRecipe?: RecipeParser
} = {}) {
  const routes: RouteObject[] = [
    {
      path: '/',
      element: (
        <ProjectLauncherPage
          repository={repository}
          parseRecipe={parseRecipe}
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

  render(
    <RouterProvider
      router={createMemoryRouter(routes, { initialEntries: ['/'] })}
    />,
  )

  return { repository }
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
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(parsingSignal?.aborted).toBe(true)
    expect(repository.save).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '创建你的第一部短片' })).toBeVisible()
    expect(screen.getByLabelText('描述你想创作的短片')).toHaveValue('雨夜寻人')
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
    expect(within(recentRegion).getAllByRole('link')).toHaveLength(1)
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
})
