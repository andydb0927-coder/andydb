import { afterEach, describe, expect, test, vi } from 'vitest'

import type { ExportSettings } from '../export/export-adapter'
import type { GenerationRequest } from './generation-adapter'
import { GenerationQueue } from './generation-queue'
import {
  ProviderRegistry,
  createDefaultProviderRegistry,
  defaultVideoGenerationMode,
  liblibImageModelCatalog,
  liblibVideoModelCatalog,
  resolveVideoGenerationMode,
} from './model-provider-registry'
import { RegistryGenerationAdapter } from './registry-generation-adapter'

const imageRequest: GenerationRequest = {
  projectId: 'project-1',
  nodeId: 'image-1',
  operation: 'regenerate',
  targetKind: 'image',
  providerId: 'mock-mj-image',
  prompt: '雨夜电影感人像',
  referenceAssets: [],
}

const exportSettings: ExportSettings = {
  width: 1920,
  height: 1080,
  aspectRatio: '16:9',
  frameRate: 24,
  watermark: false,
}

afterEach(() => vi.useRealTimers())

describe('model provider registry', () => {
  test('publishes demo models, a gated live provider, and placeholders behind one contract', () => {
    const registry = createDefaultProviderRegistry()

    expect(registry.list().map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'mock-mj-image',
        'mock-tongyi-image',
        'mock-text-llm',
        'mock-kling-video',
        'mock-seedance-video',
        'mock-audio',
        'kling-api',
        'seedance-api',
        'tongyi-api',
      ]),
    )
    expect(() => registry.require('mock-kling-image')).toThrow(
      'Unknown model provider: mock-kling-image',
    )
    expect(registry.require('mock-mj-image')).toMatchObject({
      name: 'Mock Studio',
      modelName: 'Lib Image',
      kind: 'demo',
      badge: '演示',
      capabilities: ['text-to-image', 'image-to-image'],
      parameterSchema: {
        aspectRatio: { type: 'enum', defaultValue: '16:9' },
        resolution: { type: 'enum', defaultValue: '2K' },
      },
      pricing: { amount: 18, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'mock://local/liblib-image/mock-mj-image',
    })
    expect(registry.require('kling-api')).toMatchObject({
      kind: 'live',
      disabledReason: '可灵开发验证配置未完成',
      capabilities: ['text-to-video'],
      officialApiEndpoint: 'https://api.klingai.com/text-to-video/kling-2.6',
    })
    expect(registry.require('mock-seedance-video')).toMatchObject({
      modelName: '即梦1.5 Pro',
      parameterSchema: {
        aspectRatio: { type: 'enum', defaultValue: '16:9' },
        duration: { type: 'enum', defaultValue: '5' },
        quality: { type: 'enum', defaultValue: '720P' },
        sound: { type: 'boolean', defaultValue: true },
        count: { type: 'enum', defaultValue: '1' },
        onlineSearch: { type: 'boolean', defaultValue: true },
        materialValidation: { type: 'boolean', defaultValue: true },
        autoLink: { type: 'boolean', defaultValue: true },
      },
      pricing: { amount: 135, currency: 'credits', unit: 'generation' },
    })
    expect(registry.require('mock-text-llm')).toMatchObject({
      modelName: '文本 LLM',
      capabilities: ['text'],
      variants: [
        expect.objectContaining({ id: 'deep-script', name: 'GVLM 3.1', pricing: expect.objectContaining({ amount: 12 }) }),
        expect.objectContaining({ id: 'idea-expansion', name: 'CVLM 5.5', pricing: expect.objectContaining({ amount: 15 }) }),
        expect.objectContaining({ id: 'basic-copy', name: 'GVLM 3.1 Flash', pricing: expect.objectContaining({ amount: 8 }) }),
        expect.objectContaining({ id: 'qwen-3-vl-flash', name: 'Qwen 3 VL Flash', pricing: expect.objectContaining({ amount: 1 }) }),
      ],
    })
    expect(registry.require('mock-audio')).toMatchObject({
      variants: [
        expect.objectContaining({ id: 'ambience', name: 'Mureka V8 · 氛围音', pricing: expect.objectContaining({ amount: 4 }) }),
        expect.objectContaining({ id: 'narration', name: 'ElevenLabs V3 · 人声旁白', pricing: expect.objectContaining({ amount: 8 }) }),
        expect.objectContaining({ id: 'sound-effect', name: 'ElevenLabs V2 · 音效', pricing: expect.objectContaining({ amount: 3 }) }),
      ],
    })
  })

  test('mirrors the audited LibLib image and video model catalogs in selector order', () => {
    const registry = createDefaultProviderRegistry()
    const image = registry.matching(['text-to-image', 'image-to-image'])
    const video = registry.matching(['text-to-video', 'image-to-video'])

    expect(liblibImageModelCatalog).toHaveLength(17)
    expect(image.map(({ modelName }) => modelName)).toEqual(
      liblibImageModelCatalog.map(({ modelName }) => modelName),
    )
    expect(liblibVideoModelCatalog).toHaveLength(23)
    expect(liblibVideoModelCatalog.map(({ modelName }) => modelName)).toEqual([
      'Seedance 2.5',
      'Kling O3',
      'Kling 3.0 Turbo',
      '可灵O1',
      '可灵V2.6',
      'Minimax H3',
      'Wan 2.7',
      'Wan 2.6',
      '全能视频模型3.1快速版',
      '全能视频模型3.1',
      '即梦1.5 Pro',
      '即梦 Pro',
      '即梦 Lite',
      '动作迁移',
      'MJ Video',
      'Hailuo-2.3 Fast',
      'Hailuo-O2',
      'Hailuo-2.3',
      'Vidu Q3 Pro',
      'Pixverse V5.5',
      '多镜头视频模型',
      '多镜头视频模型Pro',
      'OmniHuman 1.5',
    ])
    expect(video.map(({ modelName }) => modelName)).toEqual(
      liblibVideoModelCatalog.map(({ modelName }) => modelName),
    )
    expect(video.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining([
        'mock-kling-21',
        'mock-kling-25',
        'mock-wan-22',
        'mock-wan-25',
        'mock-vidu-q2',
        'mock-vidu-q2-pro',
        'mock-vidu-q2-turbo',
        'mock-pixverse-5',
        'mock-motion-3',
        'mock-motion-3-rapid',
      ]),
    )
    expect(registry.require('kling-api')).toMatchObject({ kind: 'live' })
  })

  test('publishes model-specific image capabilities and narrowed parameters', () => {
    const registry = createDefaultProviderRegistry()

    expect(liblibImageModelCatalog.map(({ modelName }) => modelName)).toEqual([
      'Lib Image',
      'General image Pro',
      'General image V2',
      'Seedream 5.0 Pro',
      'Seedream 4.6',
      'Seedream 5.0 Lite',
      'Seedream 4.5',
      'Seedream 4.0',
      'Style Image V8.2',
      'Style Image V8.1',
      'Style Image V7',
      'Style Image Niji 7',
      'Qwen image 3.0',
      'Qwen Image',
      'Z-image Turbo',
      'Qwen Edit',
      'General image',
    ])
    expect(registry.require('mock-style-image-v82')).toMatchObject({
      capabilities: ['text-to-image', 'image-to-image', 'image-edit'],
      parameterSchema: {
        aspectRatio: { type: 'enum', defaultValue: '16:9', options: ['16:9'] },
        resolution: { type: 'enum', defaultValue: '自适应', options: ['自适应'] },
        count: { type: 'enum', defaultValue: '4', options: ['4'] },
        editStrength: { type: 'number', defaultValue: 0.6, min: 0, max: 1, step: 0.05 },
      },
    })
    expect(registry.require('mock-style-image-v82').parameterSchema.quality).toBeUndefined()
    expect(registry.require('mock-qwen-edit')).toMatchObject({
      kind: 'placeholder',
      disabledReason: 'Qwen Edit 图片编辑适配器待接入',
      capabilities: ['image-to-image', 'image-edit'],
    })
  })

  test('publishes model-specific video modes, duration bounds, and notices', () => {
    const registry = createDefaultProviderRegistry()

    expect(registry.require('mock-seedance-25')).toMatchObject({
      modelName: 'Seedance 2.5',
      modelNotice: '全能参考、最长 30 秒音画同步，预计 2 分钟。',
      capabilities: ['text-to-video', 'image-to-video'],
      supportedVideoModes: ['文生视频', '全能参考', '图生视频', '首尾帧', '图片参考'],
      parameterSchema: {
        duration: { type: 'enum', defaultValue: '5', options: ['5', '10', '15', '20', '30'] },
        aspectRatio: { type: 'enum', defaultValue: '16:9', options: ['Auto', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'] },
        quality: { type: 'enum', defaultValue: '1080P', options: ['720P', '1080P'] },
        sound: { type: 'boolean', defaultValue: true },
      },
    })
    expect(registry.require('mock-kling-o3')).toMatchObject({
      modelName: 'Kling O3',
      modelNotice: '支持视频编辑、参考一致性、音画同出与多镜头，预计 3 分钟。',
      parameterSchema: {
        duration: { type: 'enum', defaultValue: '5', options: ['3', '5', '10'] },
        quality: { type: 'enum', defaultValue: '高清', options: ['标准', '高清', '4K'] },
        sound: { type: 'boolean', defaultValue: true },
        multiShot: { type: 'boolean', defaultValue: true },
      },
    })
    expect(registry.require('mock-kling-30-turbo')).toMatchObject({
      modelName: 'Kling 3.0 Turbo',
      modelNotice: '高质感、多镜头生成，预计 3 分钟。',
      capabilities: ['text-to-video', 'image-to-video'],
      parameterSchema: {
        duration: { type: 'enum', defaultValue: '5', options: ['5', '10'] },
        multiShot: { type: 'boolean', defaultValue: true },
      },
    })
    expect(registry.require('mock-kling-30-turbo').parameterSchema.sound).toBeUndefined()
    expect(registry.require('mock-minimax-h3')).toMatchObject({
      modelName: 'Minimax H3',
      modelNotice: '全模态输入、多参数控制、商用级，预计 2 分钟。',
      capabilities: ['text-to-video', 'image-to-video'],
      parameterSchema: {
        duration: { type: 'enum', defaultValue: '5', options: ['5', '10'] },
        sound: { type: 'boolean', defaultValue: true },
      },
    })
    expect(registry.require('mock-wan-27')).toMatchObject({
      modelName: 'Wan 2.7',
      modelNotice: '全能参考，可改画面、剧情与环境，预计 3 分钟。',
      capabilities: ['text-to-video', 'image-to-video'],
      parameterSchema: {
        duration: { type: 'enum', defaultValue: '5', options: ['5', '10', '15'] },
      },
    })
    expect(registry.require('mock-wan-27').parameterSchema.sound).toBeUndefined()

    expect(registry.require('mock-kling-video')).toMatchObject({
      modelName: '可灵O1',
      modelNotice: '支持 4K、全能参考、视频编辑与首尾帧。',
      supportedVideoModes: ['文生视频', '全能参考', '图生视频', '首尾帧', '图片参考'],
    })
    expect(registry.require('mock-wan-26')).toMatchObject({
      modelNotice: '支持音画同步、视频参考与首帧驱动。',
    })
    expect(registry.require('mock-motion-31')).toMatchObject({
      modelNotice: '支持文生视频、单图、多图参考与首尾帧。',
    })
    expect(registry.require('mock-omnihuman-15')).toMatchObject({
      modelNotice: '数字人模式：请添加人物图片和驱动音频。',
      supportedVideoModes: ['图生视频', '图片参考'],
    })
    expect(registry.require('mock-wan-motion-control')).toMatchObject({
      modelName: '动作迁移',
      kind: 'demo',
      supportedVideoModes: ['图生视频', '首尾帧', '图片参考'],
    })
  })

  test('filters image and video selectors by declared capability', () => {
    const registry = createDefaultProviderRegistry()
    const image = registry.matching(['text-to-image', 'image-to-image'])
    const video = registry.matching(['text-to-video', 'image-to-video'])

    expect(image.map(({ id }) => id)).toEqual(
      liblibImageModelCatalog.map(({ providerId }) => providerId),
    )
    expect(video.map(({ id }) => id)).toEqual(
      liblibVideoModelCatalog.map(({ providerId }) => providerId),
    )
    expect(image.every((provider) => !provider.capabilities.includes('audio'))).toBe(true)
  })

  test('keeps supplemental image mocks Liblib-aligned without a Kling image provider', () => {
    const registry = createDefaultProviderRegistry()

    expect(registry.list().map(({ id }) => id)).not.toContain('mock-kling-image')
    expect(registry.list().map(({ modelName }) => modelName)).not.toContain('可灵图片')
    expect(registry.require('mock-tongyi-image')).toMatchObject({
      modelName: '通义万相图片',
      capabilities: ['text-to-image', 'image-to-image'],
      pricing: { amount: 6 },
    })
    expect(
      registry.describe({
        ...imageRequest,
        targetKind: 'audio',
        providerId: 'mock-audio',
        parameters: { modelVariant: 'narration' },
      }),
    ).toMatchObject({ estimatedCost: 8 })
    expect(
      registry.describe({
        ...imageRequest,
        targetKind: 'audio',
        providerId: 'mock-audio',
        parameters: { modelVariant: 'sound-effect' },
      }),
    ).toMatchObject({ estimatedCost: 3 })
  })

  test('resolves video modes from the selected provider capabilities', () => {
    const registry = createDefaultProviderRegistry()
    const flexible = registry.require('mock-seedance-25')
    const textOnly = registry.require('kling-api')

    expect(resolveVideoGenerationMode(flexible, defaultVideoGenerationMode)).toBe(
      '全能参考',
    )
    expect(resolveVideoGenerationMode(textOnly, '全能参考')).toBe('文生视频')
    expect(resolveVideoGenerationMode(textOnly, '文生视频')).toBe('文生视频')
  })

  test('uses Seedance 2.5 as the flagship default for video requests', () => {
    const registry = createDefaultProviderRegistry()

    expect(registry.resolve({
      ...imageRequest,
      targetKind: 'video',
      providerId: undefined,
      referenceAssets: [],
    })).toMatchObject({ id: 'mock-seedance-25', modelName: 'Seedance 2.5' })
  })

  test('rejects duplicate provider ids and never performs network work while live configuration is disabled', async () => {
    const registry = createDefaultProviderRegistry()
    const provider = registry.require('kling-api')
    expect(() => registry.register(provider)).toThrow('Provider already registered: kling-api')

    await expect(
      registry.generate(
        { ...imageRequest, providerId: 'kling-api', targetKind: 'video' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('可灵开发验证配置未完成')
  })

  test('dispatches mock generation with progress, cost and deterministic result metadata', async () => {
    vi.useFakeTimers()
    const registry = createDefaultProviderRegistry()
    const progress: number[] = []
    const pending = registry.generate(imageRequest, {
      signal: new AbortController().signal,
      onProgress: (value) => progress.push(value),
    })

    await vi.advanceTimersByTimeAsync(1200)
    await expect(pending).resolves.toMatchObject({
      asset: { kind: 'image', url: '/demo/shot-river.png' },
      usage: {
        providerId: 'mock-mj-image',
        providerName: 'Mock Studio',
        modelName: 'Lib Image',
        cost: 18,
        currency: 'credits',
      },
    })
    expect(progress).toEqual([25, 55, 85, 100])
  })

  test('prices each requested image output through the provider contract', () => {
    const registry = createDefaultProviderRegistry()

    expect(
      registry.describe({
        ...imageRequest,
        parameters: { count: 2 },
      }),
    ).toMatchObject({ estimatedCost: 36 })
  })

  test('propagates registry identity, progress and charged cost through persisted queue history', async () => {
    vi.useFakeTimers()
    const jobs: Array<{ status: string; progress?: number; creditsSpent?: number }> = []
    const registry = createDefaultProviderRegistry()
    const queue = new GenerationQueue({
      adapter: new RegistryGenerationAdapter(registry),
      onJobChange: (job) => jobs.push({ ...job }),
      onSuccess: () => undefined,
    })

    const job = queue.enqueue(imageRequest)
    expect(job).toMatchObject({
      providerId: 'mock-mj-image',
      providerName: 'Mock Studio',
      modelName: 'Lib Image',
      estimatedCost: 18,
      progress: 0,
    })

    await vi.advanceTimersByTimeAsync(1200)
    expect(queue.get(job.id)).toMatchObject({
      status: 'succeeded',
      progress: 100,
      creditsSpent: 18,
    })
    expect(jobs.some(({ status, progress }) => status === 'running' && progress === 55)).toBe(true)
  })

  test('uses the selected video model defaults for local result metadata and billing', async () => {
    vi.useFakeTimers()
    const registry = createDefaultProviderRegistry()
    const pending = registry.generate(
      {
        projectId: 'project-video',
        nodeId: 'video-1',
        operation: 'regenerate',
        targetKind: 'video',
        providerId: 'mock-seedance-video',
        prompt: '雨夜横移镜头',
        referenceAssets: [],
      },
      { signal: new AbortController().signal },
    )

    await vi.advanceTimersByTimeAsync(1200)
    await expect(pending).resolves.toMatchObject({
      asset: { kind: 'video', durationSeconds: 5 },
      usage: {
        providerId: 'mock-seedance-video',
        modelName: '即梦1.5 Pro',
        cost: 135,
      },
    })
  })

  test('dispatches local export through the same provider registry', async () => {
    vi.useFakeTimers()
    const registry = createDefaultProviderRegistry()
    const progress: number[] = []
    const pending = registry.export(
      'mock-kling-video',
      { projectId: 'project-preview', settings: exportSettings },
      {
        signal: new AbortController().signal,
        onProgress: (value) => progress.push(value),
      },
    )

    await vi.advanceTimersByTimeAsync(1800)
    await expect(pending).resolves.toMatchObject({
      exportJobId: 'demo-export-project-preview',
      downloadUrl: '/demo/exports/project-preview.mp4',
      providerId: 'mock-kling-video',
      providerName: 'Mock Studio',
      cost: 24,
    })
    expect(progress).toEqual([17, 33, 50, 67, 83, 100])
  })

  test('supports an empty registry for dependency injection', () => {
    const registry = new ProviderRegistry()
    expect(registry.list()).toEqual([])
    expect(() => registry.require('missing')).toThrow('Unknown model provider: missing')
  })
})
