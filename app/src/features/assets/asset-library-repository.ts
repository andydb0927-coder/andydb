import type { WirelessCanvasDatabase } from '../project/project-repository'
import type { Project } from '../project/model'
import type { LibraryAssetRecord } from './library-model'
import {
  fingerprintAssetFile,
  readAssetFileAsDataUrl,
  validateAssetFile,
} from './asset-import'

export type DeleteLibraryAssetResult =
  | { status: 'deleted' }
  | { status: 'missing' }
  | { status: 'referenced'; projectIds: string[] }

function projectReferencesAsset(
  project: Project,
  assetId: string,
) {
  return (
    project.assets.some((asset) => asset.id === assetId) ||
    project.nodes.some(
      (node) =>
        node.card?.imageAssetId === assetId ||
        node.versions.some((version) => version.assetId === assetId),
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

  async deleteUnreferenced(
    assetId: string,
  ): Promise<DeleteLibraryAssetResult> {
    return this.database.transaction(
      'rw',
      this.database.projects,
      this.database.libraryAssets,
      async () => {
        const record = await this.database.libraryAssets.get(assetId)
        if (!record) return { status: 'missing' }

        const projects = await this.database.projects.toArray()
        const projectIds = projects
          .filter((project) => projectReferencesAsset(project, assetId))
          .map((project) => project.id)
        if (projectIds.length > 0) {
          return { status: 'referenced', projectIds }
        }

        await this.database.libraryAssets.delete(assetId)
        return { status: 'deleted' }
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
