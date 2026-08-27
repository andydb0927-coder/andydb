import type { ComponentProps } from 'react'
import { CanvasEmptyStarter } from './CanvasEmptyStarter'
import { CanvasToolbar } from './CanvasToolbar'

export interface WorkflowBatchView {
  id: string
  label: string
  status: 'running' | 'paused' | 'completed'
  completed: number
  total: number
  currentNodeTitle?: string
  error?: string
}

export function CanvasWorkflowTools({ empty, toolbar }: {
  empty?: ComponentProps<typeof CanvasEmptyStarter>
  toolbar: ComponentProps<typeof CanvasToolbar>
}) {
  return <>
    {empty ? <CanvasEmptyStarter {...empty} /> : null}
    <CanvasToolbar {...toolbar} />
  </>
}

export function CanvasWorkflowBatchStatus({ batch, onRetry, onDismiss }: {
  batch?: WorkflowBatchView
  onRetry(): void
  onDismiss(): void
}) {
  if (!batch) return null
  return <aside className="workflow-batch-status floating-panel" role="status" aria-label="工作流整组执行状态" data-status={batch.status}>
    <div><strong>{batch.label}</strong><span>{batch.completed}/{batch.total}</span></div>
    {batch.currentNodeTitle ? <p>当前：{batch.currentNodeTitle}</p> : null}
    {batch.error ? <p>{batch.error}</p> : null}
    <progress value={batch.completed} max={batch.total} />
    {batch.status === 'paused' ? <button type="button" onClick={onRetry}>重试当前节点</button> : null}
    {batch.status === 'completed' ? <button type="button" onClick={onDismiss}>完成</button> : null}
  </aside>
}
