import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { createProject, type Project } from '../project/model'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import {
  buildExampleProject,
  buildRecipeProject,
  exampleProject,
} from '../project/example-project'
import {
  findRecipe,
  RECIPE_QUERY_PARAM,
  recipeDefinitions,
} from '../project/recipe-catalog'
import { useProjectStore } from '../project/project-store'
import { Button } from '../../ui/Button'
import { StatusText } from '../../ui/StatusText'
import { RecipeRow, type RecipeId } from './RecipeRow'
import {
  PlatformHomeSections,
  type HomePromptRequest,
} from '../home/PlatformHomeSections'
import {
  HomeContentRepository,
  type PlatformHomeContentRepository,
} from '../home/home-content-repository'
import {
  CommunityRepository,
  type CommunityWorkRepository,
} from '../community/community-repository'

type LauncherRepository = Pick<
  ProjectRepository,
  'save' | 'load' | 'listRecent'
>

type LauncherCommunityRepository = Pick<
  CommunityWorkRepository,
  'ensureDemoWorks' | 'listPublished'
>

export type RecipeParser = (
  recipeId: RecipeId,
  intent: string,
  signal: AbortSignal,
) => Promise<void>

type LauncherState =
  | { status: 'idle' }
  | { status: 'parsing'; abortController: AbortController }
  | { status: 'creating' }
  | { status: 'failed'; message: string; operation: RetryOperation }

type RetryOperation =
  | { kind: 'recipe' }
  | { kind: 'blank' }
  | { kind: 'recent'; projectId: string }
  | { kind: 'example' }
  | { kind: 'prompt'; request: HomePromptRequest }

type RecentProjectsState =
  | { status: 'loading' }
  | { status: 'loaded'; projects: Project[] }
  | { status: 'failed'; message: string }

interface LauncherOperation {
  id: number
  key: string
  abortController: AbortController
}

const defaultDatabase = new WirelessCanvasDatabase()
const defaultRepository = new ProjectRepository(defaultDatabase)
const defaultHomeContentRepository = new HomeContentRepository(defaultDatabase)
const defaultCommunityRepository = new CommunityRepository(defaultDatabase)

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

function readableError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : '暂时无法解析创作意图'
}

export interface ProjectLauncherPageProps {
  repository?: LauncherRepository
  parseRecipe?: RecipeParser
  homeContentRepository?: PlatformHomeContentRepository
  communityRepository?: LauncherCommunityRepository
}

