import type { EdgeKvNamespace, EdgeKvListOptions, EdgeKvListResult } from '../src/data/edgekv-namespace'

export class MemoryEdgeKv implements EdgeKvNamespace {
  readonly values = new Map<string, string>()

  async get(key: string) {
    return this.values.get(key) ?? null
  }

  async put(key: string, value: string) {
    this.values.set(key, value)
  }

  async delete(key: string) {
    this.values.delete(key)
  }

  async list(options: EdgeKvListOptions = {}): Promise<EdgeKvListResult> {
    const keys = [...this.values.keys()]
      .filter((key) => !options.prefix || key.startsWith(options.prefix))
      .sort()
      .map((name) => ({ name }))
    return { keys, list_complete: true }
  }
}
