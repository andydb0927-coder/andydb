import type { WirelessCanvasDatabase } from '../project/project-repository'
import {
  buildChangeComment,
  buildCollaborator,
  createLocalOwner,
  defaultCollaborationEnvironment,
  type CollaborationEnvironment,
  type Collaborator,
  type CollaboratorRole,
  type CommentTargetType,
} from './collaboration-model'

function nextCommentVersion(current: string, candidate: string) {
  const currentTime = Date.parse(current)
  const candidateTime = Date.parse(candidate)
  if (Number.isFinite(currentTime) && Number.isFinite(candidateTime) && candidateTime <= currentTime) {
    return new Date(currentTime + 1).toISOString()
  }
  return candidate
}

export class CollaborationRepository {
  private readonly database: WirelessCanvasDatabase
  private readonly environment: CollaborationEnvironment

  constructor(
    database: WirelessCanvasDatabase,
    environment: CollaborationEnvironment = defaultCollaborationEnvironment,
  ) {
    this.database = database
    this.environment = environment
  }

  async ensureOwner(projectId: string) {
    const id = `${projectId}:local-owner`
    const existing = await this.database.collaborators.get(id)
    if (existing) return existing
    const owner = createLocalOwner(projectId, this.environment)
    await this.database.collaborators.put(owner)
    return owner
  }

  async listCollaborators(projectId: string) {
    await this.ensureOwner(projectId)
    const records = await this.database.collaborators
      .where('projectId')
      .equals(projectId)
      .toArray()
    return records.sort(
      (left, right) =>
        Number(right.role === 'owner') - Number(left.role === 'owner') ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    )
  }

  async addCollaborator(
    projectId: string,
    name: string,
    role: Exclude<CollaboratorRole, 'owner'>,
  ) {
    const collaborator = buildCollaborator(projectId, name, role, this.environment)
    await this.database.collaborators.add(collaborator)
    return collaborator
  }

  async updateRole(id: string, role: Exclude<CollaboratorRole, 'owner'>) {
    return this.database.transaction('rw', this.database.collaborators, async () => {
      const current = await this.database.collaborators.get(id)
      if (!current) throw new Error('未找到协作者')
      if (current.role === 'owner') throw new Error('不能修改所有者角色')
      const next: Collaborator = {
        ...current,
        role,
        updatedAt: this.environment.now(),
      }
      await this.database.collaborators.put(next)
      return next
    })
  }

  async removeCollaborator(id: string) {
    const current = await this.database.collaborators.get(id)
    if (!current) return
    if (current.role === 'owner') throw new Error('不能移除所有者')
    await this.database.collaborators.delete(id)
  }

  async listComments(
    projectId: string,
    targetType?: CommentTargetType,
    targetId?: string,
  ) {
    const comments = await this.database.changeComments
      .where('projectId')
      .equals(projectId)
      .toArray()
    return comments
      .filter((comment) => !targetType || comment.targetType === targetType)
      .filter((comment) => !targetId || comment.targetId === targetId)
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      )
  }

  async addComment(
    projectId: string,
    targetType: CommentTargetType,
    targetId: string,
    body: string,
  ) {
    const comment = buildChangeComment(
      projectId,
      targetType,
      targetId,
      body,
      this.environment,
    )
    await this.database.changeComments.add(comment)
    return comment
  }

  async resolveComment(id: string) {
    return this.database.transaction('rw', this.database.changeComments, async () => {
      const current = await this.database.changeComments.get(id)
      if (!current) throw new Error('未找到评论')
      const next = {
        ...current,
        status: 'resolved' as const,
        updatedAt: this.environment.now(),
      }
      await this.database.changeComments.put(next)
      return next
    })
  }

  async updateComment(id: string, body: string, expectedUpdatedAt: string) {
    const normalizedBody = body.trim()
    if (!normalizedBody) throw new Error('请输入评论内容')
    return this.database.transaction('rw', this.database.changeComments, async () => {
      const current = await this.database.changeComments.get(id)
      if (!current) throw new Error('未找到评论')
      if (current.updatedAt !== expectedUpdatedAt) {
        throw new Error('评论已被其他操作更新，请刷新后重试')
      }
      const next = {
        ...current,
        body: normalizedBody,
        updatedAt: nextCommentVersion(current.updatedAt, this.environment.now()),
      }
      await this.database.changeComments.put(next)
      return next
    })
  }

  async deleteComment(id: string, expectedUpdatedAt: string) {
    return this.database.transaction('rw', this.database.changeComments, async () => {
      const current = await this.database.changeComments.get(id)
      if (!current) throw new Error('未找到评论')
      if (current.updatedAt !== expectedUpdatedAt) {
        throw new Error('评论已被其他操作更新，请刷新后重试')
      }
      await this.database.changeComments.delete(id)
    })
  }
}
