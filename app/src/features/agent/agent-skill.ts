import type { Project } from '../project/model'
import type { TimelineProject } from '../timeline/timeline-project'

export type AgentSkillInputValue = string | number | boolean
export type AgentSkillInput = Record<string, AgentSkillInputValue>
export type AgentSkillCategory = 'preproduction' | 'assets' | 'timeline' | 'writing' | 'maintenance'

export interface AgentSkillInputProperty {
  type: 'string' | 'number' | 'boolean'
  label: string
  description?: string
  default?: AgentSkillInputValue
  enum?: readonly string[]
  minLength?: number
  minimum?: number
  maximum?: number
}

export interface AgentSkillInputSchema {
  type: 'object'
  required?: readonly string[]
  properties: Record<string, AgentSkillInputProperty>
}

export interface AgentSkillContext {
  project: Project
  timeline?: TimelineProject
  signal?: AbortSignal
}

export interface AgentSkillResult {
  title: string
  summary: string
  content: string
  format: 'text' | 'markdown'
}

export interface AgentSkillDefinition {
  id: string
  version: 1
  name: string
  description: string
  category: AgentSkillCategory
  outputMode: 'card-or-node'
  inputSchema: AgentSkillInputSchema
  execute(
    input: AgentSkillInput,
    context: AgentSkillContext,
  ): AgentSkillResult | Promise<AgentSkillResult>
}

export class AgentSkillValidationError extends Error {
  readonly code = 'SKILL_INPUT_INVALID'
}

export class AgentSkillExecutionCancelledError extends Error {
  readonly code = 'SKILL_EXECUTION_CANCELLED'

  constructor() {
    super('技能执行已取消')
    this.name = 'AgentSkillExecutionCancelledError'
  }
}

export class AgentSkillOutputError extends Error {
  readonly code = 'SKILL_OUTPUT_INVALID'

  constructor() {
    super('技能输出结构无效')
    this.name = 'AgentSkillOutputError'
  }
}

export class AgentSkillRegistry {
  readonly #definitions: AgentSkillDefinition[]
  readonly #byId: Map<string, AgentSkillDefinition>

  constructor(definitions: readonly AgentSkillDefinition[]) {
    this.#definitions = [...definitions]
    this.#byId = new Map()
    for (const definition of definitions) {
      if (this.#byId.has(definition.id)) {
        throw new Error(`重复的技能 id：${definition.id}`)
      }
      this.#byId.set(definition.id, definition)
    }
  }

  list(): AgentSkillDefinition[] {
    return [...this.#definitions]
  }

  async execute(
    id: string,
    input: Record<string, unknown>,
    context: AgentSkillContext,
  ): Promise<AgentSkillResult> {
    const definition = this.#byId.get(id)
    if (!definition) {
      throw new AgentSkillValidationError(`未知技能：${id}`)
    }
    if (context.signal?.aborted) throw new AgentSkillExecutionCancelledError()
    const output: unknown = await definition.execute(
      validateInput(input, definition.inputSchema),
      context,
    )
    if (context.signal?.aborted) throw new AgentSkillExecutionCancelledError()
    return validateOutput(output)
  }
}

function validateOutput(output: unknown): AgentSkillResult {
  if (typeof output !== 'object' || output === null) {
    throw new AgentSkillOutputError()
  }
  const candidate = output as Partial<Record<keyof AgentSkillResult, unknown>>
  if (
    typeof candidate.title !== 'string' || candidate.title.trim() === '' ||
    typeof candidate.summary !== 'string' || candidate.summary.trim() === '' ||
    typeof candidate.content !== 'string' || candidate.content.trim() === '' ||
    (candidate.format !== 'text' && candidate.format !== 'markdown')
  ) {
    throw new AgentSkillOutputError()
  }
  return {
    title: candidate.title,
    summary: candidate.summary,
    content: candidate.content,
    format: candidate.format,
  }
}

function validateInput(
  input: Record<string, unknown>,
  schema: AgentSkillInputSchema,
): AgentSkillInput {
  const unknownKey = Object.keys(input).find((key) => !(key in schema.properties))
  if (unknownKey) {
    throw new AgentSkillValidationError(`不支持的字段：${unknownKey}`)
  }

  const result: AgentSkillInput = {}
  for (const [key, property] of Object.entries(schema.properties)) {
    const supplied = input[key]
    const value = supplied === undefined || supplied === '' ? property.default : supplied
    if (value === undefined) {
      if (schema.required?.includes(key)) {
        throw new AgentSkillValidationError(`缺少必填字段：${key}`)
      }
      continue
    }
    if (typeof value !== property.type) {
      throw new AgentSkillValidationError(`${key} 必须是 ${property.type}`)
    }
    if (typeof value === 'string') {
      if (property.minLength !== undefined && value.trim().length < property.minLength) {
        throw new AgentSkillValidationError(`${key} 长度不足`)
      }
      if (property.enum && !property.enum.includes(value)) {
        throw new AgentSkillValidationError(`${key} 不在允许范围内`)
      }
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new AgentSkillValidationError(`${key} 必须是有限数字`)
      }
      if (property.minimum !== undefined && value < property.minimum) {
        throw new AgentSkillValidationError(`${key} 必须大于或等于 ${property.minimum}`)
      }
      if (property.maximum !== undefined && value > property.maximum) {
        throw new AgentSkillValidationError(`${key} 必须小于或等于 ${property.maximum}`)
      }
    }
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      throw new AgentSkillValidationError(`${key} 类型无效`)
    }
    result[key] = value
  }
  return result
}

interface SkillStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface SkillEnablementStore {
  isEnabled(id: string): boolean
  setEnabled(id: string, enabled: boolean): void
}

const ENABLEMENT_KEY = 'wireless-canvas.agent-skills.v1'

export function createSkillEnablementStore(
  storage: SkillStorage,
  definitions: readonly AgentSkillDefinition[],
): SkillEnablementStore {
  const knownIds = new Set(definitions.map(({ id }) => id))
  const disabled = new Set<string>()
  try {
    const raw = storage.getItem(ENABLEMENT_KEY)
    const value = raw ? JSON.parse(raw) as unknown : undefined
    if (
      typeof value === 'object' && value !== null &&
      'version' in value && value.version === 1 &&
      'disabled' in value && Array.isArray(value.disabled)
    ) {
      for (const id of value.disabled) {
        if (typeof id === 'string' && knownIds.has(id)) disabled.add(id)
      }
    }
  } catch {
    // Invalid preferences fall back to all built-in skills enabled.
  }

  const persist = () => {
    storage.setItem(ENABLEMENT_KEY, JSON.stringify({ version: 1, disabled: [...disabled].sort() }))
  }
  return {
    isEnabled: (id) => knownIds.has(id) && !disabled.has(id),
    setEnabled(id, enabled) {
      if (!knownIds.has(id)) return
      if (enabled) disabled.delete(id)
      else disabled.add(id)
      persist()
    },
  }
}
