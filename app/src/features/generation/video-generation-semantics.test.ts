import { describe, expect, test, vi } from 'vitest'
import { createSeedanceVideoProvider } from './seedance-video-provider'
import { seedanceVideoConfigFixture, seedanceVideoCreateSuccessFixture, seedanceVideoGenerationRequestFixture, seedanceVideoSuccessFixture } from './fixtures/seedance-video.fixture'
import { videoReferenceFailure, resolveVideoReferences, setVideoFrameReference } from './video-generation-semantics'
import type { GenerationReference } from './generation-adapter'
import { prepareSubjectRequest } from '../subjects/subject-consistency'

const first: GenerationReference = { kind: 'image', url: 'https://fixture.invalid/first.png', mimeType: 'image/png', role: 'first_frame' }
const last: GenerationReference = { ...first, url: 'https://fixture.invalid/last.png', role: 'last_frame' }

describe('video generation semantics', () => {
  test('keeps explicit roles regardless of selection order and permits equal frame images', () => {
    expect(resolveVideoReferences([last, first], '首尾帧')).toEqual([first, last])
    expect(videoReferenceFailure([first, { ...last, url: first.url }], '首尾帧')).toBeUndefined()
    expect(resolveVideoReferences([{ ...first, role: undefined }, { ...last, role: undefined }], '首尾帧')).toEqual([first, last])
  })
  test('rejects missing or mixed frame scenes instead of silently sending an invalid request', () => {
    expect(videoReferenceFailure([first], '首尾帧')).toContain('尾帧')
    expect(videoReferenceFailure([last], '图生视频')).toContain('首帧')
    expect(videoReferenceFailure([first, last, { kind: 'video', url: 'https://fixture.invalid/a.mp4', mimeType: 'video/mp4' }], '首尾帧')).toContain('混用')
  })
  test('assigning a tail preserves an inherited first frame and clearing it does not restore a stale reference', () => {
    const selected = setVideoFrameReference([{ ...first, role: undefined }], '首尾帧', 'last_frame', last)
    expect(selected).toEqual([first, last])
    expect(setVideoFrameReference(selected, '首尾帧', 'first_frame', undefined)).toEqual([last])
  })
  test('declares prompt guidance, maps frame roles, stores response metadata, and never invents API fields', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(seedanceVideoCreateSuccessFixture))
      .mockResolvedValueOnce(Response.json({ ...seedanceVideoSuccessFixture, framespersecond: 24, resolution: '1080p', ratio: '16:9' }))
    const provider = createSeedanceVideoProvider({ ...seedanceVideoConfigFixture, fetchFn, pollIntervalMs: 0 })
    expect(provider.parameterSchema.negativePrompt).toMatchObject({ type: 'text', defaultValue: '', maxLength: 500 })
    expect(provider.parameterSchema.shotSize).toMatchObject({ type: 'enum', options: expect.arrayContaining(['近景', '远景']) })
    const result = await provider.generate({ ...seedanceVideoGenerationRequestFixture, referenceAssets: [last, first], parameters: { generationMode: '首尾帧', shotSize: '近景', cameraMotion: '缓慢推进', negativePrompt: '模糊、闪烁' } }, { signal: new AbortController().signal })
    const body = JSON.parse(String(fetchFn.mock.calls[0][1]?.body))
    expect(body.content.slice(1).map((item: { role: string }) => item.role)).toEqual(['first_frame', 'last_frame'])
    expect(body.content[0].text).toContain('景别：近景')
    expect(body.content[0].text).toContain('运镜：缓慢推进')
    expect(body.content[0].text).toContain('避免：模糊、闪烁')
    expect(body).not.toHaveProperty('negative_prompt')
    expect(result.version.prompt).toBe(seedanceVideoGenerationRequestFixture.prompt)
    expect(result.asset).toMatchObject({ framesPerSecond: 24, resolution: '1080p' })
  })
  test('validates references before issuing any network request', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    const provider = createSeedanceVideoProvider({ ...seedanceVideoConfigFixture, fetchFn })
    await expect(provider.generate({ ...seedanceVideoGenerationRequestFixture, referenceAssets: [first], parameters: { generationMode: '首尾帧' } }, { signal: new AbortController().signal })).rejects.toThrow('尾帧')
    expect(fetchFn).not.toHaveBeenCalled()
  })
  test('subject consistency preserves explicit equal-image frame roles without mixing reference images', () => {
    const referenceAssets = [first, { ...last, url: first.url }]
    const request = { ...seedanceVideoGenerationRequestFixture, referenceAssets, parameters: { generationMode: '首尾帧' }, subjects: [{ id: 'traveler', name: '旅人', description: '青色长衣', coverUrl: 'https://fixture.invalid/subject.png', mimeType: 'image/png' }] }
    const prepared = prepareSubjectRequest(request)
    expect(prepared.referenceAssets).toEqual(referenceAssets)
    expect(prepared.prompt).toContain('青色长衣')
    expect(request.prompt).toBe(seedanceVideoGenerationRequestFixture.prompt)
  })
})
