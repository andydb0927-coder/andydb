export const LIBTV_PROJECT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface LibTvProviderSelection {
  projectUuid: string
  projectName: string
  imageModelName: string
  videoModelName: string
}

export interface LibTvGenerateBody {
  confirmed: true
  selection: LibTvProviderSelection
  request: {
    projectId: string
    nodeId: string
    operation: 'regenerate' | 'extend-shot' | 'generate-video'
    targetKind: 'image' | 'video'
    prompt: string
    referenceAssets: Array<{
      dataUrl: string
      kind: 'image' | 'video' | 'audio'
      mimeType: string
    }>
  }
}

export interface LibTvCatalogProject {
  uuid: string
  name: string
}

export interface LibTvModelSummary {
  modelKey: string
  modelName: string
  description?: string
  estimatedTime?: string
  pricingRule?: string
  vip?: boolean
}

export interface LibTvCatalog {
  cliInstalled: boolean
  cliVersion?: string
  authenticated: boolean
  writesEnabled: boolean
  projects: LibTvCatalogProject[]
  imageModels: LibTvModelSummary[]
  videoModels: LibTvModelSummary[]
  error?: string
}
