import type { GenerationRequest } from '../generation-adapter'

/** Local rejection fixtures, not invented Ark HTTP request/response contracts. */
export const arkAudioPostFixtures = [
  {
    id: 'vocal-background-separation-api',
    name: '人声/背景音分离',
    capability: 'audio-source-separation',
    alternative: 'AI MediaKit',
  },
  {
    id: 'audio-sentence-segmentation-api',
    name: '音频智能断句切分',
    capability: 'audio-sentence-segmentation',
    alternative: '豆包语音 ASR',
  },
] as const

export function arkAudioPostRequestFixture(providerId: string): GenerationRequest {
  return {
    projectId: 'audio-post-fixture-project',
    nodeId: 'audio-post-fixture-node',
    operation: 'regenerate',
    targetKind: 'audio',
    providerId,
    prompt: '仅验证不可用能力，不发网络请求',
    referenceAssets: [{ kind: 'audio', mimeType: 'audio/wav', url: 'https://media.fixture.invalid/audio.wav' }],
  }
}
