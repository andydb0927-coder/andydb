import type { GenerationRequest } from './generation-adapter'
import { providerDefaultParameters, type ModelProvider } from './model-provider-registry'

/** A preset is one whole run; its image count is owned by the tool manifest. */
export function imageAnalysisParameterDefaults(
  provider: ModelProvider,
  saved: GenerationRequest['parameters'] = {},
) {
  const defaults = providerDefaultParameters(provider)
  return {
    ...saved,
    resolution: String(saved.resolution ?? defaults.resolution ?? '1.5K'),
    count: Number(defaults.count ?? 1),
  }
}
