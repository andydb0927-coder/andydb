import type { ModelProvider } from './model-provider-registry'
import { audioFormat } from './ark-audio-provider-utils'

/** Shared UI selection rules; the provider remains the parameter authority. */
export function audioOutputSettings(provider: ModelProvider, requestedFormat: string, requestedRate: number) {
  const formatSchema = provider.parameterSchema.format
  const rateSchema = provider.parameterSchema.sampleRate
  const formats = formatSchema?.type === 'enum' ? formatSchema.options : ['mp3']
  const format = audioFormat(formats.includes(requestedFormat) ? requestedFormat : formatSchema?.defaultValue)
  const declaredRates = rateSchema?.type === 'enum' ? rateSchema.options.map(Number) : [24000]
  const sampleRates = format === 'ogg_opus' ? [48000] : declaredRates.filter(rate => format !== 'mp3' || rate !== 40000)
  const defaultRate = Number(rateSchema?.defaultValue ?? 24000)
  const sampleRate = sampleRates.includes(requestedRate) ? requestedRate : sampleRates.includes(defaultRate) ? defaultRate : sampleRates[0]
  return { format, formats, sampleRate, sampleRates }
}
