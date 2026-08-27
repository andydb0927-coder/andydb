import type { ComponentProps } from 'react'
import type { CreativeCardKind, Project } from '../project/model'
import { deriveLibraryRecord } from '../assets/library-model'
import { isCreativeCardKind, nextCreativeCardTitle } from '../project/creative-card'
import { CreativeCardEditor } from './CreativeCardEditor'
import { NodeDraftPanel } from './NodeDraftPanel'
import { nextNodeTitle, type CreatableNodeKind } from './node-draft'

export interface PendingPlacement {
  projectId: string
  kind: CreatableNodeKind | CreativeCardKind
  entry: 'add-node' | 'free-generation' | 'upload'
  position: { x: number; y: number }
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
}

export interface EditingCard {
  projectId: string
  nodeId: string
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
  returnFocusTo?: HTMLElement
}

interface CanvasNodeEditorsProps {
  project?: Project
  pendingPlacement?: PendingPlacement
  editingCard?: EditingCard
  libraryRepository: ComponentProps<typeof CreativeCardEditor>['libraryRepository']
  cancelPlacement(): void
  submitPlacement: ComponentProps<typeof NodeDraftPanel>['onSubmit']
  submitCardPlacement: ComponentProps<typeof CreativeCardEditor>['onSubmit']
  cancelCardEditing(): void
  submitCardEdit: ComponentProps<typeof CreativeCardEditor>['onSubmit']
}

export function CanvasNodeEditors({ project, pendingPlacement, editingCard, libraryRepository,
  cancelPlacement, submitPlacement, submitCardPlacement, cancelCardEditing, submitCardEdit,
}: CanvasNodeEditorsProps) {
  return <>
    {project && pendingPlacement && !isCreativeCardKind(pendingPlacement.kind) ? (
      <NodeDraftPanel key={`${pendingPlacement.projectId}:${pendingPlacement.kind}`}
        kind={pendingPlacement.kind} presentation={pendingPlacement.entry}
        initialTitle={nextNodeTitle(project, pendingPlacement.kind)} anchor={pendingPlacement.anchor} bounds={pendingPlacement.bounds}
        onCancel={cancelPlacement} onSubmit={submitPlacement} />
    ) : null}
    {project && pendingPlacement && isCreativeCardKind(pendingPlacement.kind) ? (
      <CreativeCardEditor key={`${pendingPlacement.projectId}:${pendingPlacement.kind}`} kind={pendingPlacement.kind}
        initialTitle={nextCreativeCardTitle(project, pendingPlacement.kind)} anchor={pendingPlacement.anchor} bounds={pendingPlacement.bounds}
        libraryRepository={libraryRepository} onCancel={cancelPlacement} onSubmit={submitCardPlacement} />
    ) : null}
    {project && editingCard ? (() => {
      const node = project.nodes.find(({ id }) => id === editingCard.nodeId)
      if (!node || !isCreativeCardKind(node.kind) || !node.card) return null
      const asset = node.card.imageAssetId ? project.assets.find(({ id }) => id === node.card?.imageAssetId) : undefined
      return <CreativeCardEditor key={`${editingCard.projectId}:${editingCard.nodeId}`} kind={node.kind}
        initialTitle={node.title} initialCard={node.card} initialImage={asset ? deriveLibraryRecord(project, asset) : undefined}
        anchor={editingCard.anchor} bounds={editingCard.bounds} libraryRepository={libraryRepository}
        onCancel={cancelCardEditing} onSubmit={submitCardEdit} />
    })() : null}
  </>
}
