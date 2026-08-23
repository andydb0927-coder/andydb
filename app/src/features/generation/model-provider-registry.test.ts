import { afterEach, describe, expect, test, vi } from 'vitest'

import type { ExportSettings } from '../export/export-adapter'
import type { GenerationRequest } from './generation-adapter'
import { GenerationQueue } from './generation-queue'
import {
  ProviderRegistry,
  createDefaultProviderRegistry,
  defaultVideoGenerationMode,
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

    expect(registry.list().map(({ id }) => id)).toEqual([
      'mock-mj-image',
      'mock-kling-image',
      'mock-tongyi-image',
      'mock-text-llm',
      'mock-kling-video',
      'mock-seedance-video',
      'mock-audio',
      'kling-api',
      'seedance-api',
      'tongyi-api',
    ])
    expect(registry.require('mock-mj-image')).toMatchObject({
      name: 'Mock Studio',
      modelName: 'MJ 风格图片',
      kind: 'demo',
      badge: '演示',
      capabilities: ['text-to-image', 'image-to-image'],
      parameterSchema: {
        aspectRatio: { type: 'enum', defaultValue: '16:9' },
        resolution: { type: 'enum', defaultValue: '1920×1080' },
      },
      pricing: { amount: 18, currency: 'credits', unit: 'generation' },
      officialApiEndpoint: 'mock://local/mj-image',
    })
    expect(registry.require('kling-api')).toMatchObject({
      kind: 'live',
      disabledReason: '可灵开发验证配置未完成',
      capabilities: ['text-to-video'],
      officialApiEndpoint: 'https://api.klingai.com/text-to-video/kling-2.6',
    })
    expect(registry.require('mock-seedance-video')).toMatchObject({
      modelName: 'Seedance 2.0',
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
        expect.objectContaining({ id: 'basic-copy', name: '基础文案', pricing: expect.objectContaining({ amount: 8 }) }),
        expect.objectContaining({ id: 'deep-script', name: '深度脚本', pricing: expect.objectContaining({ amount: 12 }) }),
        expect.objectContaining({ id: 'idea-expansion', name: '灵感扩展', pricing: expect.objectContaining({ amount: 15 }) }),
      ],
    })
    expect(registry.require('mock-audio')).toMatchObject({
      variants: [
        expect.objectContaining({ id: 'ambience', name: '氛围音', pricing: expect.objectContaining({ amount: 4 }) }),
        expect.objectContaining({ id: 'narration', name: '人声旁白', pricing: expect.objectContaining({ amount: 8 }) }),
        expect.objectContaining({ id: 'sound-effect', name: '音效', pricing: expect.objectContaining({ amount: 3 }) }),
      ],
    })
  })

  test('filters image and video selectors by declared capability', () => {
    const registry = createDefaultProviderRegistry()
    const image = registry.matching(['text-to-image', 'image-to-image'])
    const video = registry.matching(['text-to-video', 'image-to-video'])

    expect(image.map(({ id }) => id)).toEqual([
      'mock-mj-image',
      'mock-kling-image',
      'mock-tongyi-image',
      'tongyi-api',
    ])
    expect(video.map(({ id }) => id)).toEqual([
      'mock-kling-video',
      'mock-seedance-video',
      'kling-api',
      'seedance-api',
      'tongyi-api',
    ])
    expect(image.every((provider) => !provider.capabilities.includes('audio'))).toBe(true)
  })

  test('publishes Liblib-aligned mock image parameters and variant-aware costs', () => {
    const registry = createDefaultProviderRegistry()

    expect(registry.require('mock-kling-image')).toMatchObject({
      modelName: '可灵图片',
      capabilities: ['text-to-image'],
      parameterSchema: {
        aspectRatio: {
          defaultValue: '16:9',
          options: ['1:1', '16:9', '9:16', '2:3', '3:2'],
        },
      },
      pricing: { amount: 8 },
    })
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
    const flexible = registry.require('mock-seedance-video')
    const textOnly = registry.require('kling-api')

    expect(resolveVideoGenerationMode(flexible, defaultVideoGenerationMode)).toBe(
      '全能参考',
    )
    expect(resolveVideoGenerationMode(textOnly, '全能参考')).toBe('文生视频')
    expect(resolveVideoGenerationMode(textOnly, '文生视频')).toBe('文生视频')
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
        modelName: 'MJ 风格图片',
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
      modelName: 'MJ 风格图片',
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
        modelName: 'Seedance 2.0',
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
