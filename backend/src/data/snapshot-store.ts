export interface SnapshotStore {
  put(key: string, value: string): Promise<void>
  get(key: string): Promise<string | null>
  delete(key: string): Promise<void>
}

export class KvSnapshotStore implements SnapshotStore {
  constructor(private readonly namespace: KVNamespace) {}

  async put(key: string, value: string) {
    await this.namespace.put(key, value)
  }

  async get(key: string) {
    return this.namespace.get(key, 'text')
  }

  async delete(key: string) {
    await this.namespace.delete(key)
  }
}
