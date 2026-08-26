import type { WirelessCanvasDatabase } from '../project/project-repository'
import type { Project } from '../project/model'
import {
  detachLibraryAssetFromProject,
  type LibraryAssetFolderId,
  type LibraryAssetRecord,
} from './library-model'
import {
  fingerprintAssetFile,
  readAssetFileAsDataUrl,
  validateAssetFile,
} from './asset-import'

export type DeleteLibraryAssetResult =
  | { status: 'deleted'; projectIds?: string[]; nodeTitles?: string[] }
  | { status: 'missing' }
  | { status: 'referenced'; projectIds: string[]; nodeTitles?: string[] }

function projectReferencesAsset(
  project: Project,
  assetId: string,
) {
  return (
    project.assets.some((asset) => asset.id === assetId) ||
    project.nodes.some(
      (node) =>
        node.card?.imageAssetId === assetId ||
        node.versions.some((version) => version.assetId === assetId) ||
        node.imageResults?.some((result) => result.assetId === assetId),
    ) ||
    project.jobs.some((job) => job.assetId === assetId) ||
    project.exportJobs.some((job) => job.assetId === assetId)
  )
}

export class AssetLibraryRepository {
  private readonly database: WirelessCanvasDatabase

  constructor(database: WirelessCanvasDatabase) {
    this.database = database
  }

  async list(): Promise<LibraryAssetRecord[]> {
    return this.database.libraryAssets.orderBy('createdAt').reverse().toArray()
  }

  async load(assetId: string): Promise<LibraryAssetRecord | undefined> {
    return this.database.libraryAssets.get(assetId)
  }

  async save(record: LibraryAssetRecord): Promise<void> {
    await this.database.libraryAssets.put(record)
  }

  async rename(assetId: string, name: string): Promise<LibraryAssetRecord> {
    const nextName = name.trim()
    if (!nextName) throw new Error('素材名称不能为空。')
    const record = await this.database.libraryAssets.get(assetId)
    if (!record) throw new Error('素材不存在或已删除。')
    const next = { ...record, name: nextName }
    await this.database.libraryAssets.put(next)
    return next
  }

  async move(
    assetId: string,
    folderId: LibraryAssetFolderId,
  ): Promise<LibraryAssetRecord> {
    const record = await this.database.libraryAssets.get(assetId)
    if (!record) throw new Error('素材不存在或已删除。')
    const next = { ...record, folderId }
    await this.database.libraryAssets.put(next)
    return next
  }

  async deleteUnreferenced(
    assetId: string,
  ): Promise<DeleteLibraryAssetResult> {
    const result = await this.deleteAsset(assetId)
    if (result.status === 'referenced') {
      return { status: 'referenced', projectIds: result.projectIds }
    }
    if (result.status === 'deleted') return { status: 'deleted' }
    return result
  }

  async deleteAsset(
    assetId: string,
    options: { detachReferences?: boolean } = {},
  ): Promise<DeleteLibraryAssetResult> {
    return this.database.transaction(
      'rw',
      this.database.projects,
      this.database.libraryAssets,
      async () => {
        const record = await this.database.libraryAssets.get(assetId)
        if (!record) return { status: 'missing' }

        const projects = await this.database.projects.toArray()
        const referencedProjects = projects.filter((project) =>
          projectReferencesAsset(project, assetId),
        )
        const projectIds = referencedProjects.map((project) => project.id)
        const nodeTitles = [
          ...new Set(
            referencedProjects.flatMap((project) =>
              project.nodes
                .filter(
                  (node) =>
                    node.card?.imageAssetId === assetId ||
                    node.versions.some((version) => version.assetId === assetId) ||
                    node.imageResults?.some((result) => result.assetId === assetId),
                )
                .map((node) => node.title),
            ),
          ),
        ]
        if (projectIds.length > 0 && !options.detachReferences) {
          return { status: 'referenced', projectIds, nodeTitles }
        }

        if (projectIds.length > 0) {
          await this.database.projects.bulkPut(
            referencedProjects.map((project) =>
              detachLibraryAssetFromProject(project, assetId),
            ),
          )
        }

        await this.database.libraryAssets.delete(assetId)
        return projectIds.length > 0
          ? { status: 'deleted', projectIds, nodeTitles }
          : { status: 'deleted' }
      },
    )
  }

  async importFile(
    file: File,
  ): Promise<{ status: 'created' | 'existing'; record: LibraryAssetRecord }> {
    validateAssetFile(file)

    const fingerprint = await fingerprintAssetFile(file)
    const existing = await this.findByFingerprint(fingerprint)
    if (existing) {
      return { status: 'existing', record: existing }
    }

    const record: LibraryAssetRecord = {
      id: crypto.randomUUID(),
      name: file.name,
      kind: file.type.split('/')[0] as LibraryAssetRecord['kind'],
      mimeType: file.type,
      url: await readAssetFileAsDataUrl(file),
      createdAt: new Date().toISOString(),
      source: 'upload',
      folderId: 'project',
      fingerprint,
      byteSize: file.size,
    }

    try {
      await this.database.libraryAssets.add(record)
      return { status: 'created', record }
    } catch (error) {
      const concurrentRecord = await this.findByFingerprint(fingerprint)
      if (concurrentRecord) {
        return { status: 'existing', record: concurrentRecord }
      }

      throw error
    }
  }

  async findByFingerprint(
    fingerprint: string,
  ): Promise<LibraryAssetRecord | undefined> {
    return this.database.libraryAssets.where('fingerprint').equals(fingerprint).first()
  }
}
