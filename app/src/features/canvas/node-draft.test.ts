import { describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import type { CanvasNode, Project } from '../project/model'
import {
  buildCanvasCreation,
  nextNodeTitle,
  validateNodeDraft,
  type CreationEnvironment,
  type CreatableNodeKind,
} from './node-draft'

function projectWithNodes(nodes: CanvasNode[]): Project {
  return {
    ...makeProjectFixture(),
    nodes,
  }
}

function titledNode(
  id: string,
  kind: CreatableNodeKind,
  title: string,
): CanvasNode {
  return {
    id,
    kind,
    title,
    position: { x: 0, y: 0 },
    versions: [],
    activeVersionId: '',
    sourceChanged: false,
  }
}

function deterministicEnvironment(): CreationEnvironment {
  const ids = ['node-id', 'version-id', 'asset-id']

  return {
    now: () => '2026-08-09T08:00:00.000Z',
    randomId: vi.fn(() => ids.shift() ?? 'unexpected-id'),
  }
}

describe('canvas node draft domain', () => {
  test.each([
    ['text', '文本 04'],
    ['image', '图片 01'],
    ['storyboard', '分镜 13'],
    ['video', '视频 02'],
  ] as const)(
    'numbers the next %s title after the highest recognizable suffix',
    (kind, expected) => {
      const project = projectWithNodes([
        titledNode('text-1', 'text', '文本 01'),
        titledNode('text-3', 'text', '文本 03'),
        titledNode('story-2', 'storyboard', '分镜 02'),
        titledNode('story-12', 'storyboard', '分镜 12'),
        titledNode('story-copy', 'storyboard', '分镜副本'),
        titledNode('video-1', 'video', '视频 01'),
      ])

      expect(nextNodeTitle(project, kind)).toBe(expected)
    },
  )

  test('permits a manually duplicated title after validating its content', () => {
    expect(
      validateNodeDraft({
        kind: 'text',
        title: '文本 01',
        content: '重复标题仍是有效内容',
      }),
    ).toEqual({})
  })

  test.each([
    [
      { kind: 'text', title: ' ', content: '' } as const,
      { title: '请输入标题', content: '请输入文字内容' },
    ],
    [
      { kind: 'storyboard', title: '分镜', content: '' } as const,
      { content: '请输入画面提示词' },
    ],
    [
      { kind: 'video', title: '视频', content: '' } as const,
      { content: '请输入视频提示词' },
    ],
    [
      { kind: 'image', title: '图片', content: '' } as const,
      { image: '请选择图片' },
    ],
  ])('reports the missing fields for %#', (draft, expected) => {
    expect(validateNodeDraft(draft)).toEqual(expected)
  })

  test('rejects trimmed titles and content beyond their limits', () => {
    expect(
      validateNodeDraft({
        kind: 'text',
        title: ` ${'题'.repeat(41)} `,
        content: ` ${'字'.repeat(1001)} `,
      }),
    ).toEqual({
      title: '标题不能超过 40 个字符',
      content: '文字内容不能超过 1000 个字符',
    })
  })

  test('accepts title and content at their maximum trimmed lengths', () => {
    expect(
      validateNodeDraft({
        kind: 'video',
        title: ` ${'题'.repeat(40)} `,
        content: ` ${'字'.repeat(1000)} `,
      }),
    ).toEqual({})
  })

  test.each([
    ['text', '文字节点', '雨落在旧车站'],
    ['storyboard', '镜头节点', '远景，人物走入雨幕'],
    ['video', '视频节点', '镜头缓慢向前推进'],
  ] as const)(
    'builds one initial version for a %s node without an asset',
    (kind, title, content) => {
      const creation = buildCanvasCreation(
        makeProjectFixture(),
        {
          kind,
          title: ` ${title} `,
          content: ` ${content} `,
          position: { x: 120, y: 240 },
        },
        deterministicEnvironment(),
      )

      expect(creation).toEqual({
        node: {
          id: 'node-id',
          kind,
          title,
          position: { x: 120, y: 240 },
          versions: [
            {
              id: 'version-id',
              createdAt: '2026-08-09T08:00:00.000Z',
              prompt: content,
            },
          ],
          activeVersionId: 'version-id',
          sourceChanged: false,
        },
      })
    },
  )

  test('builds an image node and durable asset in node-version-asset ID order', () => {
    const environment = deterministicEnvironment()

    const creation = buildCanvasCreation(
      makeProjectFixture(),
      {
        kind: 'image',
        title: ' 雨夜参考 ',
        content: '',
        position: { x: 120, y: 240 },
        image: {
          dataUrl: 'data:image/png;base64,AA==',
          mimeType: 'image/png',
        },
      },
      environment,
    )

    expect(creation).toEqual({
      node: {
        id: 'node-id',
        kind: 'image',
        title: '雨夜参考',
        position: { x: 120, y: 240 },
        versions: [
          {
            id: 'version-id',
            createdAt: '2026-08-09T08:00:00.000Z',
            prompt: '雨夜参考',
            assetId: 'asset-id',
          },
        ],
        activeVersionId: 'version-id',
        sourceChanged: false,
      },
      asset: {
        id: 'asset-id',
        kind: 'image',
        url: 'data:image/png;base64,AA==',
        mimeType: 'image/png',
      },
    })
    expect(environment.randomId).toHaveBeenCalledTimes(3)
  })

  test('uses the trimmed image description when one is supplied', () => {
    const creation = buildCanvasCreation(
      makeProjectFixture(),
      {
        kind: 'image',
        title: '窗边参考',
        content: ' 雨滴沿玻璃滑落 ',
        position: { x: 0, y: 0 },
        image: {
          dataUrl: 'data:image/webp;base64,AA==',
          mimeType: 'image/webp',
        },
      },
      deterministicEnvironment(),
    )

    expect(creation.node.versions[0].prompt).toBe('雨滴沿玻璃滑落')
  })

  test('refuses to build an invalid draft', () => {
    expect(() =>
      buildCanvasCreation(
        makeProjectFixture(),
        {
          kind: 'image',
          title: '图片',
          content: '',
          position: { x: 0, y: 0 },
        },
        deterministicEnvironment(),
      ),
    ).toThrow('Invalid canvas node draft')
  })
})
