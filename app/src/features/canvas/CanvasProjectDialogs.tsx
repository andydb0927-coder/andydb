import type { ComponentProps } from 'react'
import { PublishWorkDialog } from '../community/PublishWorkDialog'
import { CreateSubjectDialog } from '../subjects/CreateSubjectDialog'
import { CanvasExportDialog, WorkflowImportDialog } from './CanvasTransferDialogs'

interface CanvasProjectDialogsProps {
  canvasExport?: ComponentProps<typeof CanvasExportDialog>
  workflowImport?: ComponentProps<typeof WorkflowImportDialog>
  publication?: ComponentProps<typeof PublishWorkDialog>
  subject?: ComponentProps<typeof CreateSubjectDialog>
}

/** No wrapper DOM: keep project dialogs outside the pan/zoom viewport. */
export function CanvasProjectDialogs({ canvasExport, workflowImport, publication, subject }: CanvasProjectDialogsProps) {
  return <>
    {canvasExport ? <CanvasExportDialog {...canvasExport} /> : null}
    {workflowImport ? <WorkflowImportDialog {...workflowImport} /> : null}
    {publication ? <PublishWorkDialog {...publication} /> : null}
    {subject ? <CreateSubjectDialog {...subject} /> : null}
  </>
}
