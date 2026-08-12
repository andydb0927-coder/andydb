import { describe, expect, test } from 'vitest'

import type { LibraryAssetRecord } from '../assets/library-model'
import { makeProjectFixture } from '../../test/fixtures'
import {
  buildCreativeCardCreation,
  creativeCardSummary,
  nextCreativeCardTitle,
  updateCreativeCardProject,
  validateCreativeCardDraft,
  type CreativeCardDraft,
} from './creative-card'

const imageRecord: LibraryAssetRecord = {
  id: 'library-character-look',
  name: '角色定妆照.png',
  kind: 'image',
  mimeType: 'image/png',
  url: 'data:image/png;base64,AA==',
  createdAt: '2026-08-12T08:00:00.000Z',
  source: 'upload',
  width: 1024,
  height: 1024,
}

const drafts = {
  script: {
    kind: 'script',
    title: '雨夜重逢',
    scenes: '场一：河岸夜外',
    dialogue: '林渊：你终于来了。',
    shotNotes: '从远景缓慢推近。',
  },
  'character-card': {
    kind: 'character-card',
    title: '林渊角色卡',
    name: '林渊',
    appearance: '短发，右眼下有小痣，冷白皮。',
    wardrobe: '深灰长风衣，银色旧腕表。',
    relationships: '林舟的姐姐，与程野存在旧日心结。',
  },
  worldview: {
    kind: 'worldview',
    title: '潮汐城世界观',
    background: '每年雨季，老城会被河水淹没三天。',
    artStyle: '低饱和蓝绿色，湿润胶片颗粒。',
    rules: '铜铃响起后不得直呼失踪者姓名。',
  },
} satisfies Record<string, CreativeCardDraft>

function environment(...ids: string[]) {
  let index = 0
  return {
    now: () => '2026-08-13T08:00:00.000Z',
    randomId: () => ids[index++] ?? `fallback-${index}`,
  }
}

