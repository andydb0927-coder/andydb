import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { createProject, type Project } from '../project/model'
import { ProjectRepository } from '../project/project-repository'
import { useProjectStore } from '../project/project-store'
import { Button } from '../../ui/Button'
import { StatusText } from '../../ui/StatusText'
import { RecipeRow, type RecipeId } from './RecipeRow'

type LauncherRepository = Pick<
  ProjectRepository,
  'save' | 'load' | 'listRecent'
>

export type RecipeParser = (
  recipeId: RecipeId,
  intent: string,
  signal: AbortSignal,
) => Promise<void>

type LauncherState =
  | { status: 'idle' }
  | { status: 'parsing'; abortController: AbortController }
  | { status: 'failed'; message: string }

interface RecipeDefinition {
  id: RecipeId
  title: string
  description: string
  characterPrompt: string
  scenePrompt: string
  storyboardPrompt: string
}

const recipes: RecipeDefinition[] = [
  {
    id: 'cinematic-story',
    title: '电影感叙事',
    description: '从角色动机出发，建立场景与首个叙事镜头',
    characterPrompt: '主角人物参考，克制的电影光影，清晰面部特征',
    scenePrompt: '核心场景设定，真实空间层次与氛围光',
    storyboardPrompt: '首个叙事分镜，宽银幕构图，建立人物与环境关系',
  },
  {
    id: 'brand-atmosphere',
    title: '品牌氛围片',
    description: '围绕品牌气质建立主角、环境与开场视觉',
    characterPrompt: '品牌主角人物参考，精致造型与统一视觉气质',
    scenePrompt: '品牌世界观场景，材质细节与氛围光线',
    storyboardPrompt: '品牌氛围片开场分镜，视觉焦点明确，节奏舒展',
  },
  {
    id: 'character-teaser',
    title: '角色概念预告',
    description: '先定义角色形象，再生成其世界与亮相镜头',
    characterPrompt: '角色概念参考，全身造型，鲜明轮廓与身份细节',
    scenePrompt: '角色所属世界的核心场景，环境叙事清晰',
    storyboardPrompt: '角色首次亮相分镜，强烈剪影与戏剧性光线',
  },
]

const exampleProject = {
  id: 'project-frost-river',
  title: '霜河渡',
  intent: '雨夜河岸，一名女子寻找失踪的弟弟',
  nodeCount: 3,
}

const defaultRepository = new ProjectRepository()

function defaultParseRecipe(
  _recipeId: RecipeId,
  _intent: string,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', cancel)
      resolve()
    }
    const cancel = () => {
      window.clearTimeout(timer)
      reject(new DOMException('已取消', 'AbortError'))
    }
    const timer = window.setTimeout(finish, 320)

    if (signal.aborted) cancel()
    else signal.addEventListener('abort', cancel, { once: true })
  })
}

function buildRecipeProject(
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
        position: { x: 120, y: 180 },
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
        position: { x: 460, y: 180 },
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
        position: { x: 800, y: 180 },
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

function buildExampleProject(): Project {
  const project = buildRecipeProject(exampleProject.intent, recipes[0])
  return {
    ...project,
    id: exampleProject.id,
    title: exampleProject.title,
  }
}

function readableError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : '暂时无法解析创作意图'
}

export interface ProjectLauncherPageProps {
  repository?: LauncherRepository
  parseRecipe?: RecipeParser
}

