import type {
  GenerationRequest,
  GenerationResult,
  GenerationUsage,
} from './generation-adapter'
import type { ModelProvider } from './model-provider-registry'
import { officialAudioVoices } from './audio-voice-catalog'
import { base64WavMetadata } from '../media/audio-metadata'
import { assertProviderResponse, fetchProviderResponse, readProviderJson } from './generation-errors'
import {
  resolveModelParameterManifest,
  type ModelParameterManifest,
} from './model-parameter-semantics'
import {
  audioDevelopmentModeEnabled,
  audioDuration,
  audioFormat,
  audioMimeType,
  dataUrlFromBase64,
  envValue,
  httpsAudioUrl,
  providerRate,
  providerVolume,
  providerPitch,
  resolveSpeechApiBase,
  sampleRateParameter,
  voiceId,
} from './ark-audio-provider-utils'

const providerId = 'ark-audio-gen'
const providerName = '火山方舟'
const modelName = '豆包音频生成 1.0'
const defaultModelId = 'seed-audio-1.0'
const missingConfiguration = '火山方舟豆包音频开发验证配置未完成'
const disabledMode = '火山方舟豆包音频开发验证未启用'

const parameterManifest: ModelParameterManifest = {
  audioMode: {
    type: 'enum',
    defaultValue: 'audio-generation',
    options: ['audio-generation'],
  },
  duration: { type: 'number', defaultValue: 12, min: 1, max: 120, step: 1 },
  voice: {
    type: 'enum',
    defaultValue: officialAudioVoices[0].id,
    options: officialAudioVoices.map(voice => voice.id),
  },
  speed: { type: 'number', defaultValue: 1, min: 0.5, max: 2, step: 0.1 },
  volume: { type: 'number', defaultValue: 50, min: 0, max: 100, step: 1 },
  pitch: { type: 'number', defaultValue: 0, min: -12, max: 12, step: 1 },
  sampleRate: {
    type: 'enum',
    defaultValue: '44100',
    options: ['16000', '24000', '32000', '40000', '44100', '48000'],
  },
  format: {
    type: 'enum',
    defaultValue: 'mp3',
    options: ['mp3', 'wav', 'pcm', 'ogg_opus'],
  },
}

export interface ArkAudioGenProviderOptions {
  mode?: string
  apiKey?: string
  apiBase?: string
  modelId?: string
  fetchFn?: typeof fetch
}

interface AudioGenerationResponse {
  audio?: unknown
  url?: unknown
  duration?: unknown
  original_duration?: unknown
}

function requestBody(
  request: GenerationRequest,
  modelId: string,
) {
  const format = audioFormat(request.parameters?.format)
  const duration = audioDuration(request, 12)
  return {
    model: modelId,
    text_prompt: `生成约 ${duration} 秒音频。${request.prompt.trim()}`,
    references: [{ speaker: voiceId(request.parameters?.voice) }],
    audio_config: {
      format,
      sample_rate: sampleRateParameter(
        request.parameters?.sampleRate,
        format,
        format === 'mp3' ? 44_100 : 40_000,
      ),
      speech_rate: providerRate(request.parameters?.speed),
      loudness_rate: providerVolume(request.parameters?.volume, 50),
      pitch_rate: providerPitch(request.parameters?.pitch),
      enable_subtitle: false,
    },
    watermark: {},
  }
}

function resultFor(
  request: GenerationRequest,
  body: AudioGenerationResponse,
  format: ReturnType<typeof audioFormat>,
): GenerationResult {
  const base64 = typeof body.audio === 'string' && body.audio.trim()
    ? body.audio
    : undefined
  const remoteUrl = httpsAudioUrl(body.url)
  if (!base64 && !remoteUrl) throw new Error('豆包音频生成未返回可用音频')
  const duration = Number(body.duration)
  const originalDuration = Number(body.original_duration)
  const durationSeconds = Number.isFinite(duration) && duration > 0
    ? duration
    : undefined
  const billedDuration = Number.isFinite(originalDuration) && originalDuration > 0
    ? originalDuration
    : durationSeconds ?? audioDuration(request, 12)
  const assetId = crypto.randomUUID()
  const usage: GenerationUsage = {
    providerId,
    providerName,
    modelName,
    cost: billedDuration,
    currency: 'credits',
    estimatedCostCny: Number((billedDuration / 60).toFixed(6)),
  }
  return {
    persistence: 'project',
    asset: {
      id: assetId,
      kind: 'audio',
      url: base64 ? dataUrlFromBase64(base64, format) : remoteUrl!,
      mimeType: audioMimeType(format),
      durationSeconds,
      sampleRate: sampleRateParameter(request.parameters?.sampleRate, format, format === 'mp3' ? 44_100 : 40_000),
      ...(format === 'wav' && base64 ? base64WavMetadata(base64) : {}),
    },
    version: {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      prompt: request.prompt,
      assetId,
    },
    usage,
  }
}

export function createArkAudioGenProvider(
  options: ArkAudioGenProviderOptions = {},
): ModelProvider {
  const mode = options.mode ?? envValue('VITE_GENERATION_MODE')
  const apiKey = options.apiKey ?? envValue('VITE_SEEDREAM_API_KEY')
  const apiBase = options.apiBase ?? envValue('VITE_SEEDREAM_API_BASE')
  const modelId = options.modelId ?? envValue('VITE_ARK_AUDIO_MODEL_ID')
  const enabledMode = audioDevelopmentModeEnabled(mode)
  const enabled = enabledMode && Boolean(apiKey)
  const disabledReason = enabledMode ? missingConfiguration : disabledMode
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
  const createUrl = `${resolveSpeechApiBase(apiBase)}/tts/create`
  const resolvedModelId = modelId || defaultModelId

  return {
    id: providerId,
    name: providerName,
    modelName,
    apiDisplayName: '豆包语音',
    kind: 'live',
    ...(enabled ? {} : { disabledReason }),
    modelNotice: '官方按原始音频时长计费：1 元/分钟。',
    capabilities: ['audio'],
    parameterManifest,
    parameterSchema: resolveModelParameterManifest(parameterManifest),
    pricing: { amount: 1, currency: 'credits', unit: 'second' },
    officialApiEndpoint: createUrl,
    async generate(request, context) {
      if (!enabled) throw new Error(disabledReason)
      context.signal.throwIfAborted()
      if (request.targetKind !== 'audio') {
        throw new Error('豆包音频生成 Provider 仅支持音频节点')
      }
      if (!request.prompt.trim()) throw new Error('请输入音频生成提示词')
      const body = requestBody(request, resolvedModelId)
      const format = audioFormat(request.parameters?.format)
      context.onProgress?.(10)
      const response = await fetchProviderResponse(fetchFn, 'ark-audio', createUrl, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'X-Api-Request-Id': crypto.randomUUID(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: context.signal,
      })
      await assertProviderResponse(response, 'ark-audio')
      const parsed = await readProviderJson(response, '豆包音频生成响应格式异常') as AudioGenerationResponse
      context.onProgress?.(90)
      const result = resultFor(request, parsed, format)
      context.onProgress?.(100)
      return result
    },
    async export(_request, context) {
      context.signal.throwIfAborted()
      throw new Error('豆包音频生成不提供视频导出')
    },
  }
}
