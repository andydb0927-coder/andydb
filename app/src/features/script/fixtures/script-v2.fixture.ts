export const scriptBreakdownFixture = {
  chapters: [{ title: '古桥晨光', summary: '小舟寻找桥上的旧友', scenes: [
    { title: '桥头相遇', summary: '小舟在薄雾中走上古桥' },
    { title: '河边告别', summary: '小舟留下纸船，与旧友道别' },
  ] }],
  characters: [{ name: '小舟', description: '蓝色外套的年轻旅人，手提旧灯笼' }],
  props: [{ name: '纸船', description: '折叠的白纸小船' }],
}

export const scriptShotsFixture = { shots: [
  { sceneId: 'scene-1-1', title: '薄雾古桥', shotSize: '远景', cameraAngle: '平视', cameraMovement: '缓慢前推', prompt: '清晨薄雾中的古桥，小舟提灯入画', referenceCharacters: ['小舟'] },
  { sceneId: 'scene-1-2', title: '纸船远去', shotSize: '特写', cameraAngle: '俯拍', cameraMovement: '固定', prompt: '白色纸船在清澈河水中缓缓漂远', referenceCharacters: [] },
] }

export const scriptV2ConfigFixture = {
  mode: 'seedream-direct-dev', apiKey: 'fixture-script-v2-key', apiBase: 'https://fixture.seedream.invalid/api/v3',
}

export function scriptChatFixture(content: unknown) {
  return { choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }], usage: { prompt_tokens: 200, completion_tokens: 300, total_tokens: 500 } }
}
