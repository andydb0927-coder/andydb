import { redirect, type LoaderFunctionArgs } from 'react-router-dom'

import type { Project } from '../project/model'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import { buildRecipeProject } from '../project/example-project'
import { findRecipe, RECIPE_QUERY_PARAM, recipeDefinitions } from '../project/recipe-catalog'

type QuickCreateRepository = Pick<ProjectRepository, 'save'>

const defaultRepository = new ProjectRepository(new WirelessCanvasDatabase())

function formatProjectTimestamp(now: Date): string {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  )

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`
}

export function buildQuickProject(requestUrl: string, now = new Date()): Project {
  const requestedRecipe = findRecipe(
    new URL(requestUrl).searchParams.get(RECIPE_QUERY_PARAM),
  )
  const recipe = requestedRecipe ?? recipeDefinitions[0]
  const project = buildRecipeProject(
    `从${recipe.title}开始自由创作`,
    recipe,
  )

  return {
    ...project,
    title: `未命名项目 · ${formatProjectTimestamp(now)}`,
  }
}

export async function createQuickProjectRedirect(
  requestUrl: string,
  repository: QuickCreateRepository = defaultRepository,
  now = new Date(),
): Promise<Response> {
  const project = buildQuickProject(requestUrl, now)
  await repository.save(project)
  return redirect(`/project/${project.id}`)
}

export function quickCreateProjectLoader({ request }: LoaderFunctionArgs) {
  return createQuickProjectRedirect(request.url)
}
