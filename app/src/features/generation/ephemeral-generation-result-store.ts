import type { GenerationResult } from './generation-adapter'

type Listener = () => void

function resultKey(projectId: string, nodeId: string) {
  return JSON.stringify([projectId, nodeId])
}

export class EphemeralGenerationResultStore {
  private results = new Map<string, GenerationResult>()
  private readonly listeners = new Set<Listener>()

  readonly subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getSnapshot = () => this.results

  get(projectId: string, nodeId: string) {
    return this.results.get(resultKey(projectId, nodeId))
  }

  set(projectId: string, nodeId: string, result: GenerationResult) {
    if (result.persistence !== 'ephemeral') {
      throw new Error('Ephemeral result store only accepts ephemeral results')
    }
    this.results = new Map(this.results).set(resultKey(projectId, nodeId), result)
    this.emit()
  }

  clear(projectId: string, nodeId: string) {
    const key = resultKey(projectId, nodeId)
    if (!this.results.has(key)) return
    const next = new Map(this.results)
    next.delete(key)
    this.results = next
    this.emit()
  }

  clearProject(projectId: string) {
    const next = new Map(
      [...this.results].filter(([key]) => {
        const parsed = JSON.parse(key) as [string, string]
        return parsed[0] !== projectId
      }),
    )
    if (next.size === this.results.size) return
    this.results = next
    this.emit()
  }

  private emit() {
    this.listeners.forEach((listener) => listener())
  }
}

export const defaultEphemeralGenerationResultStore =
  new EphemeralGenerationResultStore()
