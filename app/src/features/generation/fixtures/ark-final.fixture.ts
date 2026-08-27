import type { GenerationRequest } from '../generation-adapter'

export const arkFinalConfigFixture = {
  mode: 'seedream-direct-dev', apiKey: 'fixture-final-key',
  apiBase: 'https://fixture.final.invalid/api/v3',
}
export const subjectDescriptionFixture = {
  name: '蓝衣旅人', appearance: '短发，面向镜头', clothing: '蓝色外套，灰色围巾', tags: ['人物', '蓝衣'],
}
export const subjectResponseFixture = {
  choices: [{ message: { content: JSON.stringify(subjectDescriptionFixture) } }],
  usage: { prompt_tokens: 2000, completion_tokens: 300, total_tokens: 2300 },
}
export const subjectRequestFixture: GenerationRequest = {
  projectId: 'subject-project', nodeId: 'image-source', operation: 'regenerate',
  targetKind: 'text', providerId: 'ai-subject-extraction', prompt: '提取用于创作的主体描述',
  referenceAssets: [{ kind: 'image', mimeType: 'image/png', url: 'https://media.fixture.invalid/source.png' }],
}
