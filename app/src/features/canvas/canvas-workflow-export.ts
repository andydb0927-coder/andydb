import type {
  Asset,
  CanvasNode,
  DependencyEdge,
  Project,
} from '../project/model'
import { safeDownloadFilename } from '../timeline/timeline-export'

export type CanvasExportScope = 'viewport' | 'all'
export type CanvasExportFormat = 'png' | 'svg'

export interface CanvasViewportSnapshot {
  x: number
  y: number
  zoom: number
  width: number
  height: number
}

export interface CanvasExportEstimate {
  scope: CanvasExportScope
  width: number
  height: number
  transform: { x: number; y: number; zoom: number }
}

export interface WorkflowSnapshot {
  format: 'wireless-canvas-workflow'
  version: 1
  exportedAt: string
  project: Project
}

export interface WorkflowImportResult {
  valid: boolean
  errors: string[]
  titleConflicts: string[]
  missingReferences: string[]
  snapshot?: WorkflowSnapshot
}

export interface WorkflowMergePayload {
  assets: Asset[]
  nodes: CanvasNode[]
  edges: DependencyEdge[]
}

const DEFAULT_NODE_SIZE = { width: 320, height: 220 }
const ALL_CANVAS_PADDING = 64

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function positiveInteger(value: number) {
  return Math.max(1, Math.ceil(value))
}

export function estimateCanvasExport(
  project: Project,
  scope: CanvasExportScope,
  viewport: CanvasViewportSnapshot,
  measurements: Record<string, { width: number; height: number }> = {},
): CanvasExportEstimate {
  if (scope === 'viewport') {
    return {
      scope,
      width: positiveInteger(viewport.width),
      height: positiveInteger(viewport.height),
      transform: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
    }
  }

  if (project.nodes.length === 0) {
    return {
      scope,
      width: positiveInteger(viewport.width),
      height: positiveInteger(viewport.height),
      transform: { x: ALL_CANVAS_PADDING, y: ALL_CANVAS_PADDING, zoom: 1 },
    }
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const node of project.nodes) {
    const size = measurements[node.id] ?? DEFAULT_NODE_SIZE
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + size.width)
    maxY = Math.max(maxY, node.position.y + size.height)
  }

  return {
    scope,
    width: positiveInteger(maxX - minX + ALL_CANVAS_PADDING * 2),
    height: positiveInteger(maxY - minY + ALL_CANVAS_PADDING * 2),
    transform: {
      x: ALL_CANVAS_PADDING - minX,
      y: ALL_CANVAS_PADDING - minY,
      zoom: 1,
    },
  }
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

const nodeKindCopy: Record<CanvasNode['kind'], string> = {
  character: '角色',
  'character-card': '角色卡',
  scene: '场景',
  script: '脚本',
  text: '文本',
  image: '图片',
  storyboard: '分镜',
  video: '视频',
  preview: '预览',
  worldview: '世界观',
}

