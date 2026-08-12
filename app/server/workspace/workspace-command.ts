import type { Project } from '../../src/features/project/model.js'

export type WorkspaceCommandErrorCode =
  | 'UNKNOWN_COMMAND'
  | 'SCHEMA_VALIDATION_FAILED'

export class WorkspaceCommandError extends Error {
  readonly code: WorkspaceCommandErrorCode
  readonly details?: Record<string, unknown>

  constructor(
    code: WorkspaceCommandErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.code = code
    this.details = details
  }
}

export const WORKSPACE_COMMAND_MANIFEST = {
  schemaVersion: 1,
  namespace: 'wireless-canvas.workspace',
  execution: 'local-deterministic',
  commands: [
    {
      id: 'workspace.project.export',
      method: 'POST',
      path: '/api/workspace/execute',
      description: '导出无线画布项目 JSON',
      inputSchemaId: 'wireless-canvas.workspace.project-export-input@1',
      outputSchemaId: 'wireless-canvas.workspace.file-output@1',
      fileFormat: 'wireless-canvas-project@1',
    },
    {
      id: 'workspace.project.import.validate',
      method: 'POST',
      path: '/api/workspace/execute',
      description: '校验项目 JSON；不写入浏览器或文件系统',
      inputSchemaId: 'wireless-canvas.workspace.project-import-input@1',
      outputSchemaId: 'wireless-canvas.workspace.project-validation-output@1',
      fileFormat: 'wireless-canvas-project@1',
    },
    {
      id: 'workspace.assets.manifest',
      method: 'POST',
      path: '/api/workspace/execute',
      description: '导出项目素材清单 JSON',
      inputSchemaId: 'wireless-canvas.workspace.asset-manifest-input@1',
      outputSchemaId: 'wireless-canvas.workspace.file-output@1',
      fileFormat: 'wireless-canvas-assets@1',
    },
    {
      id: 'workspace.timeline.edl',
      method: 'POST',
      path: '/api/workspace/execute',
      description: '导出专业时间线 EDL',
      inputSchemaId: 'wireless-canvas.workspace.timeline-edl-input@1',
      outputSchemaId: 'wireless-canvas.workspace.file-output@1',
      fileFormat: 'cmx-3600-edl',
    },
  ],
} as const

export function executeWorkspaceCommand(
  command: string,
  input: unknown,
): Record<string, unknown> {
  switch (command) {
    case 'workspace.project.export': {
      const project = readProjectInput(input)
      return fileOutput(
        `${safeDownloadFilename(project.title)}-项目.json`,
        'application/json',
        JSON.stringify({ format: 'wireless-canvas-project', schemaVersion: 1, project }, null, 2),
      )
    }
    case 'workspace.project.import.validate': {
      const record = requireRecord(input, '命令输入必须是对象')
      requireExactKeys(record, ['content'])
      if (typeof record.content !== 'string') invalid('content 必须是 JSON 字符串')
      let document: unknown
      try {
        document = JSON.parse(record.content)
      } catch {
        invalid('项目 JSON 无法解析')
      }
      const envelope = requireRecord(document, '项目 JSON 必须是对象')
      if (envelope.format !== 'wireless-canvas-project' || envelope.schemaVersion !== 1) {
        invalid('不支持的项目 JSON 格式或版本')
      }
      const project = validateProject(envelope.project)
      return {
        valid: true,
        projectId: project.id,
        title: project.title,
        nodeCount: project.nodes.length,
        assetCount: project.assets.length,
      }
    }
    case 'workspace.assets.manifest': {
      const project = readProjectInput(input)
      const assets = project.assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        mimeType: asset.mimeType,
        url: asset.url,
        ...(asset.width === undefined ? {} : { width: asset.width }),
        ...(asset.height === undefined ? {} : { height: asset.height }),
        ...(asset.durationSeconds === undefined ? {} : { durationSeconds: asset.durationSeconds }),
        referencedByNodeIds: project.nodes
          .filter(({ versions }) => versions.some(({ assetId }) => assetId === asset.id))
          .map(({ id }) => id),
      }))
      return fileOutput(
        `${safeDownloadFilename(project.title)}-素材清单.json`,
        'application/json',
        JSON.stringify({
          format: 'wireless-canvas-assets',
          schemaVersion: 1,
          projectId: project.id,
          assets,
        }, null, 2),
      )
    }
    case 'workspace.timeline.edl': {
      const record = requireRecord(input, '命令输入必须是对象')
      requireExactKeys(record, ['timeline'])
      const timeline = validateTimeline(record.timeline)
      return fileOutput(
        `${safeDownloadFilename(timeline.title)}.edl`,
        'text/plain',
        serializeTimelineEdl(timeline),
      )
    }
    default:
      throw new WorkspaceCommandError('UNKNOWN_COMMAND', `Unknown workspace command: ${command}`)
  }
}

function fileOutput(filename: string, mimeType: string, content: string) {
  return { filename, mimeType, encoding: 'utf-8', content }
}

function readProjectInput(input: unknown): Project {
  const record = requireRecord(input, '命令输入必须是对象')
  requireExactKeys(record, ['project'])
  return validateProject(record.project)
}

function validateProject(value: unknown): Project {
  const project = requireRecord(value, 'project 必须是对象')
  if (
    !nonEmptyString(project.id) ||
    !nonEmptyString(project.title) ||
    typeof project.intent !== 'string' ||
    !nonEmptyString(project.createdAt) ||
    !nonEmptyString(project.updatedAt) ||
    !Array.isArray(project.assets) ||
    !Array.isArray(project.nodes) ||
    !Array.isArray(project.edges) ||
    !Array.isArray(project.timeline) ||
    !Array.isArray(project.jobs) ||
    !Array.isArray(project.exportJobs)
  ) {
    invalid('project 结构无效')
  }
  for (const asset of project.assets) validateAsset(asset)
  for (const node of project.nodes) validateNode(node)
  return project as unknown as Project
}

