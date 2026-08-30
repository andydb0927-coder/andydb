import { ArrowUpRight, FolderPlus, Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '../../ui/Button'
import type { Project } from '../project/model'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import {
  createCloudMigrationService,
  createHybridProjectStorage,
  type MigrationProgress,
  type ProjectCloudMigration,
} from '../project/cloud-storage'
import type { ProjectFolder, ProjectLocation } from './project-space-model'
import { ProjectSpaceRepository } from './project-space-repository'

type ProjectDirectoryRepository = Pick<ProjectRepository, 'listAll'>
type ProjectSpaceStore = Pick<
  ProjectSpaceRepository,
  'listFolders' | 'listLocations' | 'createFolder' | 'moveProject'
>

type DirectoryState =
  | { status: 'loading' }
  | {
      status: 'loaded'
      projects: Project[]
      folders: ProjectFolder[]
      locations: ProjectLocation[]
    }
  | { status: 'failed'; message: string }

type FolderFilter = 'all' | 'unclassified' | string
type ProjectSort = 'updated' | 'name'

const defaultDatabase = new WirelessCanvasDatabase()
const defaultLocalProjectRepository = new ProjectRepository(defaultDatabase)
const defaultProjectRepository = createHybridProjectStorage(defaultLocalProjectRepository)
const defaultCloudMigration = createCloudMigrationService(defaultLocalProjectRepository)
const defaultProjectSpaceRepository = new ProjectSpaceRepository(defaultDatabase)
const emptyProjects: Project[] = []
const emptyFolders: ProjectFolder[] = []
const emptyLocations: ProjectLocation[] = []

function readableError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '更新时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function projectThumbnail(project: Project) {
  return project.assets.find((asset) => asset.kind === 'image')
}

export interface ProjectsPageProps {
  projectRepository?: ProjectDirectoryRepository
  projectSpaceRepository?: ProjectSpaceStore
  cloudMigration?: ProjectCloudMigration
}

