import type { WirelessCanvasDatabase } from '../project/project-repository'
import type { LibraryAssetRecord } from './library-model'

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

  async findByFingerprint(
    fingerprint: string,
  ): Promise<LibraryAssetRecord | undefined> {
    return this.database.libraryAssets.where('fingerprint').equals(fingerprint).first()
  }
}
