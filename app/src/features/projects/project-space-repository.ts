import Dexie from 'dexie'

import type { WirelessCanvasDatabase } from '../project/project-repository'
import type { ProjectFolder, ProjectLocation } from './project-space-model'

interface ProjectSpaceRepositoryOptions {
  now?: () => string
  randomId?: () => string
}

function normalizeFolderName(name: string): string {
  return name.trim().toLocaleLowerCase()
}

export class ProjectSpaceRepository {
  private readonly database: WirelessCanvasDatabase
  private readonly now: () => string
  private readonly randomId: () => string

  constructor(
    database: WirelessCanvasDatabase,
    options: ProjectSpaceRepositoryOptions = {},
  ) {
    this.database = database
    this.now = options.now ?? (() => new Date().toISOString())
    this.randomId = options.randomId ?? (() => crypto.randomUUID())
  }

  async listFolders(): Promise<ProjectFolder[]> {
    const folders = await this.database.projectFolders.toArray()
    return folders.sort((left, right) =>
      left.name.localeCompare(right.name, 'zh-CN'),
    )
  }

  async listLocations(): Promise<ProjectLocation[]> {
    return this.database.projectLocations.toArray()
  }

  async createFolder(input: string): Promise<ProjectFolder> {
    const name = input.trim()
    if (!name) throw new Error('请输入文件夹名称')

    const timestamp = this.now()
    const folder: ProjectFolder = {
      id: this.randomId(),
      name,
      normalizedName: normalizeFolderName(name),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    try {
      await this.database.transaction(
        'rw',
        this.database.projectFolders,
        async () => {
          const existing = await this.database.projectFolders
            .where('normalizedName')
            .equals(folder.normalizedName)
            .first()
          if (existing) throw new Error('文件夹名称已存在')
          await this.database.projectFolders.add(folder)
        },
      )
    } catch (error) {
      if (error instanceof Dexie.ConstraintError) {
        throw new Error('文件夹名称已存在')
      }
      throw error
    }

    return folder
  }

  async moveProject(projectId: string, folderId?: string): Promise<void> {
    await this.database.transaction(
      'rw',
      this.database.projects,
      this.database.projectFolders,
      this.database.projectLocations,
      async () => {
        if (!(await this.database.projects.get(projectId))) {
          throw new Error('项目不存在')
        }
        if (folderId && !(await this.database.projectFolders.get(folderId))) {
          throw new Error('文件夹不存在')
        }

        if (!folderId) {
          await this.database.projectLocations.delete(projectId)
          return
        }

        await this.database.projectLocations.put({
          projectId,
          folderId,
          updatedAt: this.now(),
        })
      },
    )
  }
}
