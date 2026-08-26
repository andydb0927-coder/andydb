export type ModelParameterName =
  | 'aspectRatio'
  | 'duration'
  | 'generationMode'
  | 'quality'
  | 'sound'
  | 'resolution'
  | 'count'
  | 'onlineSearch'
  | 'materialValidation'
  | 'editStrength'
  | 'customWidth'
  | 'customHeight'
  | 'multiShot'
  | 'autoLink'

export type ModelParameterDefinition =
  | {
      type: 'enum'
      defaultValue: string
      options: readonly string[]
    }
  | {
      type: 'boolean'
      defaultValue: boolean
    }
  | {
      type: 'number'
      defaultValue: number
      min: number
      max: number
      step: number
    }

export type ModelParameterSchema = Partial<
  Record<ModelParameterName, ModelParameterDefinition>
>

export const standardImageAspectRatios = [
  '1:1',
  '1:2',
  '2:1',
  '9:16',
  '16:9',
  '3:4',
  '4:3',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
  '9:21',
] as const

export const standardImageResolutionTiers = ['1K', '1.5K', '2K'] as const
export const standardImageCounts = ['1', '2', '4'] as const

export const modelParameterSemantics = {
  aspectRatio: {
    type: 'enum',
    defaultValue: '16:9',
    options: standardImageAspectRatios,
  },
  resolution: {
    type: 'enum',
    defaultValue: '2K',
    options: standardImageResolutionTiers,
  },
  count: {
    type: 'enum',
    defaultValue: '1',
    options: standardImageCounts,
  },
} as const satisfies ModelParameterSchema

export interface SemanticParameterOverride {
  semantic: true
  defaultValue?: string
  options?: readonly string[]
}

export type ModelParameterDeclaration =
  | true
  | ModelParameterDefinition
  | SemanticParameterOverride

export type ModelParameterManifest = Partial<
  Record<ModelParameterName, ModelParameterDeclaration>
>

function semanticDefinition(name: ModelParameterName) {
  return modelParameterSemantics[name as keyof typeof modelParameterSemantics]
}

export function resolveModelParameterManifest(
  manifest: ModelParameterManifest,
): ModelParameterSchema {
  return Object.fromEntries(
    Object.entries(manifest).map(([rawName, declaration]) => {
      const name = rawName as ModelParameterName
      if (declaration === true) {
        const definition = semanticDefinition(name)
        if (!definition) throw new Error(`No parameter semantic registered for: ${name}`)
        return [name, definition]
      }
      if ('semantic' in declaration) {
        const definition = semanticDefinition(name)
        if (!definition || definition.type !== 'enum') {
          throw new Error(`No enum parameter semantic registered for: ${name}`)
        }
        return [name, {
          ...definition,
          ...(declaration.defaultValue === undefined
            ? {}
            : { defaultValue: declaration.defaultValue }),
          ...(declaration.options === undefined
            ? {}
            : { options: declaration.options }),
        }]
      }
      return [name, declaration]
    }),
  ) as ModelParameterSchema
}
