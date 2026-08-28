import type { CanvasNode, CanvasNodeDetails, Project } from '../project/model'
import { pipelinePlan } from './pipeline-model'

type TemplateInput = Pick<CanvasNode, 'kind' | 'title' | 'position' | 'modelProviderId' | 'imageGeneration' | 'imageTool' | 'videoTool' | 'effectTool' | 'pipelineConfig' | 'details' | 'generationConfig' | 'appliedStyle'>
export interface PipelineTemplate {
  id: string; name: string; createdAt: string; updatedAt: string
  nodes: { key: string; prompt: string; input: TemplateInput }[]
  edges: { source: string; target: string }[]
}

function inputDetails(details?: CanvasNodeDetails): CanvasNodeDetails | undefined {
  if (!details) return undefined
  switch (details.type) {
    case 'text': return { ...details, content: details.editorMode === 'manual' ? details.content : '', generatedByModel: undefined }
    case 'script': return { type: 'script', chapters: [], outline: details.outline, sceneCount: details.sceneCount, modelProviderId: details.modelProviderId, modelVariant: details.modelVariant }
    case 'audio': return { ...details, generatedByModel: undefined }
    case 'frame-analysis': return { type: 'frame-analysis', sourceName: '', sourceSummary: '', dimensions: { ...details.dimensions } }
    case 'smart-edit': return { ...details, clips: [] }
    case 'director': return structuredClone(details)
  }
}

export function createPipelineTemplate(project: Project, startNodeId: string, name: string): PipelineTemplate {
  if (!name.trim()) throw new Error('请输入模板名称。')
  const ids = pipelinePlan(project, startNodeId)
  const timestamp = new Date().toISOString()
  return { id: crypto.randomUUID(), name: name.trim().slice(0, 60), createdAt: timestamp, updatedAt: timestamp,
    nodes: ids.map(key => {
      const node = project.nodes.find(node => node.id === key)!
      const saved = node.generationConfig
      return { key, prompt: node.versions.find(version => version.id === node.activeVersionId)?.prompt ?? '',
        input: structuredClone({ kind: node.kind, title: node.title, position: node.position, modelProviderId: node.modelProviderId,
          imageGeneration: node.imageGeneration, imageTool: node.imageTool, videoTool: node.videoTool, effectTool: node.effectTool,
          pipelineConfig: node.pipelineConfig, details: inputDetails(node.details), appliedStyle: node.appliedStyle,
          generationConfig: saved ? { targetKind: saved.targetKind, providerId: saved.providerId, style: saved.style,
            parameters: Object.fromEntries(Object.entries(saved.parameters ?? {}).filter(([key, value]) => !/url|asset|reference|subject/i.test(key) && !(typeof value === 'string' && /^(https?:|data:|blob:)/.test(value)))), referenceAssets: [] } : undefined,
        }),
      }
    }),
    edges: project.edges.filter(edge => ids.includes(edge.sourceNodeId) && ids.includes(edge.targetNodeId)).map(edge => ({ source: edge.sourceNodeId, target: edge.targetNodeId })),
  }
}

export function instantiatePipelineTemplate(template: PipelineTemplate, position = { x: 100, y: 100 }): Pick<Project, 'nodes' | 'edges' | 'assets'> {
  if (!template.nodes.length) throw new Error('模板没有节点。')
  const keys = new Set(template.nodes.map(node => node.key))
  if (keys.size !== template.nodes.length || template.edges.some(edge => !keys.has(edge.source) || !keys.has(edge.target))) throw new Error('模板拓扑无效。')
  const ids = new Map(template.nodes.map(node => [node.key, crypto.randomUUID()]))
  const origin = template.nodes[0].input.position
  return { assets: [], nodes: template.nodes.map(({ key, input, prompt }) => {
    const versionId = crypto.randomUUID()
    return { ...structuredClone(input), id: ids.get(key)!, position: { x: position.x + input.position.x - origin.x, y: position.y + input.position.y - origin.y },
      sourceChanged: false, activeVersionId: versionId, versions: [{ id: versionId, createdAt: new Date().toISOString(), prompt }] }
  }), edges: template.edges.map(edge => ({ id: crypto.randomUUID(), sourceNodeId: ids.get(edge.source)!, targetNodeId: ids.get(edge.target)! })) }
}
