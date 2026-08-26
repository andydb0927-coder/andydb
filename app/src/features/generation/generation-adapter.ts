import type {
  Asset,
  GenerationConfiguration,
  GenerationOperation,
  GenerationReferenceConfig,
  NodeVersion,
} from '../project/model'

export type GenerationReference = GenerationReferenceConfig

export interface GenerationRequest extends GenerationConfiguration {
  projectId: string
  nodeId: string
  operation: GenerationOperation
  prompt: string
}

export interface GenerationUsage {
  providerId: string
  providerName: string
  modelName: string
  cost: number
  currency: 'credits'
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimatedCostCny?: number
}

export interface GenerationResult {
  version: NodeVersion
  asset: Asset
  /**
   * Ordered output set for providers that return more than one result. The
   * first item is always the backwards-compatible primary `asset`.
   */
  assets?: Asset[]
  usage?: GenerationUsage
  persistence?: 'project' | 'ephemeral'
}

export function generationResultAssets(result: GenerationResult) {
  return result.assets?.length ? result.assets : [result.asset]
}

export interface GenerationDispatchMetadata {
  providerId: string
  providerName: string
  modelName: string
  estimatedCost: number
}

export interface GenerationAdapter {
  describe?(request: GenerationRequest): GenerationDispatchMetadata
  start(
    request: GenerationRequest,
    signal: AbortSignal,
    onProgress?: (percentage: number) => void,
  ): Promise<GenerationResult>
}