export function ProjectsPage({
  projectRepository = defaultProjectRepository,
  projectSpaceRepository = defaultProjectSpaceRepository,
  cloudMigration = defaultCloudMigration,
}: ProjectsPageProps) {
  const [directory, setDirectory] = useState<DirectoryState>({ status: 'loading' })
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ProjectSort>('updated')
  const [folderName, setFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [movingProjectId, setMovingProjectId] = useState<string>()
  const [actionMessage, setActionMessage] = useState('')
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress>()
  const [migrationMessage, setMigrationMessage] = useState('')
  const [migrating, setMigrating] = useState(false)
  const mountedRef = useRef(false)
  const requestIdRef = useRef(0)

  const loadDirectory = useCallback(
    async (showLoading = true) => {
      const requestId = ++requestIdRef.current
      if (showLoading) setDirectory({ status: 'loading' })
      try {
        const [projects, folders, locations] = await Promise.all([
          projectRepository.listAll(),
          projectSpaceRepository.listFolders(),
          projectSpaceRepository.listLocations(),
        ])
        if (mountedRef.current && requestId === requestIdRef.current) {
          setDirectory({ status: 'loaded', projects, folders, locations })
        }
      } catch (error) {
        if (!mountedRef.current || requestId !== requestIdRef.current) return
        if (showLoading) {
          setDirectory({
            status: 'failed',
            message: readableError(error, '无法读取本地项目空间'),
          })
        } else {
          setActionMessage(readableError(error, '无法刷新项目空间'))
        }
      }
    },
    [projectRepository, projectSpaceRepository],
  )

  useEffect(() => {
    mountedRef.current = true
    void loadDirectory()
    return () => {
      mountedRef.current = false
      requestIdRef.current += 1
    }
  }, [loadDirectory])

  const projects = directory.status === 'loaded' ? directory.projects : emptyProjects
  const folders = directory.status === 'loaded' ? directory.folders : emptyFolders
  const locations = directory.status === 'loaded' ? directory.locations : emptyLocations
  const folderByProjectId = useMemo(
    () => new Map(locations.map((location) => [location.projectId, location.folderId])),
    [locations],
  )

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const project of projects) {
      const folderId = folderByProjectId.get(project.id)
      if (folderId) counts.set(folderId, (counts.get(folderId) ?? 0) + 1)
    }
    return counts
  }, [folderByProjectId, projects])

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return projects
      .filter((project) => {
        const projectFolderId = folderByProjectId.get(project.id)
        if (folderFilter === 'unclassified' && projectFolderId) return false
        if (folderFilter !== 'all' && folderFilter !== 'unclassified' && projectFolderId !== folderFilter) {
          return false
        }
        if (!normalizedQuery) return true
        return `${project.title} ${project.intent}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      })
      .sort((left, right) =>
        sort === 'name'
          ? left.title.localeCompare(right.title, 'zh-CN')
          : right.updatedAt.localeCompare(left.updatedAt),
      )
  }, [folderByProjectId, folderFilter, projects, query, sort])

  const createFolder = async () => {
    if (creatingFolder) return
    setCreatingFolder(true)
    setActionMessage('')
    try {
      await projectSpaceRepository.createFolder(folderName)
      if (!mountedRef.current) return
      setFolderName('')
      await loadDirectory(false)
    } catch (error) {
      if (mountedRef.current) {
        setActionMessage(readableError(error, '无法创建文件夹'))
      }
    } finally {
      if (mountedRef.current) setCreatingFolder(false)
    }
  }

  const moveProject = async (projectId: string, folderId: string) => {
    if (movingProjectId) return
    setMovingProjectId(projectId)
    setActionMessage('')
    try {
      await projectSpaceRepository.moveProject(projectId, folderId || undefined)
      await loadDirectory(false)
    } catch (error) {
      if (mountedRef.current) {
        setActionMessage(readableError(error, '无法更新项目分类'))
      }
    } finally {
      if (mountedRef.current) setMovingProjectId(undefined)
    }
  }

  const migrateProjects = async () => {
    if (!cloudMigration?.enabled || migrating) return
    setMigrating(true)
    setMigrationMessage('')
    setMigrationProgress(undefined)
    try {
      const summary = await cloudMigration.migrate((progress) => {
        if (mountedRef.current) setMigrationProgress(progress)
      })
      if (!mountedRef.current) return
      setMigrationMessage(
        summary.failed
          ? `迁移完成：${summary.succeeded} 个成功，${summary.skipped} 个已是最新，${summary.failed} 个失败；本地数据均已保留。${summary.failures[0]?.projectTitle ?? '项目'}：${summary.failures[0]?.message ?? '云端暂不可用'}`
          : `迁移完成：${summary.succeeded} 个成功，${summary.skipped} 个已是最新`,
      )
      await loadDirectory(false)
    } catch (error) {
      if (mountedRef.current) {
        setMigrationMessage(readableError(error, '迁移未完成，本地数据已保留'))
      }
    } finally {
      if (mountedRef.current) setMigrating(false)
    }
  }

  return (
    <main className="platform-page projects-page">
      <header className="projects-page__header">
        <div>
          <p className="platform-page__eyebrow">LOCAL PROJECT SPACE</p>
          <h1>全部项目</h1>
          <p>
            {directory.status === 'loaded'
              ? `当前设备上的 ${projects.length} 个项目`
              : '整理当前设备上的创作项目'}
          </p>
          <p className="projects-page__boundary">
            {cloudMigration?.enabled
              ? '项目优先保存在当前浏览器；云端不可用时仍可继续创作。'
              : '数据保存在当前浏览器，不会自动同步到云端。'}
          </p>
        </div>
        <div className="projects-page__header-actions">
          {cloudMigration?.enabled ? (
            <Button disabled={migrating || directory.status !== 'loaded'} onClick={() => void migrateProjects()}>
              {migrating ? '正在迁移' : '迁移到云端'}
            </Button>
          ) : null}
          <Link className="projects-page__create focus-visible" to="/projects/new">
            <Plus aria-hidden="true" />
            开始创作
          </Link>
        </div>
      </header>

      {cloudMigration?.enabled && (migrationProgress || migrationMessage) ? (
        <div className="projects-page__migration" role="status">
          {migrating && migrationProgress ? (
            <>
              <progress value={migrationProgress.completed} max={migrationProgress.total} />
              <span>
                正在迁移 {migrationProgress.projectTitle}（{migrationProgress.completed}/{migrationProgress.total}）
              </span>
            </>
          ) : migrationMessage}
        </div>
      ) : null}

      {directory.status === 'loading' ? (
        <div className="platform-page__state" role="status">正在读取本地项目…</div>
      ) : directory.status === 'failed' ? (
        <div className="platform-page__state projects-page__load-error">
          <p role="alert">{directory.message}</p>
          <Button onClick={() => void loadDirectory()}>重试</Button>
        </div>
      ) : (
        <div className="projects-page__layout">
          <aside className="projects-folders" aria-label="项目文件夹">
            <div className="projects-folders__filters">
              <button
                aria-current={folderFilter === 'all' ? 'page' : undefined}
                type="button"
                onClick={() => setFolderFilter('all')}
              >
                <span>全部项目</span><span>{projects.length}</span>
              </button>
              <button
                aria-current={folderFilter === 'unclassified' ? 'page' : undefined}
                type="button"
                onClick={() => setFolderFilter('unclassified')}
              >
                <span>未归类</span>
                <span>{projects.filter((project) => !folderByProjectId.has(project.id)).length}</span>
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  aria-current={folderFilter === folder.id ? 'page' : undefined}
                  type="button"
                  onClick={() => setFolderFilter(folder.id)}
                >
                  <span>{folder.name}</span><span>{folderCounts.get(folder.id) ?? 0}</span>
                </button>
              ))}
            </div>
            <form
              className="projects-folders__create"
              onSubmit={(event) => {
                event.preventDefault()
                void createFolder()
              }}
            >
              <label htmlFor="project-folder-name">文件夹名称</label>
              <input
                id="project-folder-name"
                className="focus-visible"
                value={folderName}
                disabled={creatingFolder}
                onChange={(event) => setFolderName(event.target.value)}
              />
              <Button disabled={creatingFolder} type="submit">
                <FolderPlus aria-hidden="true" />
                {creatingFolder ? '正在创建' : '新建文件夹'}
              </Button>
            </form>
          </aside>

          <section className="projects-directory" aria-label="项目目录">
            <div className="projects-directory__tools">
              <label className="projects-directory__search">
                <span>搜索项目</span>
                <span className="projects-directory__search-control">
                  <Search aria-hidden="true" />
                  <input
                    aria-label="搜索项目"
                    className="focus-visible"
                    type="search"
                    value={query}
                    placeholder="搜索标题或创作意图"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </span>
              </label>
              <label>
                <span>项目排序</span>
                <select
                  aria-label="项目排序"
                  className="focus-visible"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as ProjectSort)}
                >
                  <option value="updated">最近更新</option>
                  <option value="name">名称</option>
                </select>
              </label>
            </div>

            {actionMessage ? <p className="projects-page__error" role="alert">{actionMessage}</p> : null}

            <div className="projects-grid">
              <Link
                aria-label="新建项目"
                className="project-create-card focus-visible"
                to="/projects/new"
              >
                <span className="project-create-card__icon"><Plus aria-hidden="true" /></span>
                <strong>开始创作</strong>
                <span>创建新的视频项目</span>
              </Link>
              {visibleProjects.map((project) => {
                const thumbnail = projectThumbnail(project)
                const titleId = `project-card-title-${project.id}`
                return (
                  <article
                    key={project.id}
                    className="project-directory-card"
                    aria-labelledby={titleId}
                  >
                    <div className="project-directory-card__thumbnail">
                      {thumbnail ? (
                        <img src={thumbnail.url} alt={`${project.title} 缩略图`} />
                      ) : (
                        <span role="img" aria-label={`${project.title} 缩略图`}>
                          {project.title.slice(0, 1)}
                        </span>
                      )}
                    </div>
                    <div className="project-directory-card__heading">
                      <div>
                        <h2 id={titleId}>
                          {project.title}
                          {cloudMigration?.isMigrated(project) ? (
                            <span className="project-directory-card__cloud-status">已迁移</span>
                          ) : null}
                        </h2>
                        <p>{formatUpdatedAt(project.updatedAt)}</p>
                      </div>
                      <span>{project.nodes.length} 节点 · {project.assets.length} 素材</span>
                    </div>
                    <p className="project-directory-card__intent">
                      {project.intent || '尚未填写创作意图'}
                    </p>
                    <div className="project-directory-card__actions">
                      <label>
                        <span>项目分类</span>
                        <select
                          aria-label={`分类 ${project.title}`}
                          className="focus-visible"
                          value={folderByProjectId.get(project.id) ?? ''}
                          disabled={Boolean(movingProjectId)}
                          onChange={(event) => void moveProject(project.id, event.target.value)}
                        >
                          <option value="">未归类</option>
                          {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>{folder.name}</option>
                          ))}
                        </select>
                      </label>
                      <Link
                        aria-label={`打开 ${project.title}`}
                        className="focus-visible"
                        to={`/project/${project.id}`}
                      >
                        打开项目
                        <ArrowUpRight aria-hidden="true" />
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
            {!visibleProjects.length ? (
              <div className="projects-directory__empty">
                <h2>这里还没有匹配的项目</h2>
                <p>调整搜索条件或文件夹筛选，也可以从平台首页开始新创作。</p>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </main>
  )
}