export function ProjectLauncherPage({
  repository = defaultRepository,
  parseRecipe = defaultParseRecipe,
}: ProjectLauncherPageProps) {
  const navigate = useNavigate()
  const [intent, setIntent] = useState('')
  const [selectedRecipeId, setSelectedRecipeId] =
    useState<RecipeId>('cinematic-story')
  const [launcherState, setLauncherState] = useState<LauncherState>({
    status: 'idle',
  })
  const [validationMessage, setValidationMessage] = useState('')
  const [recentProjects, setRecentProjects] = useState<Project[] | null>(null)

  useEffect(() => {
    let active = true
    repository
      .listRecent(6)
      .then((projects) => {
        if (active) setRecentProjects(projects)
      })
      .catch(() => {
        if (active) setRecentProjects([])
      })

    return () => {
      active = false
    }
  }, [repository])

  const persistAndOpen = async (project: Project) => {
    await repository.save(project)
    await useProjectStore.getState().hydrate(project.id, repository)
    navigate(`/project/${project.id}`)
  }

  const startRecipe = async () => {
    const trimmedIntent = intent.trim()
    if (!trimmedIntent) {
      setValidationMessage('请先描述短片主题')
      return
    }

    setValidationMessage('')
    const abortController = new AbortController()
    setLauncherState({ status: 'parsing', abortController })

    try {
      await parseRecipe(
        selectedRecipeId,
        trimmedIntent,
        abortController.signal,
      )
      if (abortController.signal.aborted) return

      const recipe = recipes.find(({ id }) => id === selectedRecipeId)!
      await persistAndOpen(buildRecipeProject(trimmedIntent, recipe))
    } catch (error) {
      if (abortController.signal.aborted) {
        setLauncherState({ status: 'idle' })
        return
      }
      setLauncherState({ status: 'failed', message: readableError(error) })
    }
  }

  const cancelParsing = () => {
    if (launcherState.status !== 'parsing') return
    launcherState.abortController.abort()
    setLauncherState({ status: 'idle' })
  }

  const openBlankCanvas = async () => {
    try {
      await persistAndOpen(createProject('空白项目', intent.trim()))
    } catch (error) {
      setLauncherState({ status: 'failed', message: readableError(error) })
    }
  }

  const openRecentProject = async (projectId: string) => {
    try {
      await useProjectStore.getState().hydrate(projectId, repository)
      navigate(`/project/${projectId}`)
    } catch (error) {
      setLauncherState({ status: 'failed', message: readableError(error) })
    }
  }

  const openExampleProject = async () => {
    try {
      await persistAndOpen(buildExampleProject())
    } catch (error) {
      setLauncherState({ status: 'failed', message: readableError(error) })
    }
  }

  const isParsing = launcherState.status === 'parsing'

  return (
    <main className="launcher-page">
      <header className="launcher-header">
        <Link className="launcher-brand focus-visible" to="/">
          无线画布
        </Link>
        <nav className="launcher-header__actions" aria-label="辅助导航">
          <a className="launcher-header__link focus-visible" href="#help">
            帮助
          </a>
          <button className="launcher-account focus-visible" type="button">
            账户
          </button>
        </nav>
      </header>

      <section className="launcher-hero" aria-labelledby="launcher-title">
        <p className="launcher-eyebrow">AI CINEMATIC CANVAS</p>
        <h1 id="launcher-title">创建你的第一部短片</h1>
        <p className="launcher-intro">
          从一句创作意图开始，整理角色、场景与第一个镜头。
        </p>

        <div className="launcher-form">
          <label className="launcher-intent-label" htmlFor="creative-intent">
            描述你想创作的短片
          </label>
          <textarea
            id="creative-intent"
            className="launcher-intent focus-visible"
            value={intent}
            disabled={isParsing}
            rows={5}
            placeholder="例如：一位女子在雨夜寻找失踪的弟弟……"
            aria-describedby={validationMessage ? 'intent-error' : undefined}
            aria-invalid={Boolean(validationMessage)}
            onChange={(event) => {
              setIntent(event.target.value)
              if (validationMessage) setValidationMessage('')
            }}
          />
          {validationMessage ? (
            <p id="intent-error" className="launcher-message" role="alert">
              {validationMessage}
            </p>
          ) : null}

          <fieldset className="launcher-recipes" disabled={isParsing}>
            <legend>选择创作配方</legend>
            <div className="launcher-recipes__grid">
              {recipes.map((recipe) => (
                <RecipeRow
                  key={recipe.id}
                  {...recipe}
                  checked={selectedRecipeId === recipe.id}
                  disabled={isParsing}
                  onChange={setSelectedRecipeId}
                />
              ))}
            </div>
          </fieldset>

          {launcherState.status === 'failed' ? (
            <div className="launcher-recovery">
              <p className="launcher-message" role="alert">
                {launcherState.message}
              </p>
              <div className="launcher-recovery__actions">
                <Button onClick={() => void startRecipe()}>重试</Button>
                <Button
                  className="launcher-button--secondary"
                  onClick={() => void openBlankCanvas()}
                >
                  直接进入空白画布
                </Button>
              </div>
            </div>
          ) : isParsing ? (
            <div className="launcher-progress">
              <StatusText status="running">
                正在整理角色、场景与镜头结构
              </StatusText>
              <Button
                className="launcher-button--secondary"
                onClick={cancelParsing}
              >
                取消
              </Button>
            </div>
          ) : (
            <Button
              className="launcher-submit"
              onClick={() => void startRecipe()}
            >
              创建项目
            </Button>
          )}
        </div>
      </section>

      <section className="launcher-recent" aria-labelledby="recent-title">
        <div className="launcher-recent__heading">
          <h2 id="recent-title">最近项目</h2>
          <span>{recentProjects === null ? '正在读取' : '继续创作'}</span>
        </div>
        <div className="launcher-recent__list">
          {recentProjects?.length ? (
            recentProjects.map((project) => (
              <Link
                key={project.id}
                className="recent-project focus-visible"
                to={`/project/${project.id}`}
                onClick={(event) => {
                  event.preventDefault()
                  void openRecentProject(project.id)
                }}
              >
                <span className="recent-project__title">{project.title}</span>
                <span className="recent-project__intent">{project.intent}</span>
                <span className="recent-project__meta">
                  {project.nodes.length} 个创作节点
                </span>
              </Link>
            ))
          ) : recentProjects ? (
            <Link
              className="recent-project recent-project--example focus-visible"
              to={`/project/${exampleProject.id}`}
              onClick={(event) => {
                event.preventDefault()
                void openExampleProject()
              }}
            >
              <span className="recent-project__badge">完整示例</span>
              <span className="recent-project__title">
                {exampleProject.title}
              </span>
              <span className="recent-project__intent">
                {exampleProject.intent}
              </span>
              <span className="recent-project__meta">
                {exampleProject.nodeCount} 个创作节点
              </span>
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  )
}
