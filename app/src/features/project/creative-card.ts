import {
  libraryRecordToAsset,
  type LibraryAssetRecord,
} from '../assets/library-model'
import type {
  CanvasCreation,
  CanvasNode,
  CreativeCard,
  CreativeCardKind,
  Project,
} from './model'

const MAX_TITLE_LENGTH = 40
const MAX_FIELD_LENGTH = 2_000

export type CreativeCardDraft =
  | {
      kind: 'script'
      title: string
      scenes: string
      dialogue: string
      shotNotes: string
      image?: LibraryAssetRecord
    }
  | {
      kind: 'character-card'
      title: string
      name: string
      appearance: string
      wardrobe: string
      relationships: string
      image?: LibraryAssetRecord
    }
  | {
      kind: 'worldview'
      title: string
      background: string
      artStyle: string
      rules: string
      image?: LibraryAssetRecord
    }

export type CreativeCardField =
  | 'title'
  | 'scenes'
  | 'dialogue'
  | 'shotNotes'
  | 'name'
  | 'appearance'
  | 'wardrobe'
  | 'relationships'
  | 'background'
  | 'artStyle'
  | 'rules'
  | 'image'

export type CreativeCardValidationErrors = Partial<
  Record<CreativeCardField, string>
>

export interface CreativeCardEnvironment {
  now(): string
  randomId(): string
}

const defaultEnvironment: CreativeCardEnvironment = {
  now: () => new Date().toISOString(),
  randomId: () => crypto.randomUUID(),
}

const titlePrefixes: Record<CreativeCardKind, string> = {
  script: '剧本卡',
  'character-card': '角色卡',
  worldview: '世界观卡',
}

const fieldLabels: Record<Exclude<CreativeCardField, 'title' | 'image'>, string> = {
  scenes: '分场',
  dialogue: '对白',
  shotNotes: '镜头备注',
  name: '姓名',
  appearance: '外貌锚点',
  wardrobe: '服化道',
  relationships: '关系',
  background: '背景',
  artStyle: '美术风格',
  rules: '规则',
}

const requiredFields: Record<CreativeCardKind, readonly CreativeCardField[]> = {
  script: ['scenes'],
  'character-card': ['name', 'appearance'],
  worldview: ['background', 'artStyle'],
}

export function isCreativeCardKind(value: unknown): value is CreativeCardKind {
  return value === 'script' || value === 'character-card' || value === 'worldview'
}

export function validateCreativeCardDraft(
  draft: CreativeCardDraft,
): CreativeCardValidationErrors {
  const errors: CreativeCardValidationErrors = {}
  const title = draft.title.trim()
  if (!title) errors.title = '请输入标题'
  else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `标题不能超过 ${MAX_TITLE_LENGTH} 个字符`
  }

  for (const [field, value] of cardTextFields(draft)) {
    const normalized = value.trim()
    if (requiredFields[draft.kind].includes(field) && !normalized) {
      errors[field] = `请输入${fieldLabels[field]}`
    } else if (normalized.length > MAX_FIELD_LENGTH) {
      errors[field] = `${fieldLabels[field]}不能超过 ${MAX_FIELD_LENGTH} 个字符`
    }
  }
  if (draft.image && draft.image.kind !== 'image') {
    errors.image = '只能引用图片素材'
  }
  return errors
}

export function nextCreativeCardTitle(
  project: Project,
  kind: CreativeCardKind,
): string {
  const prefix = titlePrefixes[kind]
  const pattern = new RegExp(`^${prefix} (\\d+)$`)
  const highest = project.nodes.reduce((current, node) => {
    if (node.kind !== kind) return current
    const match = pattern.exec(node.title)
    return Math.max(current, match ? Number(match[1]) : 0)
  }, 0)
  return `${prefix} ${String(highest + 1).padStart(2, '0')}`
}

export function creativeCardSummary(card: CreativeCard): string {
  const lines =
    card.kind === 'script'
      ? [
          ['分场', card.scenes],
          ['对白', card.dialogue],
          ['镜头备注', card.shotNotes],
        ]
      : card.kind === 'character-card'
        ? [
            ['姓名', card.name],
            ['外貌锚点', card.appearance],
            ['服化道', card.wardrobe],
            ['关系', card.relationships],
          ]
        : [
            ['背景', card.background],
            ['美术风格', card.artStyle],
            ['规则', card.rules],
          ]
  return lines
    .filter(([, value]) => value.length > 0)
    .map(([label, value]) => `${label}：${value}`)
    .join('\n')
}

