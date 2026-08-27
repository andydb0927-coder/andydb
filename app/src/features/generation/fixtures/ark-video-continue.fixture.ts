import type { GenerationRequest } from '../generation-adapter'
import { seedanceVideoConfigFixture } from './seedance-video.fixture'

export const arkVideoContinueConfigFixture = seedanceVideoConfigFixture
export const arkVideoContinueRequestFixture: GenerationRequest = {
  projectId: 'fixture-project', nodeId: 'fixture-video', operation: 'regenerate',
  targetKind: 'video', providerId: 'ark-video-continue', prompt: '镜头缓缓推向古桥',
  referenceAssets: [{ kind: 'video', mimeType: 'video/mp4', url: 'https://media.fixture.invalid/source.mp4' }],
  parameters: {
    videoPostOperation: 'continue', duration: 5, quality: '720P', sound: true,
    aspectRatio: 'Auto', count: 1, sourceDuration: 5, sourceWidth: 1280, sourceHeight: 720,
  },
}
export const arkVideoContinueCreateFixture = { id: 'cgt-fixture-continue' }
export const arkVideoContinueQueuedFixture = { id: arkVideoContinueCreateFixture.id, status: 'queued' }
export const arkVideoContinueRunningFixture = { id: arkVideoContinueCreateFixture.id, status: 'running' }
export const arkVideoContinueSuccessFixture = {
  id: arkVideoContinueCreateFixture.id, status: 'succeeded', duration: 5,
  resolution: '720p', ratio: '16:9', generate_audio: true,
  content: { video_url: 'https://media.fixture.invalid/video-continue.mp4' },
  usage: { completion_tokens: 216000 },
}
export const arkVideoContinueFailedFixture = {
  status: 'failed', error: { code: 'InvalidParameter', message: 'SECRET raw response must not be displayed' },
}
export const arkVideoContinueExpiredFixture = { status: 'expired' }
export const arkVideoContinueInvalidUrlFixture = {
  ...arkVideoContinueSuccessFixture, content: { video_url: 'http://media.fixture.invalid/result.mp4' },
}
