export const LIBTV_PROJECT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface LibTvProviderSelection {
  projectUuid: string
  projectName: string
  imageModelName: string
  videoModelName: string
}

export interface LibTvCatalogProject {
  projectUuid: string
  projectName: string
  imageModelNames: string[]
  videoModelNames: string[]
}

export interface LibTvCatalog {
  projects: LibTvCatalogProject[]
}
