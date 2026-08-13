import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { createProject, type Project } from '../project/model'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import {
  buildExampleProject,
  exampleProject,
} from '../project/example-project'
import { useProjectStore } from '../project/project-store'
import { Button } from '../../ui/Button'
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

type LauncherState =
  | { status: 'idle' }
  | { status: 'creating' }
  | { status: 'failed'; message: string; operation: RetryOperation }

type RetryOperation =
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

function readableError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : '暂时无法完成此操作'
}

export interface ProjectLauncherPageProps {
  repository?: LauncherRepository
  homeContentRepository?: PlatformHomeContentRepository
  communityRepository?: LauncherCommunityRepository
}

export function ProjectLauncherPage({
  repository = defaultRepository,
  homeContentRepository = defaultHomeContentRepository,
  communityRepository = defaultCommunityRepository,
}: ProjectLauncherPageProps) {
  const navigate = useNavigate()
  const [launcherState, setLauncherState] = useState<LauncherState>({
    status: 'idle',
  })
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

  const isBusy = launcherState.status === 'creating'

  return (
    <main className="launcher-page">
      <header className="launcher-header">
        <Link className="launcher-brand focus-visible" to="/">
          无线画布
        </Link>
        <nav className="launcher-header__actions" aria-label="首页账户入口">
          <Link className="launcher-header__link focus-visible" to="/account#credits">
            积分超市
          </Link>
          <Link className="launcher-header__membership focus-visible" to="/account#membership">
            开通会员
          </Link>
          <Link className="launcher-account focus-visible" to="/account">
            注册/登录
          </Link>
        </nav>
      </header>

      <PlatformHomeSections
        contentRepository={homeContentRepository}
        communityRepository={communityRepository}
        disabled={isBusy}
        onStartPrompt={(request) => void openPromptCanvas(request)}
      />

      {launcherState.status === 'failed' ? (
        <div className="launcher-progress launcher-operation-state">
          <p className="launcher-message" role="alert">
            {launcherState.message}
          </p>
          <Button
            className="launcher-button--secondary"
            onClick={retryFailedOperation}
          >
            重试
          </Button>
        </div>
      ) : launcherState.status === 'creating' ? (
        <p
          className="launcher-progress launcher-operation-state"
          role="status"
          aria-live="polite"
        >
          正在打开画布…
        </p>
      ) : null}

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

      <footer id="help" className="launcher-help" aria-labelledby="launcher-help-title">
        <div>
          <p className="launcher-eyebrow">LOCAL DEMO · HELP</p>
          <h2 id="launcher-help-title">从一个真实入口继续创作</h2>
          <p>所有演示内容保存在当前浏览器；不会连接 LibTV、消耗积分或发起真实购买。</p>
        </div>
        <nav aria-label="首页帮助链接">
          <Link to="/projects">查看项目</Link>
          <Link to="/agents">浏览 Skills</Link>
          <Link to="/discover">打开作品墙</Link>
        </nav>
      </footer>
    </main>
  )
}
