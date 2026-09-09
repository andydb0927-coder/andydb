import type { DubbingShotRecord } from './dubbing-shot-record'
import type { DubbingLocalizationPlan } from './dubbing-localization-plan'
import type { DubbingQaConfirmation, DubbingQaEvidence } from './dubbing-qa-checklist'
import type { DubbingDeliveryPackage, DubbingExternalEvidence } from './dubbing-delivery'

export interface DubbingMedia {
  id: string
  kind: 'image' | 'video' | 'audio' | 'text'
  url: string
  mimeType: string
}
export interface DubbingReviewSource {
  projectId: string
  nodeId: string
  title: string
  prompt: string
  providerId: string
  requestId: string
  asset: DubbingMedia
  referenceAssets: DubbingMedia[]
}
export interface DubbingIntakeFields {
  sourceAssetId: string
  episodeNumber: number
  shotNumber: number
  startMs: number
  endMs: number
  originalDialogue: string
  localizedDialogue: string
  framing: string
  camera: string
}
export interface DubbingWorkbenchShot {
  deliveryEvidence?: DubbingExternalEvidence
  record: DubbingShotRecord
  sourceKeys: string[]
  sourceNodeId: string
  sourceTitle: string
  assets: DubbingMedia[]
  pending: DubbingReviewSource | null
  qa: { versionId: string | null; checkedIds: string[]; checkedCategories?: string[]; evidence?: DubbingQaEvidence; confirmation?: DubbingQaConfirmation }
  qaHistory: { id: string; versionId: string; checkedIds: string[]; at: string; confirmation?: DubbingQaConfirmation }[]
}
export interface DubbingWorkspace {
  deliveryPackages?: DubbingDeliveryPackage[]
  namespace: 'dubbing.workspace'
  schemaVersion: 1
  projectId: string
  version: number
  shots: DubbingWorkbenchShot[]
  plan: DubbingLocalizationPlan | null
}
export const emptyDubbingWorkspace = (projectId: string): DubbingWorkspace => ({ namespace: 'dubbing.workspace', schemaVersion: 1, projectId, version: 0, shots: [], plan: null })

export function dubbingUiError(error: unknown, fallback = '操作未保存，请重试。'): string {
  return error instanceof Error && /[\u4e00-\u9fff]/u.test(error.message) && error.message.length < 240 ? error.message : fallback
}

export function dubbingTimecode(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}
