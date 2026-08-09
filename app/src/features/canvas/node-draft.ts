import type {
  CanvasCreation,
  CanvasNode,
  NodeKind,
  Project,
} from '../project/model'

export type CreatableNodeKind = Extract<
  NodeKind,
  'text' | 'image' | 'storyboard' | 'video'
>

export interface PreparedImage {
  dataUrl: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
}

export interface NodeDraftFields {
  kind: CreatableNodeKind
  title: string
  content: string
  image?: PreparedImage
}

export interface NodeDraftInput extends NodeDraftFields {
  position: CanvasNode['position']
}

export interface CreationEnvironment {
  now(): string
  randomId(): string
}

export interface DraftValidationErrors {
  title?: string
  content?: string
  image?: string
}

const titlePrefixes: Record<CreatableNodeKind, string> = {
  text: '文本',
  image: '图片',
  storyboard: '分镜',
  video: '视频',
}

const contentNames: Record<CreatableNodeKind, string> = {
  text: '文字内容',
  image: '图片描述',
  storyboard: '画面提示词',
  video: '视频提示词',
}

const defaultCreationEnvironment: CreationEnvironment = {
  now: () => new Date().toISOString(),
  randomId: () => crypto.randomUUID(),
}

export function nextNodeTitle(
  project: Project,
  kind: CreatableNodeKind,
): string {
  const prefix = titlePrefixes[kind]
  const titlePattern = new RegExp(`^${prefix} (\\d+)$`)
  const highestSuffix = project.nodes.reduce((highest, node) => {
    if (node.kind !== kind) return highest

    const match = titlePattern.exec(node.title)
    if (!match) return highest

    return Math.max(highest, Number(match[1]))
  }, 0)

  return `${prefix} ${String(highestSuffix + 1).padStart(2, '0')}`
}

export function validateNodeDraft(
  fields: NodeDraftFields,
): DraftValidationErrors {
  const errors: DraftValidationErrors = {}
  const title = fields.title.trim()
  const content = fields.content.trim()
  const contentName = contentNames[fields.kind]

  if (!title) {
    errors.title = '请输入标题'
  } else if (title.length > 40) {
    errors.title = '标题不能超过 40 个字符'
  }

  if (fields.kind !== 'image' && !content) {
    errors.content = `请输入${contentName}`
  } else if (content.length > 1000) {
    errors.content = `${contentName}不能超过 1000 个字符`
  }

  if (fields.kind === 'image' && !fields.image) {
    errors.image = '请选择图片'
  }

  return errors
}

function projectIds(project: Project): Set<string> {
  return new Set([
    ...project.assets.map(({ id }) => id),
    ...project.nodes.flatMap((node) => [
      node.id,
      ...node.versions.map(({ id }) => id),
    ]),
  ])
}

export function buildCanvasCreation(
  project: Project,
  input: NodeDraftInput,
  environment: CreationEnvironment = defaultCreationEnvironment,
): CanvasCreation {
  if (Object.keys(validateNodeDraft(input)).length > 0) {
    throw new Error('Invalid canvas node draft')
  }

  const usedIds = projectIds(project)
  const takeId = () => {
    let id = environment.randomId()
    while (usedIds.has(id)) id = environment.randomId()
    usedIds.add(id)
    return id
  }
  const nodeId = takeId()
  const versionId = takeId()
  const createdAt = environment.now()
  const title = input.title.trim()
  const content = input.content.trim()

  if (input.kind === 'image' && input.image) {
    const assetId = takeId()

    return {
      node: {
        id: nodeId,
        kind: input.kind,
        title,
        position: input.position,
        versions: [
          {
            id: versionId,
            createdAt,
            prompt: content || title,
            assetId,
          },
        ],
        activeVersionId: versionId,
        sourceChanged: false,
      },
      asset: {
        id: assetId,
        kind: 'image',
        url: input.image.dataUrl,
        mimeType: input.image.mimeType,
      },
    }
  }

  return {
    node: {
      id: nodeId,
      kind: input.kind,
      title,
      position: input.position,
      versions: [
        {
          id: versionId,
          createdAt,
          prompt: content,
        },
      ],
      activeVersionId: versionId,
      sourceChanged: false,
    },
  }
}
