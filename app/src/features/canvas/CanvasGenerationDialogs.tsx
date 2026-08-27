import type { ComponentProps } from 'react'
import type { Asset, Project } from '../project/model'
import type { GenerationRequest } from '../generation/generation-adapter'
import type { ModelProvider, ProviderRegistry } from '../generation/model-provider-registry'
import type { ArkImageEditOperation } from '../generation/ark-image-edit-provider'
import { GenerationConfirmationDialog } from '../generation/GenerationConfirmationDialog'
import { ArkAnalysisDialog } from './ArkAnalysisDialog'
import { ImageEditDialog } from './ImageEditDialog'
import { VideoContinueDialog } from './VideoContinueDialog'
import { DependencyImpactDialog } from './DependencyImpactDialog'

export interface ImageEditSession {
  nodeId: string
  projectId: string
  asset: Asset
  operation: ArkImageEditOperation
}

export interface VideoContinueSession {
  nodeId: string
  projectId: string
  asset: Asset
}

export interface AnalysisSession {
  nodeId: string
  projectId: string
  canvasId?: string
  toolId: string
  prompt: string
  source?: Asset
  parameters?: GenerationRequest['parameters']
}

interface CanvasGenerationDialogsProps {
  project?: Project
  providerRegistry: ProviderRegistry
  deletion?: ComponentProps<typeof DependencyImpactDialog>
  remote?: ComponentProps<typeof GenerationConfirmationDialog>
  analysis?: Pick<ComponentProps<typeof ArkAnalysisDialog>, 'onSubmit' | 'onClose' | 'onImportFile'> & { session?: AnalysisSession }
  imageEdit?: Pick<ComponentProps<typeof ImageEditDialog>, 'onSubmit' | 'onClose'> & { session?: ImageEditSession }
  videoContinue?: Pick<ComponentProps<typeof VideoContinueDialog>, 'onSubmit' | 'onClose'> & { session?: VideoContinueSession; provider?: ModelProvider }
}

/** Mount guards and keys mirror CanvasPage; drafts remain owned by each dialog. */
export function CanvasGenerationDialogs({ project, providerRegistry, deletion, remote, analysis, imageEdit, videoContinue }: CanvasGenerationDialogsProps) {
  const analysisSession = analysis?.session
  const imageEditSession = imageEdit?.session
  const videoContinueSession = videoContinue?.session
  const busy = (nodeId: string) => project?.jobs.some(job => job.nodeId === nodeId && (job.status === 'queued' || job.status === 'running'))
  return <>
    {deletion ? <DependencyImpactDialog {...deletion} /> : null}
    {analysis && analysisSession && project && analysisSession.projectId === project.id && analysisSession.canvasId === project.activeCanvasId ? (
      <ArkAnalysisDialog key={`${analysisSession.nodeId}-${analysisSession.toolId}`}
        provider={providerRegistry.require(analysisSession.toolId)} assets={project.assets}
        initialSource={analysisSession.source} initialPrompt={analysisSession.prompt} initialParameters={analysisSession.parameters}
        busy={busy(analysisSession.nodeId)} onSubmit={analysis.onSubmit} onImportFile={analysis.onImportFile} onClose={analysis.onClose} />
    ) : null}
    {imageEdit && imageEditSession && imageEditSession.projectId === project?.id ? (
      <ImageEditDialog asset={imageEditSession.asset} operation={imageEditSession.operation}
        provider={providerRegistry.require('ark-image-edit')} busy={busy(imageEditSession.nodeId)}
        onSubmit={imageEdit.onSubmit} onClose={imageEdit.onClose} />
    ) : null}
    {videoContinue?.provider && videoContinueSession && videoContinueSession.projectId === project?.id ? (
      <VideoContinueDialog key={videoContinueSession.asset.id} asset={videoContinueSession.asset}
        provider={videoContinue.provider} busy={busy(videoContinueSession.nodeId)}
        onSubmit={videoContinue.onSubmit} onClose={videoContinue.onClose} />
    ) : null}
    {remote ? <GenerationConfirmationDialog {...remote} /> : null}
  </>
}
