import { useEffect, useRef } from 'react'

export interface AssetDeleteDialogProps {
  assetName: string
  busy: boolean
  returnFocusTo: HTMLElement
  onCancel(): void
  onConfirm(): void
}

export function AssetDeleteDialog({
  assetName,
  busy,
  returnFocusTo,
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
          仅未被任何项目、版本或任务引用的本地目录素材可以删除。
          此操作不会删除远程资源。
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
