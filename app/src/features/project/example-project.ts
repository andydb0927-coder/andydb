import { createProject } from './model'
import type { Project } from './model'
import { recipeDefinitions, type RecipeDefinition } from './recipe-catalog'

export const EXAMPLE_PROJECT_ID = 'project-frost-river'
export const exampleProject = {
  id: EXAMPLE_PROJECT_ID,
  title: '霜河渡',
  intent: '雨夜河岸，一名女子寻找失踪的弟弟',
  nodeCount: 3,
} as const

export interface ExampleProjectRepository {
  load(projectId: string): Promise<Project | undefined>
  save(project: Project): Promise<void>
}

export function buildRecipeProject(
  intent: string,
  recipe: RecipeDefinition,
): Project {
  const project = createProject(recipe.title, intent)
  const createdAt = project.createdAt

  return {
    ...project,
    assets: [
      {
        id: 'asset-character-reference',
        kind: 'image',
        url: '/demo/character-lin-yuan.png',
        mimeType: 'image/png',
        width: 960,
        height: 1200,
      },
      {
        id: 'asset-scene-reference',
        kind: 'image',
        url: '/demo/scene-rain-street.png',
        mimeType: 'image/png',
        width: 1600,
        height: 900,
      },
      {
        id: 'asset-storyboard-01',
        kind: 'image',
        url: '/demo/shot-river.png',
        mimeType: 'image/png',
        width: 1600,
        height: 900,
      },
    ],
    nodes: [
      {
        id: 'character-reference',
        kind: 'character',
        title: '角色参考',
        position: { x: 80, y: 80 },
        versions: [
          {
            id: 'version-character-reference',
            createdAt,
            prompt: `${recipe.characterPrompt}。创作意图：${intent}`,
            assetId: 'asset-character-reference',
          },
        ],
        activeVersionId: 'version-character-reference',
        sourceChanged: false,
      },
      {
        id: 'scene-reference',
        kind: 'scene',
        title: '场景设定',
        position: { x: 390, y: 210 },
        versions: [
          {
            id: 'version-scene-reference',
            createdAt,
            prompt: `${recipe.scenePrompt}。创作意图：${intent}`,
            assetId: 'asset-scene-reference',
          },
        ],
        activeVersionId: 'version-scene-reference',
        sourceChanged: false,
      },
      {
        id: 'storyboard-01',
        kind: 'storyboard',
        title: '分镜 01',
        position: { x: 720, y: 350 },
        versions: [
          {
            id: 'version-storyboard-01',
            createdAt,
            prompt: `${recipe.storyboardPrompt}。创作意图：${intent}`,
            assetId: 'asset-storyboard-01',
          },
        ],
        activeVersionId: 'version-storyboard-01',
        sourceChanged: false,
      },
    ],
    edges: [
      {
        id: 'edge-character-storyboard-01',
        sourceNodeId: 'character-reference',
        targetNodeId: 'storyboard-01',
      },
      {
        id: 'edge-scene-storyboard-01',
        sourceNodeId: 'scene-reference',
        targetNodeId: 'storyboard-01',
      },
    ],
  }
}

export function buildExampleProject(): Project {
  const project = buildRecipeProject(exampleProject.intent, recipeDefinitions[0])
  return {
    ...project,
    id: exampleProject.id,
    title: exampleProject.title,
  }
}

export async function ensureExampleProject(
  repository: ExampleProjectRepository,
): Promise<Project> {
  const existing = await repository.load(EXAMPLE_PROJECT_ID)
  if (existing) return existing
  const project = buildExampleProject()
  await repository.save(project)
  return project
}