function validateAsset(value: unknown) {
  const asset = requireRecord(value, '素材必须是对象')
  if (
    !nonEmptyString(asset.id) ||
    !['image', 'video', 'audio'].includes(String(asset.kind)) ||
    !nonEmptyString(asset.url) ||
    !nonEmptyString(asset.mimeType)
  ) invalid('素材结构无效')
}

function validateNode(value: unknown) {
  const node = requireRecord(value, '节点必须是对象')
  const position = typeof node.position === 'object' && node.position !== null
    ? node.position as Record<string, unknown>
    : undefined
  if (
    !nonEmptyString(node.id) ||
    !nonEmptyString(node.kind) ||
    !nonEmptyString(node.title) ||
    !position || typeof position.x !== 'number' || typeof position.y !== 'number' ||
    !Array.isArray(node.versions) ||
    !nonEmptyString(node.activeVersionId) ||
    typeof node.sourceChanged !== 'boolean'
  ) invalid('节点结构无效')
}

interface WorkspaceTimelineClip {
  id: string
  kind: string
  name: string
  order: number
  startSeconds: number
  sourceInSeconds: number
  sourceOutSeconds: number
  source: { type: string; assetId?: string; nodeId?: string }
}

interface WorkspaceTimelineTrack {
  id: string
  kind: string
  clips: WorkspaceTimelineClip[]
}

interface WorkspaceTimeline {
  id: string
  projectId: string
  title: string
  schemaVersion: 1
  frameRate: number
  tracks: WorkspaceTimelineTrack[]
}

function validateTimeline(value: unknown): WorkspaceTimeline {
  const timeline = requireRecord(value, 'timeline 必须是对象')
  if (
    !nonEmptyString(timeline.id) ||
    !nonEmptyString(timeline.projectId) ||
    !nonEmptyString(timeline.title) ||
    timeline.schemaVersion !== 1 ||
    timeline.frameRate !== 24 ||
    !Array.isArray(timeline.tracks)
  ) invalid('timeline 结构无效')
  for (const trackValue of timeline.tracks) {
    const track = requireRecord(trackValue, '时间线轨道必须是对象')
    if (!nonEmptyString(track.id) || !nonEmptyString(track.kind) || !Array.isArray(track.clips)) {
      invalid('时间线轨道结构无效')
    }
    for (const clipValue of track.clips) {
      const clip = requireRecord(clipValue, '时间线片段必须是对象')
      const source = requireRecord(clip.source, '时间线片段来源必须是对象')
      if (
        !nonEmptyString(clip.id) || !nonEmptyString(clip.kind) ||
        !nonEmptyString(clip.name) || typeof clip.order !== 'number' ||
        typeof clip.startSeconds !== 'number' ||
        typeof clip.sourceInSeconds !== 'number' || typeof clip.sourceOutSeconds !== 'number' ||
        !nonEmptyString(source.type)
      ) invalid('时间线片段结构无效')
    }
  }
  return timeline as unknown as WorkspaceTimeline
}

function safeDownloadFilename(filename: string) {
  const sanitized = filename
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/-+\./g, '.')
    .replace(/-{2,}/g, '-')
  return sanitized || 'workspace-export'
}

function serializeTimelineEdl(timeline: WorkspaceTimeline) {
  const clips = timeline.tracks
    .filter(({ kind }) => kind === 'video' || kind === 'image')
    .flatMap(({ clips: trackClips }) => trackClips)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.order - right.order)
  const lines = [`TITLE: ${timeline.title}`, 'FCM: NON-DROP FRAME', '']
  clips.forEach((clip, index) => {
    const sourceIn = toTimecode(clip.sourceInSeconds, timeline.frameRate)
    const sourceOut = toTimecode(clip.sourceOutSeconds, timeline.frameRate)
    const recordIn = toTimecode(clip.startSeconds, timeline.frameRate)
    const recordOut = toTimecode(
      clip.startSeconds + Math.max(0, clip.sourceOutSeconds - clip.sourceInSeconds),
      timeline.frameRate,
    )
    const sourceId = clip.source.assetId ?? clip.source.nodeId ?? clip.id
    const reel = sourceId.replace(/[^a-z0-9]/gi, '_').toUpperCase().slice(0, 8).padEnd(8, '_')
    lines.push(
      `${String(index + 1).padStart(3, '0')}  ${reel}  V     C        ${sourceIn} ${sourceOut} ${recordIn} ${recordOut}`,
      `* FROM CLIP NAME: ${clip.name}`,
      `* SOURCE: ${clip.source.type} ${sourceId}`,
      `* TRACK: ${clip.kind}`,
      '',
    )
  })
  return lines.join('\n')
}

function toTimecode(seconds: number, frameRate: number) {
  const totalFrames = Math.max(0, Math.round(seconds * frameRate))
  const frames = totalFrames % frameRate
  const totalSeconds = Math.floor(totalFrames / frameRate)
  const values = [
    Math.floor(totalSeconds / 3600),
    Math.floor(totalSeconds / 60) % 60,
    totalSeconds % 60,
    frames,
  ]
  return values.map((value) => String(value).padStart(2, '0')).join(':')
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(message)
  return value as Record<string, unknown>
}

function requireExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid(`命令输入字段必须为：${expected.join(', ')}`)
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function invalid(message: string): never {
  throw new WorkspaceCommandError('SCHEMA_VALIDATION_FAILED', message)
}
