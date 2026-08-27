import type { GenerationRequest } from '../generation-adapter'

export const arkAnalysisConfigFixture = {
  mode: 'seedream-direct-dev', apiKey: 'fixture-analysis-key',
  apiBase: 'https://fixture.analysis.invalid/api/v3',
}
export const arkAnalysisImageRequest: GenerationRequest = {
  projectId: 'analysis-project', nodeId: 'analysis-image', operation: 'regenerate',
  targetKind: 'image', providerId: 'multi-camera-grid-api', prompt: '清晨古桥，红衣行人',
  parameters: { resolution: '1.5K', count: 1 },
  referenceAssets: [{ kind: 'image', mimeType: 'image/png', url: 'https://media.fixture.invalid/source.png' }],
}
export const arkAnalysisVideoRequest: GenerationRequest = {
  projectId: 'analysis-project', nodeId: 'analysis-video', operation: 'regenerate',
  targetKind: 'text', providerId: 'frame-analysis-api', prompt: '分析桥上人物运动与镜头变化',
  parameters: { fps: 1, storyboard: true, motion: true, music: false },
  referenceAssets: [{ kind: 'video', mimeType: 'video/mp4', url: 'https://media.fixture.invalid/video.mp4' }],
}
export const arkFrameReportFixture = {
  summary: '人物从桥左侧走向右侧，镜头缓慢推进。',
  shots: [
    { start: 0, end: 1.5, description: '古桥全景', motion: '人物进入画面' },
    { start: 1.5, end: 3, description: '人物中景', motion: '摄影机缓慢前推' },
  ],
}
export const arkFrameResponseFixture = {
  choices: [{ message: { content: JSON.stringify(arkFrameReportFixture) } }],
  usage: { prompt_tokens: 2000, completion_tokens: 300, total_tokens: 2300 },
}
