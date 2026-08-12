import type { Project } from '../project/model'
import type { AgentSkillResult } from './agent-skill'

export interface SkillResultEnvironment {
  now(): string
  randomId(): string
}

const browserEnvironment: SkillResultEnvironment = {
  now: () => new Date().toISOString(),
  randomId: () => crypto.randomUUID(),
}

export function appendSkillResultNode(
  project: Project,
  result: AgentSkillResult,
  environment: SkillResultEnvironment = browserEnvironment,
): Project {
  const timestamp = environment.now()
  const nodeId = environment.randomId()
  const maxX = project.nodes.reduce((value, node) => Math.max(value, node.position.x), -340)
  const minY = project.nodes.length
    ? project.nodes.reduce((value, node) => Math.min(value, node.position.y), Number.POSITIVE_INFINITY)
    : 120
  const versionId = `${nodeId}:version`
  return {
    ...project,
    updatedAt: timestamp,
    nodes: [...project.nodes, {
      id: nodeId,
      kind: 'text',
      title: result.title,
      position: { x: maxX + 340, y: minY },
      versions: [{
        id: versionId,
        createdAt: timestamp,
        prompt: `${result.summary}\n\n${result.content}`,
      }],
      activeVersionId: versionId,
      sourceChanged: false,
    }],
  }
}
