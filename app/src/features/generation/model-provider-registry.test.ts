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
import { resolveModelParameterManifest } from './model-parameter-semantics'

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
        'seedream-5-pro-api',
        'mock-tongyi-image',
        'mock-text-llm',
        'ark-text-llm',
        'mock-seedance-25',
        'mock-seedance-20-vip',
        'mock-seedance-20-mini',
        'mock-kling-o3',
        'mock-kling-30',
        'mock-minimax-h3',
        'mock-audio',
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
    expect(registry.require('seedance-api')).toMatchObject({
      kind: 'live',
      name: '火山方舟',
      modelName: 'Seedance 2.0',
      disabledReason: '火山方舟 Seedance 开发验证配置未完成',
      capabilities: ['text-to-video', 'image-to-video'],
      officialApiEndpoint: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
    })
    expect(registry.require('seedream-5-pro-api')).toMatchObject({
      kind: 'live',
      disabledReason: 'Seedream 开发验证配置未完成',
      capabilities: ['text-to-image', 'image-to-image', 'image-edit'],
      officialApiEndpoint: 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
      sizePolicy: {
        multiImageStrategy: 'serial',
        pixelConstraints: {
          minTotalPixels: 921_600,
          maxTotalPixels: 4_624_220,
          minRatio: 1 / 16,
          maxRatio: 16,
        },
        costMode: { amount: 18, per: 'image' },
      },
    })
    expect(registry.require('mock-seedance-25')).toMatchObject({
      modelName: 'Seedance 2.5',
      parameterSchema: {
        aspectRatio: { type: 'enum', defaultValue: '16:9' },
        duration: { type: 'enum', defaultValue: '5' },
        quality: { type: 'enum', defaultValue: '1080P' },
        sound: { type: 'boolean', defaultValue: true },
        count: { type: 'enum', defaultValue: '1' },
        onlineSearch: { type: 'boolean', defaultValue: true },
        materialValidation: { type: 'boolean', defaultValue: true },
        autoLink: { type: 'boolean', defaultValue: true },
      },
      pricing: { amount: 24, currency: 'credits', unit: 'generation' },
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
    expect(registry.require('ark-text-llm')).toMatchObject({
      name: '火山方舟',
      modelName: '豆包 Seed 2.1 Pro',
      kind: 'live',
      disabledReason: '火山方舟文本开发验证未启用',
      capabilities: ['text'],
      officialApiEndpoint:
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      tokenPricing: {
        inputPerMillionCny: 6,
        outputPerMillionCny: 30,
      },
    })
    expect(registry.require('mock-audio')).toMatchObject({
      variants: [
        expect.objectContaining({ id: 'ambience', name: 'Mureka V8 · 氛围音', pricing: expect.objectContaining({ amount: 4 }) }),
        expect.objectContaining({ id: 'narration', name: 'ElevenLabs V3 · 人声旁白', pricing: expect.objectContaining({ amount: 8 }) }),
        expect.objectContaining({ id: 'sound-effect', name: 'ElevenLabs V2 · 音效', pricing: expect.objectContaining({ amount: 3 }) }),
      ],
    })
  })

  test('compiles every live, placeholder and mock parameter schema from its manifest', () => {
    const registry = createDefaultProviderRegistry()
    for (const provider of registry.list()) {
      expect(provider.parameterManifest).toBeDefined()
      expect(provider.parameterSchema).toEqual(
        resolveModelParameterManifest(provider.parameterManifest),
      )
    }
  })

  test('publishes only the approved six video mocks in flagship order and retains integrations', () => {
    const registry = createDefaultProviderRegistry()
    const image = registry.matching(['text-to-image', 'image-to-image'])
    const video = registry.matching(['text-to-video', 'image-to-video'])

    expect(liblibImageModelCatalog).toHaveLength(17)
    expect(image.map(({ modelName }) => modelName)).toEqual([
      'Seedream 5.0 Pro',
      ...liblibImageModelCatalog.map(({ modelName }) => modelName),
    ])
    expect(liblibVideoModelCatalog).toHaveLength(6)
    expect(liblibVideoModelCatalog.map(({ modelName }) => modelName)).toEqual([
      'Seedance 2.5',
      'Seedance 2.0 VIP',
      'Seedance 2.0 Mini',
      'Kling O3',
      'Kling 3.0',
      'Minimax H3',
    ])
    expect(video.map(({ id }) => id)).toEqual([
      'mock-seedance-25',
      'mock-seedance-20-vip',
      'mock-seedance-20-mini',
      'mock-kling-o3',
      'mock-kling-30',
      'mock-minimax-h3',
      'seedance-api',
    ])
    const retiredIds = [
      'mock-kling-30-turbo',
      'mock-wan-27',
      'mock-wan-26',
      'mock-hailuo-23',
      'mock-hailuo-23-fast',
      'mock-hailuo-o2',
      'mock-vidu-q3-pro',
      'mock-pixverse-55',
      'mock-omnihuman-15',
      'mock-mj-video',
    ]
    expect(registry.list().map(({ id }) => id)).not.toEqual(
      expect.arrayContaining(retiredIds),
    )
    expect(registry.require('seedance-api')).toMatchObject({ kind: 'live' })
    expect(registry.require('tongyi-api')).toMatchObject({ kind: 'placeholder' })
    expect(
      registry
        .list()
        .filter(
          ({ kind, capabilities }) =>
            kind === 'demo' &&
            capabilities.some((capability) =>
              capability === 'text-to-video' || capability === 'image-to-video',
            ),
        )
        .map(({ id }) => id),
    ).toEqual(liblibVideoModelCatalog.map(({ providerId }) => providerId))
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
    expect(registry.require('mock-seedance-20-vip')).toMatchObject({
      modelName: 'Seedance 2.0 VIP',
      modelNotice: '全能参考、最长 15 秒音画同步、会员通道，预计 2 分钟。',
      parameterSchema: {
        duration: { type: 'enum', defaultValue: '5', options: ['5', '10', '15'] },
        quality: { type: 'enum', defaultValue: '1080P', options: ['720P', '1080P'] },
        sound: { type: 'boolean', defaultValue: true },
      },
    })
    expect(registry.require('mock-seedance-20-mini')).toMatchObject({
      modelName: 'Seedance 2.0 Mini',
      modelNotice: '高性价比、最长 15 秒音画同步，预计 2 分钟。',
      parameterSchema: {
        duration: { type: 'enum', defaultValue: '5', options: ['5', '10', '15'] },
        quality: { type: 'enum', defaultValue: '720P', options: ['720P', '1080P'] },
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
    expect(registry.require('mock-kling-30')).toMatchObject({
      modelName: 'Kling 3.0',
      modelNotice: '高质感、多镜头生成，预计 3 分钟。',
      capabilities: ['text-to-video', 'image-to-video'],
      parameterSchema: {
        duration: { type: 'enum', defaultValue: '5', options: ['5', '10'] },
        multiShot: { type: 'boolean', defaultValue: true },
      },
    })
    expect(registry.require('mock-kling-30').parameterSchema.sound).toBeUndefined()
    expect(registry.require('mock-minimax-h3')).toMatchObject({
      modelName: 'Minimax H3',
      modelNotice: '全模态输入、多参数控制、商用级，预计 2 分钟。',
      capabilities: ['text-to-video', 'image-to-video'],
      parameterSchema: {
        duration: { type: 'enum', defaultValue: '5', options: ['5', '10'] },
        sound: { type: 'boolean', defaultValue: true },
      },
    })
  })

  test('filters image and video selectors by declared capability', () => {
    const registry = createDefaultProviderRegistry()
    const image = registry.matching(['text-to-image', 'image-to-image'])
    const video = registry.matching(['text-to-video', 'image-to-video'])

    expect(image.map(({ id }) => id)).toEqual([
      'seedream-5-pro-api',
      ...liblibImageModelCatalog.map(({ providerId }) => providerId),
    ])
    expect(video.map(({ id }) => id)).toEqual([
      ...liblibVideoModelCatalog.map(({ providerId }) => providerId),
      'seedance-api',
    ])
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
    const liveSeedance = registry.require('seedance-api')

    expect(resolveVideoGenerationMode(flexible, defaultVideoGenerationMode)).toBe(
      '全能参考',
    )
    expect(resolveVideoGenerationMode(liveSeedance, '全能参考')).toBe('全能参考')
    expect(resolveVideoGenerationMode(liveSeedance, '文生视频')).toBe('文生视频')
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
    const provider = registry.require('seedance-api')
    expect(() => registry.register(provider)).toThrow('Provider already registered: seedance-api')

    await expect(
      registry.generate(
        { ...imageRequest, providerId: 'seedance-api', targetKind: 'video' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('火山方舟 Seedance 开发验证配置未完成')
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
        providerId: 'mock-seedance-20-vip',
        prompt: '雨夜横移镜头',
        referenceAssets: [],
      },
      { signal: new AbortController().signal },
    )

    await vi.advanceTimersByTimeAsync(1200)
    await expect(pending).resolves.toMatchObject({
      asset: { kind: 'video', durationSeconds: 5 },
      usage: {
        providerId: 'mock-seedance-20-vip',
        modelName: 'Seedance 2.0 VIP',
        cost: 24,
      },
    })
  })

  test('dispatches local export through the same provider registry', async () => {
    vi.useFakeTimers()
    const registry = createDefaultProviderRegistry()
    const progress: number[] = []
    const pending = registry.export(
      'mock-kling-o3',
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
      providerId: 'mock-kling-o3',
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
