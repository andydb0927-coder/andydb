export type CollaboratorRole = 'owner' | 'editor' | 'viewer'
export type CommentTargetType = 'node' | 'clip'
export type CollaboratorCapability =
  | 'edit-project'
  | 'comment'
  | 'resolve-comments'
  | 'manage-members'
  | 'export-project'

export const collaboratorCapabilities: CollaboratorCapability[] = [
  'edit-project',
  'comment',
  'resolve-comments',
  'manage-members',
  'export-project',
]

const collaboratorPermissionMatrix: Record<
  CollaboratorRole,
  Record<CollaboratorCapability, boolean>
> = {
  owner: {
    'edit-project': true,
    comment: true,
    'resolve-comments': true,
    'manage-members': true,
    'export-project': true,
  },
  editor: {
    'edit-project': true,
    comment: true,
    'resolve-comments': true,
    'manage-members': false,
    'export-project': true,
  },
  viewer: {
    'edit-project': false,
    comment: true,
    'resolve-comments': false,
    'manage-members': false,
    'export-project': false,
  },
}

export function canCollaborator(
  role: CollaboratorRole,
  capability: CollaboratorCapability,
) {
  return collaboratorPermissionMatrix[role][capability]
}

export interface Collaborator {
  id: string
  projectId: string
  name: string
  role: CollaboratorRole
  createdAt: string
  updatedAt: string
}

export interface ChangeComment {
  id: string
  projectId: string
  targetType: CommentTargetType
  targetId: string
  body: string
  authorName: string
  status: 'open' | 'resolved'
  createdAt: string
  updatedAt: string
}

export interface CollaborationEnvironment {
  now(): string
  randomId(): string
}

export const defaultCollaborationEnvironment: CollaborationEnvironment = {
  now: () => new Date().toISOString(),
  randomId: () => crypto.randomUUID(),
}

export function createLocalOwner(
  projectId: string,
  environment: CollaborationEnvironment = defaultCollaborationEnvironment,
): Collaborator {
  const timestamp = environment.now()
  return {
    id: `${projectId}:local-owner`,
    projectId,
    name: '本机所有者',
    role: 'owner',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function buildCollaborator(
  projectId: string,
  name: string,
  role: Exclude<CollaboratorRole, 'owner'>,
  environment: CollaborationEnvironment = defaultCollaborationEnvironment,
): Collaborator {
  const normalizedName = name.trim()
  if (!normalizedName) throw new Error('请输入协作者名称')
  const timestamp = environment.now()
  return {
    id: environment.randomId(),
    projectId,
    name: normalizedName,
    role,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function buildChangeComment(
  projectId: string,
  targetType: CommentTargetType,
  targetId: string,
  body: string,
  environment: CollaborationEnvironment = defaultCollaborationEnvironment,
): ChangeComment {
  const normalizedBody = body.trim()
  if (!normalizedBody) throw new Error('请输入评论内容')
  if (!targetId.trim()) throw new Error('评论目标不可为空')
  const timestamp = environment.now()
  return {
    id: environment.randomId(),
    projectId,
    targetType,
    targetId,
    body: normalizedBody,
    authorName: '本机所有者',
    status: 'open',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
