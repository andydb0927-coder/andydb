import type { WirelessCanvasDatabase } from '../project/project-repository'
import {
  normalizeSubjectTags,
  type CreateSubjectInput,
  type SubjectAsset,
} from './subject-model'

export interface SubjectEnvironment {
  now(): string
  randomId(): string
}

const defaultEnvironment: SubjectEnvironment = {
  now: () => new Date().toISOString(),
  randomId: () => crypto.randomUUID(),
}

function normalizedSubjectInput(input: CreateSubjectInput) {
  const name = input.name.trim().slice(0, 80)
  if (!name) throw new Error('请输入主体名称。')
  if (!input.coverUrl.trim()) throw new Error('主体缺少可用样本图。')
  const sampleImages = [...new Set(
    [input.coverUrl, ...input.sampleImages].map((value) => value.trim()).filter(Boolean),
  )].slice(0, 8)
  return {
    ...input,
    name,
    description: input.description.trim().slice(0, 400),
    coverUrl: input.coverUrl.trim(),
    sampleImages,
    tags: normalizeSubjectTags(input.tags),
  }
}

export class SubjectRepository {
  private readonly database: WirelessCanvasDatabase
  private readonly environment: SubjectEnvironment

  constructor(
    database: WirelessCanvasDatabase,
    environment: SubjectEnvironment = defaultEnvironment,
  ) {
    this.database = database
    this.environment = environment
  }

  async create(input: CreateSubjectInput): Promise<SubjectAsset> {
    const normalized = normalizedSubjectInput(input)
    const timestamp = this.environment.now()
    const subject: SubjectAsset = {
      ...normalized,
      id: this.environment.randomId(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.database.subjects.put(subject)
    return subject
  }

  async get(subjectId: string): Promise<SubjectAsset | undefined> {
    return this.database.subjects.get(subjectId)
  }

  async list(): Promise<SubjectAsset[]> {
    return this.database.subjects.orderBy('updatedAt').reverse().toArray()
  }

  async update(
    subjectId: string,
    changes: Pick<SubjectAsset, 'name' | 'description' | 'tags'>,
  ): Promise<SubjectAsset> {
    const subject = await this.database.subjects.get(subjectId)
    if (!subject) throw new Error('主体不存在或已删除。')
    const normalized = normalizedSubjectInput({ ...subject, ...changes })
    const updated: SubjectAsset = {
      ...subject,
      ...normalized,
      updatedAt: this.environment.now(),
    }
    await this.database.subjects.put(updated)
    return updated
  }

  async delete(subjectId: string): Promise<boolean> {
    const count = await this.database.subjects.where('id').equals(subjectId).delete()
    return count > 0
  }
}