export function renderCanvasSvg(
  project: Project,
  estimate: CanvasExportEstimate,
  measurements: Record<string, { width: number; height: number }> = {},
) {
  const nodesById = new Map(project.nodes.map((node) => [node.id, node]))
  const edges = project.edges.flatMap((edge) => {
    const source = nodesById.get(edge.sourceNodeId)
    const target = nodesById.get(edge.targetNodeId)
    if (!source || !target) return []
    const sourceSize = measurements[source.id] ?? DEFAULT_NODE_SIZE
    const targetSize = measurements[target.id] ?? DEFAULT_NODE_SIZE
    const sourceX = source.position.x + sourceSize.width
    const sourceY = source.position.y + sourceSize.height / 2
    const targetX = target.position.x
    const targetY = target.position.y + targetSize.height / 2
    const bend = Math.max(72, Math.abs(targetX - sourceX) / 2)
    return [
      `<path data-edge-id="${escapeXml(edge.id)}" d="M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}" fill="none" stroke="#8b7bff" stroke-width="3"/>`,
    ]
  })
  const nodes = project.nodes.map((node) => {
    const size = measurements[node.id] ?? DEFAULT_NODE_SIZE
    const title = escapeXml(node.title)
    const kind = escapeXml(nodeKindCopy[node.kind])
    return `<g data-node-id="${escapeXml(node.id)}" transform="translate(${node.position.x} ${node.position.y})">
      <rect width="${size.width}" height="${size.height}" rx="18" fill="#1b1b22" stroke="#454253" stroke-width="2"/>
      <rect x="16" y="16" width="${Math.max(1, size.width - 32)}" height="${Math.max(1, size.height - 76)}" rx="12" fill="#262633"/>
      <text x="18" y="${Math.max(36, size.height - 34)}" fill="#ffffff" font-size="18" font-family="system-ui, sans-serif">${title}</text>
      <text x="${Math.max(18, size.width - 72)}" y="${Math.max(36, size.height - 34)}" fill="#aaa6b8" font-size="13" font-family="system-ui, sans-serif">${kind}</text>
    </g>`
  })
  const { x, y, zoom } = estimate.transform
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${estimate.width}" height="${estimate.height}" viewBox="0 0 ${estimate.width} ${estimate.height}" role="img" aria-label="${escapeXml(project.title)}">
    <rect width="100%" height="100%" fill="#101014"/>
    <defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#34333e"/></pattern></defs>
    <rect width="100%" height="100%" fill="url(#grid)"/>
    <g transform="translate(${x} ${y}) scale(${zoom})">${edges.join('')}${nodes.join('')}</g>
  </svg>`
}

export function createWorkflowSnapshot(
  project: Project,
  now = new Date(),
): WorkflowSnapshot {
  return {
    format: 'wireless-canvas-workflow',
    version: 1,
    exportedAt: now.toISOString(),
    project,
  }
}

function timestampForFilename(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '00'
  return `${part('year')}${part('month')}${part('day')}-${part('hour')}${part('minute')}${part('second')}`
}

export function buildWorkflowFilename(projectTitle: string, now = new Date()) {
  return safeDownloadFilename(
    `${projectTitle}-工作流-${timestampForFilename(now)}.json`,
  )
}

export function buildCanvasExportFilename(
  projectTitle: string,
  scope: CanvasExportScope,
  format: CanvasExportFormat,
  now = new Date(),
) {
  return safeDownloadFilename(
    `${projectTitle}-画布-${scope === 'viewport' ? '当前视口' : '全画布'}-${timestampForFilename(now)}.${format}`,
  )
}

export async function rasterizeCanvasSvg(
  svg: string,
  width: number,
  height: number,
): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const objectUrl = URL.createObjectURL(svgBlob)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('画布矢量快照无法转换为 PNG'))
      image.src = objectUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器无法创建 PNG 画布')
    context.drawImage(image, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('PNG 编码失败'))
      }, 'image/png')
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function isProjectShape(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false
  const project = value as Partial<Project>
  return (
    typeof project.id === 'string' &&
    typeof project.title === 'string' &&
    typeof project.intent === 'string' &&
    Array.isArray(project.assets) &&
    Array.isArray(project.nodes) &&
    Array.isArray(project.edges) &&
    Array.isArray(project.timeline) &&
    Array.isArray(project.jobs) &&
    Array.isArray(project.exportJobs)
  )
}

export function parseWorkflowImport(
  json: string,
  currentProject: Project,
): WorkflowImportResult {
  const errors: string[] = []
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return {
      valid: false,
      errors: ['JSON 文件无法解析'],
      titleConflicts: [],
      missingReferences: [],
    }
  }
  const candidate = value as Partial<WorkflowSnapshot>
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    candidate.format !== 'wireless-canvas-workflow' ||
    candidate.version !== 1 ||
    !isProjectShape(candidate.project)
  ) {
    return {
      valid: false,
      errors: ['不是受支持的无线画布工作流 JSON'],
      titleConflicts: [],
      missingReferences: [],
    }
  }

  const snapshot = candidate as WorkflowSnapshot
  const imported = snapshot.project
  const rawAssets = imported.assets as unknown[]
  const rawNodes = imported.nodes as unknown[]
  const rawEdges = imported.edges as unknown[]
  const assetIds = new Set<string>()
  for (const asset of rawAssets) {
    if (
      !record(asset) ||
      typeof asset.id !== 'string' ||
      !['image', 'video', 'audio'].includes(String(asset.kind)) ||
      typeof asset.url !== 'string' ||
      typeof asset.mimeType !== 'string'
    ) {
      errors.push('素材结构无效')
      continue
    }
    if (assetIds.has(asset.id)) errors.push(`素材 ID ${asset.id} 重复`)
    assetIds.add(asset.id)
  }

  const nodeIds = new Set<string>()
  const validNodes: CanvasNode[] = []
  const supportedNodeKinds = new Set(Object.keys(nodeKindCopy))
  for (const candidateNode of rawNodes) {
    if (
      !record(candidateNode) ||
      typeof candidateNode.id !== 'string' ||
      typeof candidateNode.title !== 'string' ||
      typeof candidateNode.kind !== 'string' ||
      !supportedNodeKinds.has(candidateNode.kind) ||
      !record(candidateNode.position) ||
      !finite(candidateNode.position.x) ||
      !finite(candidateNode.position.y) ||
      !Array.isArray(candidateNode.versions) ||
      typeof candidateNode.activeVersionId !== 'string'
    ) {
      errors.push('节点结构或位置无效')
      continue
    }
    const versionsValid = candidateNode.versions.every(
      (version) =>
        record(version) &&
        typeof version.id === 'string' &&
        typeof version.createdAt === 'string' &&
        typeof version.prompt === 'string' &&
        (version.assetId === undefined || typeof version.assetId === 'string'),
    )
    const imageResultsValid =
      candidateNode.imageResults === undefined ||
      (Array.isArray(candidateNode.imageResults) &&
        candidateNode.imageResults.every(
          (result) =>
            record(result) &&
            typeof result.id === 'string' &&
            typeof result.assetId === 'string',
        ))
    if (!versionsValid || !imageResultsValid) {
      errors.push(`节点 ${candidateNode.title} 的版本或结果结构无效`)
      continue
    }
    const node = candidateNode as unknown as CanvasNode
    if (nodeIds.has(node.id)) errors.push(`节点 ID ${node.id} 重复`)
    nodeIds.add(node.id)
    validNodes.push(node)
  }
  const missingReferences: string[] = []
  const edgeIds = new Set<string>()
  for (const candidateEdge of rawEdges) {
    if (
      !record(candidateEdge) ||
      typeof candidateEdge.id !== 'string' ||
      typeof candidateEdge.sourceNodeId !== 'string' ||
      typeof candidateEdge.targetNodeId !== 'string'
    ) {
      errors.push('连线结构无效')
      continue
    }
    const edge = candidateEdge as unknown as DependencyEdge
    if (edgeIds.has(edge.id)) errors.push(`连线 ID ${edge.id} 重复`)
    edgeIds.add(edge.id)
    if (!nodeIds.has(edge.sourceNodeId)) {
      missingReferences.push(
        `连线 ${edge.id} 的来源节点 ${edge.sourceNodeId} 不存在`,
      )
    }
    if (!nodeIds.has(edge.targetNodeId)) {
      missingReferences.push(
        `连线 ${edge.id} 的目标节点 ${edge.targetNodeId} 不存在`,
      )
    }
  }
  for (const node of validNodes) {
    if (!node.versions.some((version) => version.id === node.activeVersionId)) {
      missingReferences.push(
        `节点 ${node.title} 的当前版本 ${node.activeVersionId} 不存在`,
      )
    }
    const referencedAssetIds = [
      ...node.versions.flatMap((version) =>
        version.assetId ? [version.assetId] : [],
      ),
      ...(node.imageResults?.map((result) => result.assetId) ?? []),
      ...(node.card?.imageAssetId ? [node.card.imageAssetId] : []),
    ]
    for (const assetId of referencedAssetIds) {
      if (!assetIds.has(assetId)) {
        missingReferences.push(
          `节点 ${node.title} 引用的素材 ${assetId} 不存在`,
        )
      }
    }
  }
  const currentTitles = new Set(currentProject.nodes.map((node) => node.title))
  const titleConflicts = [
    ...new Set(
      validNodes
        .filter((node) => currentTitles.has(node.title))
        .map((node) => node.title),
    ),
  ]
  return {
    valid: errors.length === 0 && missingReferences.length === 0,
    errors,
    titleConflicts,
    missingReferences,
    snapshot,
  }
}

export function prepareWorkflowMerge(
  snapshot: WorkflowSnapshot,
  idFactory: () => string = () => crypto.randomUUID(),
): WorkflowMergePayload {
  const assetIds = new Map(
    snapshot.project.assets.map((asset) => [asset.id, idFactory()]),
  )
  const nodeIds = new Map(
    snapshot.project.nodes.map((node) => [node.id, idFactory()]),
  )
  const assets = snapshot.project.assets.map((asset) => ({
    ...asset,
    id: assetIds.get(asset.id)!,
  }))
  const nodes = snapshot.project.nodes.map((node) => {
    const versionIds = new Map(
      node.versions.map((version) => [version.id, idFactory()]),
    )
    const resultIds = new Map(
      node.imageResults?.map((result) => [result.id, idFactory()]) ?? [],
    )
    return {
      ...node,
      id: nodeIds.get(node.id)!,
      versions: node.versions.map((version) => ({
        ...version,
        id: versionIds.get(version.id)!,
        ...(version.assetId
          ? { assetId: assetIds.get(version.assetId) ?? version.assetId }
          : {}),
      })),
      activeVersionId:
        versionIds.get(node.activeVersionId) ?? node.activeVersionId,
      ...(node.imageResults
        ? {
            imageResults: node.imageResults.map((result) => ({
              ...result,
              id: resultIds.get(result.id)!,
              assetId: assetIds.get(result.assetId) ?? result.assetId,
            })),
          }
        : {}),
      ...(node.activeResultId
        ? {
            activeResultId:
              resultIds.get(node.activeResultId) ?? node.activeResultId,
          }
        : {}),
      ...(node.card
        ? {
            card: {
              ...node.card,
              ...(node.card.imageAssetId
                ? {
                    imageAssetId:
                      assetIds.get(node.card.imageAssetId) ??
                      node.card.imageAssetId,
                  }
                : {}),
            },
          }
        : {}),
    }
  })
  const edges = snapshot.project.edges.map((edge) => ({
    ...edge,
    id: idFactory(),
    sourceNodeId: nodeIds.get(edge.sourceNodeId)!,
    targetNodeId: nodeIds.get(edge.targetNodeId)!,
  }))
  return { assets, nodes, edges }
}
