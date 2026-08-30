import { redirect, type LoaderFunctionArgs } from 'react-router-dom'

import { createProject, type Project } from '../project/model'
import {
  createDefaultProjectStorage,
  type ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import { buildRecipeProject } from '../project/example-project'
import { findRecipe, RECIPE_QUERY_PARAM, recipeDefinitions } from '../project/recipe-catalog'
import { getCreatorChallenge } from '../challenges/challenge-catalog'

type QuickCreateRepository = Pick<ProjectRepository, 'save'>

const defaultRepository = createDefaultProjectStorage(new WirelessCanvasDatabase())
// Coalesce only an in-flight save, not later intentional project creation.
// Repository scoping keeps tests and independent workspaces isolated.
const pendingCreations = new WeakMap<QuickCreateRepository, Map<string, Promise<Response>>>()

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
  const searchParams = new URL(requestUrl).searchParams
  const recipe = findRecipe(searchParams.get(RECIPE_QUERY_PARAM))
  const challenge = getCreatorChallenge(searchParams.get('challenge') ?? undefined)
  const intent = `从${(recipe ?? recipeDefinitions[0]).title}开始自由创作`
  const project = recipe
    ? buildRecipeProject(intent, recipe)
    : createProject('未命名项目', intent)

  return {
    ...project,
    title: `未命名项目 · ${formatProjectTimestamp(now)}`,
    ...(challenge
      ? { challengeId: challenge.id, challengeTags: [...challenge.tags] }
      : {}),
  }
}

export async function createQuickProjectRedirect(
  requestUrl: string,
  repository: QuickCreateRepository = defaultRepository,
  now = new Date(),
): Promise<Response> {
  let pending = pendingCreations.get(repository)
  if (!pending) {
    pending = new Map()
    pendingCreations.set(repository, pending)
  }
  const existing = pending.get(requestUrl)
  if (existing) return existing
  const creation = (async () => {
    const project = buildQuickProject(requestUrl, now)
    await repository.save(project)
    return redirect(`/project/${project.id}`)
  })()
  pending.set(requestUrl, creation)
  try {
    return await creation
  } finally {
    pending.delete(requestUrl)
  }
}

export function quickCreateProjectLoader({ request }: LoaderFunctionArgs) {
  return createQuickProjectRedirect(request.url)
}
