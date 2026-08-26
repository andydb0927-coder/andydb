import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import type { CreativeNodeData } from '../canvas/node-types'
import {
  ImageGenerationPanel,
  ImageResults,
} from '../canvas/nodes/ImageNodeDetails'
import type { GenerationRequest } from './generation-adapter'
import type { ImageSizePolicy } from './image-size-resolver'
import {
  ProviderRegistry,
  createDemoProviderFromManifest,
} from './model-provider-registry'
import { standardImageAspectRatios } from './model-parameter-semantics'

const fixtureSizePolicy: ImageSizePolicy = {
  aspectOptions: [...standardImageAspectRatios, '自适应', '自定义'],
  resolutionTiers: [
    { id: '1K', squareEdge: 1024 },
    { id: '1.5K', squareEdge: 1536 },
    {
      id: '2K',
      squareEdge: 2048,
      exactSizes: { '16:9': [2816, 1584], '9:21': [1344, 3136] },
    },
  ],
  pixelConstraints: {
    minTotalPixels: 921_600,
    maxTotalPixels: 4_624_220,
    minRatio: 1 / 16,
    maxRatio: 16,
  },
  multiImageStrategy: 'batch',
  costMode: { amount: 7, per: 'image' },
}

const fixtureProvider = createDemoProviderFromManifest({
  id: 'fixture-manifest-image',
  name: 'Fixture Studio',
  modelName: 'Manifest Image X',
  capabilities: ['text-to-image', 'image-to-image'],
  parameters: {
    aspectRatio: {
      semantic: true,
      options: fixtureSizePolicy.aspectOptions,
      defaultValue: '16:9',
    },
    resolution: true,
    count: true,
    customWidth: { type: 'number', defaultValue: 2048, min: 1, max: 10_000, step: 1 },
    customHeight: { type: 'number', defaultValue: 2048, min: 1, max: 10_000, step: 1 },
  },
  sizePolicy: fixtureSizePolicy,
  pricing: { amount: 7, currency: 'credits', unit: 'generation' },
  officialApiEndpoint: 'mock://fixture/manifest-image-x',
  fixture: { imageUrl: '/demo/shot-river.png' },
})

function fixtureData(): CreativeNodeData {
  return {
    node: {
      id: 'manifest-node',
      kind: 'image',
      title: '声明式图片节点',
      position: { x: 0, y: 0 },
      versions: [{
        id: 'manifest-version',
        createdAt: '2026-08-26T00:00:00.000Z',
        prompt: '声明式新模型测试',
      }],
      activeVersionId: 'manifest-version',
      sourceChanged: false,
      modelProviderId: fixtureProvider.id,
      generationConfig: {
        targetKind: 'image',
        providerId: fixtureProvider.id,
        parameters: { aspectRatio: '16:9', resolution: '2K', count: 1 },
        referenceAssets: [],
      },
    },
    providerRegistry: new ProviderRegistry([fixtureProvider]),
    selected: true,
    contextual: true,
    actionsPlacement: 'after',
    connectionMode: false,
    connectionSource: false,
    focusOnMount: false,
    focusRequestVersion: 0,
    onAction: vi.fn(),
    onSelect: vi.fn(),
    onHandleActivate: vi.fn(),
    onFocusComplete: vi.fn(),
    onDelete: vi.fn(),
    onUpdateImageGenerationSettings: vi.fn(),
    onSelectModelProvider: vi.fn(),
    onLocalImageGenerate: vi.fn(),
  }
}

afterEach(() => vi.useRealTimers())

test('adds a complete image model from manifest and fixture without UI branches', async () => {
  const user = userEvent.setup()
  const data = fixtureData()
  const view = render(
    <ImageGenerationPanel
      data={data}
      imageToImage={false}
      onImageToImageChange={vi.fn()}
      upscalePending={false}
      onUpscalePendingChange={vi.fn()}
      upscaleTriggerRef={createRef<HTMLButtonElement>()}
    />,
  )
  const panel = screen.getByRole('region', { name: '声明式图片节点 生成参数' })
  expect(within(panel).getByRole('combobox', { name: '图片模型' })).toHaveValue(
    'fixture-manifest-image',
  )
  const trigger = within(panel).getByRole('button', { name: '图片生成参数' })
  expect(trigger).toHaveTextContent('2816×1584 · 2K · 1张')
  expect(within(panel).getByText('预计成本 7')).toBeVisible()
  expect(data.providerRegistry?.describe({
    projectId: 'fixture-project',
    nodeId: 'manifest-node',
    operation: 'regenerate',
    targetKind: 'image',
    providerId: fixtureProvider.id,
    prompt: '声明式新模型测试',
    parameters: { aspectRatio: '9:21', resolution: '2K', count: 4 },
    referenceAssets: [],
  })).toMatchObject({ estimatedCost: 28 })

  await user.click(trigger)
  const parameters = within(panel).getByRole('dialog', { name: '图片生成参数' })
  expect(within(parameters).getByRole('group', { name: '比例' }).querySelectorAll('button'))
    .toHaveLength(15)
  await user.click(within(parameters).getByRole('button', { name: '9:21' }))
  await user.click(within(parameters).getByRole('button', { name: '4张' }))
  expect(trigger).toHaveTextContent('1344×3136 · 2K · 4张')
  expect(within(panel).getByText('预计成本 28')).toBeVisible()
  view.unmount()

  vi.useFakeTimers()
  const request: GenerationRequest = {
    projectId: 'fixture-project',
    nodeId: 'manifest-node',
    operation: 'regenerate',
    targetKind: 'image',
    providerId: fixtureProvider.id,
    prompt: '声明式新模型测试',
    parameters: { aspectRatio: '9:21', resolution: '2K', count: 4 },
    referenceAssets: [],
  }
  const pending = fixtureProvider.generate(request, {
    signal: new AbortController().signal,
  })
  await vi.advanceTimersByTimeAsync(1_200)
  const result = await pending
  expect(result.assets).toHaveLength(4)
  expect(result.assets?.[0]).toMatchObject({ width: 1344, height: 3136 })

  const resultsData: CreativeNodeData = {
    ...fixtureData(),
    imageResults: result.assets?.map((asset, index) => ({
      id: `fixture-result-${index + 1}`,
      asset,
    })),
  }
  render(<ImageResults data={resultsData} />)
  fireEvent.click(screen.getByRole('button', { name: '查看 4 张结果' }))
  expect(
    within(screen.getByRole('region', { name: '声明式图片节点 的 4 张结果' }))
      .getAllByRole('img'),
  ).toHaveLength(4)
})
