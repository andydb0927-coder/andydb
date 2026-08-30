export interface EdgeKvListOptions {
  prefix?: string
  cursor?: string
  limit?: number
}

export interface EdgeKvListResult {
  keys: Array<{ name: string }>
  list_complete?: boolean
  listComplete?: boolean
  cursor?: string
}

/** EdgeOne EdgeKV and Cloudflare KV share this minimal KVNamespace contract. */
export interface EdgeKvNamespace {
  get(key: string, type?: 'text'): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list(options?: EdgeKvListOptions): Promise<EdgeKvListResult>
}

export function edgeKvKeyPart(value: string) {
  return encodeURIComponent(value)
}

export async function edgeKvKeys(namespace: EdgeKvNamespace, prefix: string) {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const page = await namespace.list({ prefix, ...(cursor ? { cursor } : {}) })
    keys.push(...page.keys.map((key) => key.name))
    const complete = page.list_complete ?? page.listComplete ?? !page.cursor
    if (complete || !page.cursor || page.cursor === cursor) break
    cursor = page.cursor
  } while (true)
  return keys
}

export async function edgeKvJson<T>(namespace: EdgeKvNamespace, key: string) {
  const value = await namespace.get(key, 'text')
  return value === null ? undefined : JSON.parse(value) as T
}

export async function putEdgeKvJson(namespace: EdgeKvNamespace, key: string, value: unknown) {
  await namespace.put(key, JSON.stringify(value))
}

/**
 * EdgeKV does not expose compare-and-swap. Serializing mutations per key makes
 * optimistic version checks deterministic inside one edge isolate.
 */
export class EdgeKvMutationQueue {
  private readonly tails = new Map<string, Promise<void>>()

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve()
    const result = previous.catch(() => undefined).then(operation)
    const tail = result.then(() => undefined, () => undefined)
    this.tails.set(key, tail)
    try {
      return await result
    } finally {
      if (this.tails.get(key) === tail) this.tails.delete(key)
    }
  }
}
