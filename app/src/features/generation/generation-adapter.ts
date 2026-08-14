import type {
  Asset,
  GenerationOperation,
  NodeVersion,
} from '../project/model'

export interface GenerationReference {
  url: string
  kind: 'image' | 'video' | 'audio'
  mimeType: string
}

export interface GenerationRequest {
  projectId: string
  nodeId: string
  operation: GenerationOperation
  targetKind: 'image' | 'video' | 'audio'
  providerId?: string
  prompt: string
  referenceAssets: GenerationReference[]
  parameters?: Record<string, string | number | boolean>
}

export interface GenerationUsage {
  providerId: string
  providerName: string
  modelName: string
  cost: number
  currency: 'credits'
}

export interface GenerationResult {
  version: NodeVersion
  asset: Asset
  usage?: GenerationUsage
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