export function buildCreativeCardCreation(
  project: Project,
  draft: CreativeCardDraft,
  position: CanvasNode['position'],
  environment: CreativeCardEnvironment = defaultEnvironment,
): CanvasCreation {
  assertValidDraft(draft)
  const usedIds = projectIds(project)
  const takeId = () => takeUniqueId(usedIds, environment)
  const card = cardFromDraft(draft)
  const nodeId = takeId()
  const versionId = takeId()
  const createdAt = environment.now()
  const assetAlreadyPresent = Boolean(
    draft.image && project.assets.some(({ id }) => id === draft.image?.id),
  )

  return {
    node: {
      id: nodeId,
      kind: draft.kind,
      title: draft.title.trim(),
      position,
      versions: [
        {
          id: versionId,
          createdAt,
          prompt: creativeCardSummary(card),
          ...(card.imageAssetId ? { assetId: card.imageAssetId } : {}),
        },
      ],
      activeVersionId: versionId,
      sourceChanged: false,
      card,
    },
    ...(draft.image && !assetAlreadyPresent
      ? { asset: libraryRecordToAsset(draft.image) }
      : {}),
  }
}

export function updateCreativeCardProject(
  project: Project,
  nodeId: string,
  draft: CreativeCardDraft,
  environment: CreativeCardEnvironment = defaultEnvironment,
): Project {
  assertValidDraft(draft)
  const target = project.nodes.find(({ id }) => id === nodeId)
  if (!target || target.kind !== draft.kind || !target.card) {
    throw new Error('Invalid creative card target')
  }
  const usedIds = projectIds(project)
  const versionId = takeUniqueId(usedIds, environment)
  const updatedAt = environment.now()
  const card = cardFromDraft(draft)
  const version = {
    id: versionId,
    createdAt: updatedAt,
    prompt: creativeCardSummary(card),
    ...(card.imageAssetId ? { assetId: card.imageAssetId } : {}),
  }
  return {
    ...project,
    updatedAt,
    assets:
      draft.image && !project.assets.some(({ id }) => id === draft.image?.id)
        ? [...project.assets, libraryRecordToAsset(draft.image)]
        : project.assets,
    nodes: project.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            title: draft.title.trim(),
            card,
            versions: [...node.versions, version],
            activeVersionId: versionId,
            sourceChanged: false,
          }
        : node,
    ),
  }
}

function assertValidDraft(draft: CreativeCardDraft) {
  if (Object.keys(validateCreativeCardDraft(draft)).length > 0) {
    throw new Error('Invalid creative card draft')
  }
}

function cardFromDraft(draft: CreativeCardDraft): CreativeCard {
  const image = draft.image ? { imageAssetId: draft.image.id } : {}
  if (draft.kind === 'script') {
    return {
      kind: draft.kind,
      scenes: draft.scenes.trim(),
      dialogue: draft.dialogue.trim(),
      shotNotes: draft.shotNotes.trim(),
      ...image,
    }
  }
  if (draft.kind === 'character-card') {
    return {
      kind: draft.kind,
      name: draft.name.trim(),
      appearance: draft.appearance.trim(),
      wardrobe: draft.wardrobe.trim(),
      relationships: draft.relationships.trim(),
      ...image,
    }
  }
  return {
    kind: draft.kind,
    background: draft.background.trim(),
    artStyle: draft.artStyle.trim(),
    rules: draft.rules.trim(),
    ...image,
  }
}

function cardTextFields(
  draft: CreativeCardDraft,
): Array<[Exclude<CreativeCardField, 'title' | 'image'>, string]> {
  if (draft.kind === 'script') {
    return [
      ['scenes', draft.scenes],
      ['dialogue', draft.dialogue],
      ['shotNotes', draft.shotNotes],
    ]
  }
  if (draft.kind === 'character-card') {
    return [
      ['name', draft.name],
      ['appearance', draft.appearance],
      ['wardrobe', draft.wardrobe],
      ['relationships', draft.relationships],
    ]
  }
  return [
    ['background', draft.background],
    ['artStyle', draft.artStyle],
    ['rules', draft.rules],
  ]
}

function projectIds(project: Project) {
  return new Set([
    ...project.assets.map(({ id }) => id),
    ...project.nodes.flatMap((node) => [
      node.id,
      ...node.versions.map(({ id }) => id),
    ]),
  ])
}

function takeUniqueId(
  usedIds: Set<string>,
  environment: CreativeCardEnvironment,
) {
  let id = environment.randomId()
  while (usedIds.has(id)) id = environment.randomId()
  usedIds.add(id)
  return id
}