describe('creative card domain', () => {
  test.each([
    [drafts.script, 'scenes', '请输入分场'],
    [drafts['character-card'], 'name', '请输入姓名'],
    [drafts['character-card'], 'appearance', '请输入外貌锚点'],
    [drafts.worldview, 'background', '请输入背景'],
    [drafts.worldview, 'artStyle', '请输入美术风格'],
  ] as const)('validates required %s field %s', (draft, field, message) => {
    expect(validateCreativeCardDraft({ ...draft, [field]: '   ' })).toMatchObject({
      [field]: message,
    })
  })

  test('bounds titles and every structured field without rejecting optional blanks', () => {
    expect(
      validateCreativeCardDraft({ ...drafts.script, title: 'x'.repeat(41) }),
    ).toMatchObject({ title: '标题不能超过 40 个字符' })
    expect(
      validateCreativeCardDraft({ ...drafts.script, dialogue: 'x'.repeat(2001) }),
    ).toMatchObject({ dialogue: '对白不能超过 2000 个字符' })
    expect(
      validateCreativeCardDraft({
        ...drafts.script,
        dialogue: ' ',
        shotNotes: '',
      }),
    ).toEqual({})
  })

  test('numbers titles independently for all three card kinds', () => {
    const project = makeProjectFixture()
    project.nodes.push(
      {
        ...project.nodes[0],
        id: 'script-card-1',
        kind: 'script',
        title: '剧本卡 03',
        card: { ...drafts.script, kind: 'script' },
      },
      {
        ...project.nodes[0],
        id: 'character-card-1',
        kind: 'character-card',
        title: '角色卡 09',
        card: { ...drafts['character-card'], kind: 'character-card' },
      },
    )

    expect(nextCreativeCardTitle(project, 'script')).toBe('剧本卡 04')
    expect(nextCreativeCardTitle(project, 'character-card')).toBe('角色卡 10')
    expect(nextCreativeCardTitle(project, 'worldview')).toBe('世界观卡 01')
  })

  test('creates a trimmed script card, deterministic summary, and one image snapshot', () => {
    const project = makeProjectFixture()
    const creation = buildCreativeCardCreation(
      project,
      {
        ...drafts.script,
        title: '  雨夜重逢  ',
        scenes: '  场一：河岸夜外  ',
        image: imageRecord,
      },
      { x: 420, y: 280 },
      environment('script-node', 'script-version'),
    )

    expect(creation.node).toMatchObject({
      id: 'script-node',
      kind: 'script',
      title: '雨夜重逢',
      position: { x: 420, y: 280 },
      card: {
        kind: 'script',
        scenes: '场一：河岸夜外',
        dialogue: drafts.script.dialogue,
        shotNotes: drafts.script.shotNotes,
        imageAssetId: imageRecord.id,
      },
    })
    expect(creation.node.versions[0]).toEqual({
      id: 'script-version',
      createdAt: '2026-08-13T08:00:00.000Z',
      prompt: [
        '分场：场一：河岸夜外',
        `对白：${drafts.script.dialogue}`,
        `镜头备注：${drafts.script.shotNotes}`,
      ].join('\n'),
      assetId: imageRecord.id,
    })
    expect(creation.asset).toMatchObject({
      id: imageRecord.id,
      url: imageRecord.url,
      kind: 'image',
    })
  })

  test('retries project-wide id collisions for both the node and version', () => {
    const project = makeProjectFixture()
    const creation = buildCreativeCardCreation(
      project,
      drafts.script,
      { x: 0, y: 0 },
      environment(
        project.nodes[0].id,
        'unique-script-node',
        project.nodes[0].versions[0].id,
        'unique-script-version',
      ),
    )

    expect(creation.node.id).toBe('unique-script-node')
    expect(creation.node.activeVersionId).toBe('unique-script-version')
  })

  test.each([
    [drafts.script, `分场：${drafts.script.scenes}`],
    [drafts['character-card'], `姓名：${drafts['character-card'].name}`],
    [drafts.worldview, `背景：${drafts.worldview.background}`],
  ] as const)('serializes %s in a stable readable order', (draft, firstLine) => {
    const creation = buildCreativeCardCreation(
      makeProjectFixture(),
      draft,
      { x: 0, y: 0 },
      environment('node', 'version'),
    )
    expect(creativeCardSummary(creation.node.card!)).toBe(
      creation.node.versions[0].prompt,
    )
    expect(creation.node.versions[0].prompt.split('\n')[0]).toBe(firstLine)
  })

  test('edits a card as a new version and reuses an existing project asset', () => {
    const project = makeProjectFixture()
    project.assets.push({
      id: imageRecord.id,
      kind: 'image',
      url: imageRecord.url,
      mimeType: imageRecord.mimeType,
    })
    const creation = buildCreativeCardCreation(
      project,
      drafts['character-card'],
      { x: 0, y: 0 },
      environment('character-node', 'character-version-1'),
    )
    const withCard = {
      ...project,
      nodes: [...project.nodes, creation.node],
    }

    const updated = updateCreativeCardProject(
      withCard,
      creation.node.id,
      {
        ...drafts['character-card'],
        wardrobe: '黑色风衣、旧皮手套',
        image: imageRecord,
      },
      environment('character-version-2'),
    )
    const node = updated.nodes.find(({ id }) => id === creation.node.id)!

    expect(node.versions).toHaveLength(2)
    expect(node.activeVersionId).toBe('character-version-2')
    expect(node.card).toMatchObject({
      wardrobe: '黑色风衣、旧皮手套',
      imageAssetId: imageRecord.id,
    })
    expect(updated.assets.filter(({ id }) => id === imageRecord.id)).toHaveLength(1)
  })

  test('rejects invalid creation and mismatched edit targets without mutation', () => {
    const project = makeProjectFixture()
    expect(() =>
      buildCreativeCardCreation(
        project,
        { ...drafts.worldview, background: '' },
        { x: 0, y: 0 },
      ),
    ).toThrow('Invalid creative card draft')
    expect(() =>
      updateCreativeCardProject(project, 'shot-1', drafts.script),
    ).toThrow('Invalid creative card target')
    expect(project).toEqual(makeProjectFixture())
  })
})
