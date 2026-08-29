import type {
  GenerationRequest,
  GenerationResult,
  GenerationUsage,
} from './generation-adapter'
import type { ModelProvider } from './model-provider-registry'
import { officialAudioVoices } from './audio-voice-catalog'
import { base64WavMetadata } from '../media/audio-metadata'
import { assertProviderResponse, fetchProviderResponse } from './generation-errors'
import {
  resolveModelParameterManifest,
  type ModelParameterManifest,
} from './model-parameter-semantics'
import {
  audioDevelopmentModeEnabled,
  audioFormat,
  audioMimeType,
  concatBase64Chunks,
  dataUrlFromBase64,
  envValue,
  providerRate,
  providerVolume,
  providerPitch,
  resolveSpeechApiBase,
  sampleRateParameter,
  voiceId,
} from './ark-audio-provider-utils'

const providerId = 'ark-tts'
const providerName = '火山方舟'
const modelName = '豆包语音合成 2.0'
const defaultModelId = 'seed-tts-2.0'
const missingConfiguration = '豆包语音合成待专用资源授权：请配置 Speech API Key'
const disabledMode = '火山方舟豆包语音开发验证未启用'

const parameterManifest: ModelParameterManifest = {
  audioMode: { type: 'enum', defaultValue: 'tts', options: ['tts'] },
  voice: {
    type: 'enum',
    defaultValue: officialAudioVoices[0].id,
    options: officialAudioVoices.map(voice => voice.id),
  },
  speed: { type: 'number', defaultValue: 1, min: 0.5, max: 2, step: 0.1 },
  volume: { type: 'number', defaultValue: 75, min: 0, max: 100, step: 1 },
  pitch: { type: 'number', defaultValue: 0, min: -12, max: 12, step: 1 },
  sampleRate: {
    type: 'enum',
    defaultValue: '24000',
    options: ['16000', '24000', '32000', '44100', '48000'],
  },
  format: {
    type: 'enum',
    defaultValue: 'mp3',
    options: ['mp3', 'wav', 'pcm', 'ogg_opus'],
  },
}

export interface ArkTtsProviderOptions {
  mode?: string
  apiKey?: string
  apiBase?: string
  modelId?: string
  fetchFn?: typeof fetch
}

interface TtsChunk {
  code?: unknown
  message?: unknown
  data?: unknown
  usage?: { text_words?: unknown }
}

function parseChunkedResponse(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return []
  try {
    return [JSON.parse(trimmed) as TtsChunk]
  } catch {
    return trimmed.split(/\r?\n/u).filter(Boolean).map((line) => {
      try {
        return JSON.parse(line) as TtsChunk
      } catch {
        throw new Error('豆包语音合成响应格式异常')
      }
    })
  }
}

function requestBody(request: GenerationRequest) {
  const format = audioFormat(request.parameters?.format)
  return {
    req_params: {
      text: request.prompt.trim(),
      speaker: voiceId(request.parameters?.voice),
      ...(providerPitch(request.parameters?.pitch) === 0 ? {} : {
        additions: JSON.stringify({ post_process: { pitch: providerPitch(request.parameters?.pitch) } }),
      }),
      audio_params: {
        format,
        sample_rate: sampleRateParameter(
          request.parameters?.sampleRate,
          format,
          24_000,
        ),
        speech_rate: providerRate(request.parameters?.speed),
        loudness_rate: providerVolume(request.parameters?.volume, 75),
      },
    },
  }
}