export function ProjectLauncherPage({
  repository = defaultRepository,
  parseRecipe = defaultParseRecipe,
  homeContentRepository = defaultHomeContentRepository,
  communityRepository = defaultCommunityRepository,
}: ProjectLauncherPageProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [intent, setIntent] = useState('')
  const requestedRecipeId = findRecipe(
    searchParams.get(RECIPE_QUERY_PARAM),
  )?.id
  const [selectedRecipeId, setSelectedRecipeId] =
    useState<RecipeId>(() => requestedRecipeId ?? 'cinematic-story')
  const [launcherState, setLauncherState] = useState<LauncherState>({
    status: 'idle',
  })
  const [validationMessage, setValidationMessage] = useState('')
  const [recentProjectsState, setRecentProjectsState] =
    useState<RecentProjectsState>({ status: 'loading' })
  const mountedRef = useRef(true)
  const operationIdRef = useRef(0)
  const activeOperationRef = useRef<LauncherOperation | undefined>(undefined)
  const recentListRequestIdRef = useRef(0)
  const recentListInFlightRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      operationIdRef.current += 1
      recentListRequestIdRef.current += 1
      recentListInFlightRef.current = false
      activeOperationRef.current?.abortController.abort()
      activeOperationRef.current = undefined
    }
  }, [])

  useEffect(() => {
    setSelectedRecipeId(requestedRecipeId ?? 'cinematic-story')
  }, [requestedRecipeId])

  const loadRecentProjects = useCallback(async () => {
    if (recentListInFlightRef.current) return
    recentListInFlightRef.current = true
    const requestId = ++recentListRequestIdRef.current
    setRecentProjectsState({ status: 'loading' })
    try {
      const projects = await repository.listRecent(6)
      if (
        mountedRef.current &&
        requestId === recentListRequestIdRef.current
      ) {
        setRecentProjectsState({ status: 'loaded', projects })
      }
    } catch {
      if (
        mountedRef.current &&
        requestId === recentListRequestIdRef.current
      ) {
        setRecentProjectsState({
          status: 'failed',
          message: '无法读取最近项目',
        })
      }
    } finally {
      if (requestId === recentListRequestIdRef.current) {
        recentListInFlightRef.current = false
      }
    }
  }, [repository])

  useEffect(() => {
    void loadRecentProjects()
  }, [loadRecentProjects])

  const beginOperation = (key: string): LauncherOperation | undefined => {
    if (
      activeOperationRef.current?.key === key &&
      !activeOperationRef.current.abortController.signal.aborted
    ) {
      return undefined
    }

    activeOperationRef.current?.abortController.abort()
    const operation = {
      id: ++operationIdRef.current,
      key,
      abortController: new AbortController(),
    }
    activeOperationRef.current = operation
    return operation
  }

  const isCurrentOperation = (operation: LauncherOperation) =>
    mountedRef.current &&
    operationIdRef.current === operation.id &&
    !operation.abortController.signal.aborted

  const finishOperation = (operation: LauncherOperation) => {
    if (activeOperationRef.current === operation) {
      activeOperationRef.current = undefined
    }
  }

  const persistAndOpen = async (
    project: Project,
    operation: LauncherOperation,
  ) => {
    await repository.save(project)
    if (!isCurrentOperation(operation)) return
    const hydrated = await useProjectStore
      .getState()
      .hydrate(project.id, repository, operation.abortController.signal)
    if (!isCurrentOperation(operation)) return
    if (!hydrated) throw new Error('未找到该项目')
    finishOperation(operation)
    navigate(`/project/${project.id}`)
  }

  const startRecipe = async () => {
    const trimmedIntent = intent.trim()
    if (!trimmedIntent) {
      setValidationMessage('请先描述短片主题')
      return
    }

    setValidationMessage('')
    const operation = beginOperation('recipe')
    if (!operation) return
    setLauncherState({
      status: 'parsing',
      abortController: operation.abortController,
    })

    try {
      await parseRecipe(
        selectedRecipeId,
        trimmedIntent,
        operation.abortController.signal,
      )
      if (!isCurrentOperation(operation)) return

      setLauncherState({ status: 'creating' })
      const recipe = recipeDefinitions.find(({ id }) => id === selectedRecipeId)!
      await persistAndOpen(buildRecipeProject(trimmedIntent, recipe), operation)
    } catch (error) {
      if (!isCurrentOperation(operation)) return
      finishOperation(operation)
      setLauncherState({
        status: 'failed',
        message: readableError(error),
        operation: { kind: 'recipe' },
      })
    }
  }

  const cancelParsing = () => {
    if (launcherState.status !== 'parsing') return
    launcherState.abortController.abort()
    operationIdRef.current += 1
    activeOperationRef.current = undefined
    setLauncherState({ status: 'idle' })
  }

  const openBlankCanvas = async () => {
    const operation = beginOperation('blank')
    if (!operation) return
    setLauncherState({ status: 'creating' })
    try {
      await persistAndOpen(
        createProject('空白项目', intent.trim()),
        operation,
      )
    } catch (error) {
      if (!isCurrentOperation(operation)) return
      finishOperation(operation)
      setLauncherState({
        status: 'failed',
        message: readableError(error),
        operation: { kind: 'blank' },
      })
    }
  }

  const openRecentProject = async (projectId: string) => {
    const operation = beginOperation(`recent:${projectId}`)
    if (!operation) return
    setLauncherState({ status: 'creating' })
    try {
      const hydrated = await useProjectStore
        .getState()
        .hydrate(projectId, repository, operation.abortController.signal)
      if (!isCurrentOperation(operation)) return
      if (!hydrated) throw new Error('未找到该项目')
      finishOperation(operation)
      navigate(`/project/${projectId}`)
    } catch (error) {
      if (!isCurrentOperation(operation)) return
      finishOperation(operation)
      setLauncherState({
        status: 'failed',
        message: readableError(error),
        operation: { kind: 'recent', projectId },
      })
    }
  }

  const openExampleProject = async () => {
    const operation = beginOperation('example')
    if (!operation) return
    setLauncherState({ status: 'creating' })
    try {
      await persistAndOpen(buildExampleProject(), operation)
    } catch (error) {
      if (!isCurrentOperation(operation)) return
      finishOperation(operation)
      setLauncherState({
        status: 'failed',
        message: readableError(error),
        operation: { kind: 'example' },
      })
    }
  }

  const openPromptCanvas = async (request: HomePromptRequest) => {
    const operation = beginOperation(`prompt:${request.key}`)
    if (!operation) return
    setLauncherState({ status: 'creating' })
    try {
      await persistAndOpen(
        createProject(request.title, request.prompt),
        operation,
      )
    } catch (error) {
      if (!isCurrentOperation(operation)) return
      finishOperation(operation)
      setLauncherState({
        status: 'failed',
        message: readableError(error),
        operation: { kind: 'prompt', request },
      })
    }
  }

  const retryFailedOperation = () => {
    if (launcherState.status !== 'failed') return

    switch (launcherState.operation.kind) {
      case 'recipe':
        void startRecipe()
        break
      case 'blank':
        void openBlankCanvas()
        break
      case 'recent':
        void openRecentProject(launcherState.operation.projectId)
        break
      case 'example':
        void openExampleProject()
        break
      case 'prompt':
        void openPromptCanvas(launcherState.operation.request)
        break
    }
  }

  const isParsing = launcherState.status === 'parsing'
  const isCreating = launcherState.status === 'creating'
  const isBusy = isParsing || isCreating

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

      <PlatformHomeSections
        contentRepository={homeContentRepository}
        communityRepository={communityRepository}
        disabled={isBusy}
        onStartPrompt={(request) => void openPromptCanvas(request)}
      />

      <section
        id="create-project"
        className="launcher-hero launcher-create"
        aria-labelledby="launcher-title"
      >
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
            disabled={isBusy}
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

          <fieldset className="launcher-recipes" disabled={isBusy}>
            <legend>选择创作配方</legend>
            <div className="launcher-recipes__grid">
              {recipeDefinitions.map((recipe) => (
                <RecipeRow
                  key={recipe.id}
                  {...recipe}
                  checked={selectedRecipeId === recipe.id}
                  disabled={isBusy}
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
                <Button onClick={retryFailedOperation}>重试</Button>
                {launcherState.operation.kind === 'recipe' ? (
                  <Button
                    className="launcher-button--secondary"
                    onClick={() => void openBlankCanvas()}
                  >
                    直接进入空白画布
                  </Button>
                ) : null}
              </div>
            </div>
          ) : isParsing ? (
            <div className="launcher-progress">
              <StatusText status="running" role="status" aria-live="polite">
                正在整理角色、场景与镜头结构
              </StatusText>
              <Button
                className="launcher-button--secondary"
                onClick={cancelParsing}
              >
                取消
              </Button>
            </div>
          ) : isCreating ? (
            <div className="launcher-progress">
              <StatusText status="saving" role="status" aria-live="polite">
                正在创建项目
              </StatusText>
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
          {recentProjectsState.status === 'loading' ? (
            <span>正在读取</span>
          ) : (
            <Link className="launcher-header__link focus-visible" to="/projects">
              查看全部项目
            </Link>
          )}
        </div>
        <div className="launcher-recent__list">
          {recentProjectsState.status === 'failed' ? (
            <div className="launcher-recent__error">
              <p className="launcher-message" role="alert">
                {recentProjectsState.message}
              </p>
              <Button
                className="launcher-button--secondary"
                onClick={() => void loadRecentProjects()}
              >
                重试加载最近项目
              </Button>
            </div>
          ) : recentProjectsState.status === 'loaded' &&
            recentProjectsState.projects.length ? (
            recentProjectsState.projects.map((project) => (
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
          ) : recentProjectsState.status === 'loaded' ? (
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
