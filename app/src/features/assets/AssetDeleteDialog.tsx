import { useEffect, useRef } from 'react'

export interface AssetDeleteDialogProps {
  assetName: string
  busy: boolean
  returnFocusTo: HTMLElement
  impact?: { projectIds: string[]; nodeTitles: string[] }
  onCancel(): void
  onConfirm(): void
}

export function AssetDeleteDialog({
  assetName,
  busy,
  returnFocusTo,
  impact,
  onCancel,
  onConfirm,
}: AssetDeleteDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const submittedRef = useRef(false)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!busy) submittedRef.current = false
  }, [busy])

  function cancel() {
    if (busy || submittedRef.current) return
    onCancel()
    queueMicrotask(() => {
      if (returnFocusTo.isConnected) returnFocusTo.focus()
    })
  }

  function confirm() {
    if (busy || submittedRef.current) return
    submittedRef.current = true
    onConfirm()
  }

  return (
    <div className="canvas-dialog-backdrop" role="presentation">
      <section
        aria-describedby="asset-delete-impact"
        aria-labelledby="asset-delete-title"
        aria-modal="true"
        className="canvas-dialog"
        role="dialog"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          cancel()
        }}
      >
        <h2 id="asset-delete-title">删除素材 {assetName}</h2>
        <p id="asset-delete-impact">
          {impact ? (
            <>该素材被 {impact.projectIds.length} 个项目引用{impact.nodeTitles.length ? `，关联节点：${impact.nodeTitles.join('、')}` : ''}。继续将移除这些节点、版本和任务中的素材引用；远程资源不会被删除。</>
          ) : (
            <>该素材没有项目引用。此操作不会删除远程资源。</>
          )}
        </p>
        <div className="canvas-dialog__actions">
          <button ref={cancelRef} type="button" disabled={busy} onClick={cancel}>
            取消
          </button>
          <button
            className="canvas-dialog__danger"
            type="button"
            disabled={busy}
            onClick={confirm}
          >
            确认删除
          </button>
        </div>
      </section>
    </div>
  )
}
