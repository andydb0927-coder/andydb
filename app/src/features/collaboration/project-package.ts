import type { LibraryAssetRecord } from '../assets/library-model'
import type { Project } from '../project/model'
import type { TimelineProject } from '../timeline/timeline-project'
import type { ChangeComment, Collaborator } from './collaboration-model'

export interface LocalProjectPackage {
  kind: 'wireless-canvas-project'
  schemaVersion: 1
  exportedAt: string
  project: Project
  timeline?: TimelineProject
  libraryAssets: LibraryAssetRecord[]
  collaboration: {
    collaborators: Collaborator[]
    comments: ChangeComment[]
  }
}

export interface LocalWorkspacePackage {
  kind: 'wireless-canvas-workspace'
  schemaVersion: 1
  exportedAt: string
  projects: LocalProjectPackage[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function validatePackage(value: unknown): asserts value is LocalProjectPackage {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('不支持的项目包版本')
  }
  if (value.kind !== 'wireless-canvas-project') {
    throw new Error('不是无线画布项目包')
  }
  const project = value.project
  if (
    !isRecord(project) ||
    typeof project.id !== 'string' ||
    !Array.isArray(project.nodes) ||
    !Array.isArray(project.assets) ||
    !Array.isArray(project.timeline) ||
    !Array.isArray(value.libraryAssets) ||
    !isRecord(value.collaboration) ||
    !Array.isArray(value.collaboration.collaborators) ||
    !Array.isArray(value.collaboration.comments)
  ) {
    throw new Error('项目包结构无效')
  }
  const collaboration = value.collaboration as LocalProjectPackage['collaboration']
  if (
    [...collaboration.collaborators, ...collaboration.comments].some(
      ({ projectId }) => projectId !== project.id,
    )
  ) {
    throw new Error('项目包协作记录不属于当前项目')
  }
}

export function serializeProjectPackage(value: LocalProjectPackage) {
  return JSON.stringify(value, null, 2)
}

export function parseProjectPackage(json: string): LocalProjectPackage {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('无法解析项目包 JSON')
  }
  validatePackage(value)
  return value
}

export function createShareLink(
  value: LocalProjectPackage,
  baseUrl = typeof window === 'undefined'
    ? 'http://localhost/account'
    : `${window.location.origin}/account`,
) {
  const url = new URL(baseUrl)
  url.hash = `local-share=${encodeURIComponent(serializeProjectPackage(value))}`
  return url.toString()
}

export function projectPackageFromShareLink(link: string) {
  const url = new URL(link)
  const prefix = '#local-share='
  if (!url.hash.startsWith(prefix)) throw new Error('链接中没有本地项目包')
  return parseProjectPackage(decodeURIComponent(url.hash.slice(prefix.length)))
}

export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