function resultFor(
  request: GenerationRequest,
  chunks: readonly TtsChunk[],
  format: ReturnType<typeof audioFormat>,
): GenerationResult {
  const audioChunks = chunks.flatMap((chunk) =>
    typeof chunk.data === 'string' && chunk.data.trim() ? [chunk.data] : [],
  )
  if (!audioChunks.length) throw new Error('豆包语音合成未返回音频')
  let base64: string
  try {
    base64 = concatBase64Chunks(audioChunks)
  } catch {
    throw new Error('豆包语音合成音频数据无效')
  }
  const billedCharacters = chunks.reduce((total, chunk) => {
    const value = Number(chunk.usage?.text_words)
    return total + (Number.isFinite(value) && value > 0 ? value : 0)
  }, 0) || Array.from(request.prompt).length
  const assetId = crypto.randomUUID()
  const usage: GenerationUsage = {
    providerId,
    providerName,
    modelName,
    cost: 1,
    currency: 'credits',
    estimatedCostCny: Number(((billedCharacters / 10_000) * 3).toFixed(6)),
  }
  return {
    persistence: 'project',
    asset: {
      id: assetId,
      kind: 'audio',
      url: dataUrlFromBase64(base64, format),
      mimeType: audioMimeType(format),
      sampleRate: sampleRateParameter(request.parameters?.sampleRate, format, 24_000),
      ...(format === 'wav' ? base64WavMetadata(base64) : {}),
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

export function createArkTtsProvider(
  options: ArkTtsProviderOptions = {},
): ModelProvider {
  const mode = options.mode ?? envValue('VITE_GENERATION_MODE')
  // The Ark API key is not a Speech API credential. TTS must use the key
  // issued after enabling the dedicated Doubao Speech resource.
  const apiKey = options.apiKey ?? envValue('VITE_ARK_TTS_API_KEY')
  const apiBase = options.apiBase ?? envValue('VITE_SEEDREAM_API_BASE')
  const modelId = options.modelId ?? envValue('VITE_ARK_TTS_MODEL_ID')
  const enabledMode = audioDevelopmentModeEnabled(mode)
  const enabled = enabledMode && Boolean(apiKey)
  const disabledReason = enabledMode ? missingConfiguration : disabledMode
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
  const createUrl = `${resolveSpeechApiBase(apiBase)}/tts/unidirectional`
  const resolvedModelId = modelId || defaultModelId

  return {
    id: providerId,
    name: providerName,
    modelName,
    apiDisplayName: '豆包语音',
    kind: 'live',
    ...(enabled ? {} : { disabledReason }),
    modelNotice: enabled
      ? '豆包语音专用资源已授权；官方按字符计费：3 元/万字符。'
      : '待专用资源授权：Ark API Key 不能直接调用 OpenSpeech TTS。',
    capabilities: ['audio'],
    parameterManifest,
    parameterSchema: resolveModelParameterManifest(parameterManifest),
    pricing: { amount: 1, currency: 'credits', unit: 'generation' },
    officialApiEndpoint: createUrl,
    async generate(request, context) {
      if (!enabled) throw new Error(disabledReason)
      context.signal.throwIfAborted()
      if (request.targetKind !== 'audio') {
        throw new Error('豆包语音合成 Provider 仅支持音频节点')
      }
      if (!request.prompt.trim()) throw new Error('请输入需要合成的文本')
      const body = requestBody(request)
      const format = audioFormat(request.parameters?.format)
      context.onProgress?.(10)
      const response = await fetchProviderResponse(fetchFn, 'ark-tts', createUrl, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'X-Api-Resource-Id': resolvedModelId,
          'X-Api-Request-Id': crypto.randomUUID(),
          'Content-Type': 'application/json',
          Connection: 'keep-alive',
        },
        body: JSON.stringify(body),
        signal: context.signal,
      })
      await assertProviderResponse(response, 'ark-tts')
      const chunks = parseChunkedResponse(await response.text())
      for (const chunk of chunks) {
        const code = Number(chunk.code ?? 0)
        if (code !== 0) throw new Error(`豆包语音合成失败（${code}）`)
      }
      context.onProgress?.(90)
      const result = resultFor(request, chunks, format)
      context.onProgress?.(100)
      return result
    },
    async export(_request, context) {
      context.signal.throwIfAborted()
      throw new Error('豆包语音合成不提供视频导出')
    },
  }
}
