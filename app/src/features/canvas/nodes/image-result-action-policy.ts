export type ImagePrimaryAction = 'reference' | 'mark' | 'style'

export interface ImageResultActionPolicy {
  id: string
  providerIds: readonly string[]
  hasResult: true
  actions: readonly ImagePrimaryAction[]
}

export const imageResultActionPolicies: readonly ImageResultActionPolicy[] = [
  {
    id: 'lib-image-result',
    providerIds: ['mock-mj-image'],
    hasResult: true,
    actions: ['reference', 'mark', 'style'],
  },
  {
    id: 'style-image-v7-result',
    providerIds: ['mock-style-image-v7'],
    hasResult: true,
    actions: ['reference', 'style'],
  },
]

const safeDefaultActions: readonly ImagePrimaryAction[] = [
  'reference',
  'mark',
  'style',
]

export function imagePrimaryActionsFor(
  providerId: string | undefined,
  hasResult: boolean,
): readonly ImagePrimaryAction[] {
  if (!hasResult) return safeDefaultActions
  return (
    imageResultActionPolicies.find(({ providerIds }) =>
      providerId ? providerIds.includes(providerId) : false,
    )?.actions ?? safeDefaultActions
  )
}
