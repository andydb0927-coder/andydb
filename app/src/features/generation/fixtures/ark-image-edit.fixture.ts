import type { GenerationRequest } from '../generation-adapter'

export const arkImageEditConfigFixture = {
  mode: 'seedream-direct-dev',
  apiKey: 'fixture-image-edit-key',
  apiBase: 'https://fixture.seedream.invalid/api/v3',
}
export const arkImageEditRequestFixture: GenerationRequest = {
  projectId: 'project-canvas', nodeId: 'character-1', operation: 'regenerate',
  targetKind: 'image', providerId: 'ark-image-edit', prompt: '移除路牌',
  referenceAssets: [{ url: 'https://media.fixture.invalid/shot-river.png', kind: 'image', mimeType: 'image/png' }],
  parameters: { imageEditOperation: 'erase', editX1: 100, editY1: 200, editX2: 600, editY2: 800,
    aspectRatio: '16:9', resolution: '2K', count: 1 },
}
export const arkImageEditSuccessFixture = {
  data: [{ url: 'https://media.fixture.invalid/image-edit.png', size: '2816x1584' }],
}
