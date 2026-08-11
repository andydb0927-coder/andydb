import {
  LIBTV_PROJECT_UUID_PATTERN,
  type LibTvProviderSelection,
} from './libtv-contract'

export const GENERATION_PROVIDER_KEY = 'wireless-canvas:generation-provider:v1'

export type GenerationProviderPreference =
  | { provider: 'demo' }
  | { provider: 'libtv'; selection: LibTvProviderSelection }

export interface GenerationProviderPreferenceStore {
  read(): GenerationProviderPreference
  write(value: GenerationProviderPreference): void
}

const demoPreference: GenerationProviderPreference = { provider: 'demo' }

function readPreference(value: unknown): GenerationProviderPreference {
  if (!value || typeof value !== 'object') return demoPreference

  const preference = value as {
    provider?: unknown
    selection?: {
      projectUuid?: unknown
      projectName?: unknown
      imageModelName?: unknown
      videoModelName?: unknown
    }
  }
  const provider = normalizeString(preference.provider)
  if (provider === 'demo') return demoPreference
  if (provider !== 'libtv' || !preference.selection) {
    return demoPreference
  }

  const projectUuid = normalizeString(preference.selection.projectUuid)
  const projectName = normalizeString(preference.selection.projectName)
  const imageModelName = normalizeString(preference.selection.imageModelName)
  const videoModelName = normalizeString(preference.selection.videoModelName)
  if (
    !projectUuid ||
    !LIBTV_PROJECT_UUID_PATTERN.test(projectUuid) ||
    !projectName ||
    !imageModelName ||
    !videoModelName
  ) {
    return demoPreference
  }

  return {
    provider: 'libtv',
    selection: { projectUuid, projectName, imageModelName, videoModelName },
  }
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : undefined
}

class BrowserGenerationProviderPreferenceStore
  implements GenerationProviderPreferenceStore
{
  private readonly storage: Storage | undefined

  constructor(storage: Storage | undefined) {
    this.storage = storage
  }

  read(): GenerationProviderPreference {
    try {
      const serialized = this.storage?.getItem(GENERATION_PROVIDER_KEY)
      return serialized ? readPreference(JSON.parse(serialized)) : demoPreference
    } catch {
      return demoPreference
    }
  }

  write(value: GenerationProviderPreference): void {
    try {
      this.storage?.setItem(
        GENERATION_PROVIDER_KEY,
        JSON.stringify(readPreference(value)),
      )
    } catch {
      // Storage is optional and unavailable storage must not block generation.
    }
  }
}

export function createGenerationProviderPreferenceStore(
  storage: Storage | undefined =
    typeof localStorage === 'undefined' ? undefined : localStorage,
): GenerationProviderPreferenceStore {
  return new BrowserGenerationProviderPreferenceStore(storage)
}
