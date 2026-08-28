import type { Asset, AudioNodeDetails, CanvasNode, GenerationConfiguration, GenerationJob, NodeVersion, Project } from './model'
import { findAudioVoice } from '../generation/audio-voice-catalog'

export interface AudioVersionEntry { version: NodeVersion; asset: Asset; job?: GenerationJob }
export interface AudioVoiceSample { voiceId: string; asset: Asset }

export function audioVersionHistory(project: Project, node: CanvasNode): AudioVersionEntry[] {
  return node.versions.flatMap(version => {
    const asset = project.assets.find(asset => asset.id === version.assetId && asset.kind === 'audio')
    if (!asset) return []
    const job = project.jobs.find(job => job.nodeId === node.id && job.assetId === asset.id && job.status === 'succeeded')
    return [{ version, asset, job }]
  })
}

export function audioVoiceSamples(project: Project): AudioVoiceSample[] {
  const samples = new Map<string, Asset>()
  for (const job of project.jobs) {
    if (job.status !== 'succeeded' || job.providerId !== 'ark-tts') continue
    const voice = findAudioVoice(job.generationConfig?.parameters?.voice)
    const asset = project.assets.find(asset => asset.id === job.assetId && asset.kind === 'audio')
    if (voice && asset) samples.set(voice.id, asset)
  }
  return Array.from(samples, ([voiceId, asset]) => ({ voiceId, asset }))
}

export function audioDetailsForVersion(fallback: AudioNodeDetails, config: GenerationConfiguration | undefined, prompt: string, asset: Asset, modelName?: string): AudioNodeDetails {
  const p = config?.parameters ?? {}
  return { ...fallback,
    prompt,
    modelProviderId: config?.providerId ?? fallback.modelProviderId,
    voice: typeof p.voice === 'string' ? p.voice : fallback.voice,
    speed: typeof p.speed === 'number' ? p.speed : fallback.speed,
    volume: typeof p.volume === 'number' ? p.volume : fallback.volume,
    pitch: typeof p.pitch === 'number' ? p.pitch : 0,
    sampleRate: typeof p.sampleRate === 'number' ? p.sampleRate : asset.sampleRate ?? fallback.sampleRate,
    format: ['mp3', 'wav', 'pcm', 'ogg_opus'].includes(String(p.format)) ? p.format as AudioNodeDetails['format'] : fallback.format,
    generatedByModel: modelName ?? fallback.generatedByModel,
    durationSeconds: asset.durationSeconds ?? 0,
    trimStartSeconds: 0,
    trimEndSeconds: asset.durationSeconds,
    playbackRate: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    normalize: false,
  }
}
