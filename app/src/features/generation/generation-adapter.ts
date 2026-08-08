import type {
  Asset,
  GenerationOperation,
  NodeVersion,
} from '../project/model'

export interface GenerationRequest {
  projectId: string
  nodeId: string
  operation: GenerationOperation
  prompt: string
  referenceAssetUrls: string[]
}

export interface GenerationResult {
  version: NodeVersion
  asset: Asset
}

export interface GenerationAdapter {
  start(
    request: GenerationRequest,
    signal: AbortSignal,
  ): Promise<GenerationResult>
}
