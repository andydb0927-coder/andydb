import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../../ui/ConfirmDialog'

import type { GenerationRequest } from './generation-adapter'
import type { LibTvProviderSelection } from './libtv-contract'

export interface GenerationConfirmationDialogProps {
  request: GenerationRequest
  selection: LibTvProviderSelection
  returnFocusTo: HTMLElement
  onCancel(): void
  onConfirm(): void
}

const operationLabels: Record<GenerationRequest['operation'], string> = {
  regenerate: '重生成',
  'extend-shot': '延展镜头',
  'generate-video': '生成视频',
}

export function GenerationConfirmationDialog({
  request,
  selection,
  returnFocusTo,
  onCancel,
  onConfirm,
}: GenerationConfirmationDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const completedRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const modelName =
    request.targetKind === 'video'
      ? selection.videoModelName
      : selection.imageModelName

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  function finish(action: () => void) {
    if (completedRef.current) return
    completedRef.current = true
    action()
    queueMicrotask(() => {
      if (returnFocusTo.isConnected) returnFocusTo.focus()
    })
  }

  return (
    <ConfirmDialog as="section" overlayClassName="generation-confirmation" overlayRole="presentation"
      className="generation-confirmation__dialog" labelledBy="generation-confirmation-title"
      describedBy="generation-confirmation-impact generation-confirmation-warning" onClose={() => finish(onCancel)}>
        <header>
          <p>REMOTE GENERATION</p>
          <h2 id="generation-confirmation-title">确认 LibTV 实际生成</h2>
        </header>
        <dl>
          <div><dt>远程画布</dt><dd>{selection.projectName}</dd></div>
          <div><dt>模型</dt><dd>{modelName}</dd></div>
          <div><dt>操作</dt><dd>{operationLabels[request.operation]}</dd></div>
          <div>
            <dt>参考素材</dt>
            <dd>{request.referenceAssets.length} 个参考素材</dd>
          </div>
        </dl>
        <p
          id="generation-confirmation-impact"
          className="generation-confirmation__impact"
        >
          确认后会在远程画布创建生成节点；
          {request.referenceAssets.length > 0
            ? `${request.referenceAssets.length} 个参考素材会先上传到 LibTV。`
            : '本次没有参考素材需要上传。'}
        </p>
        <p id="generation-confirmation-warning" className="generation-confirmation__warning">
          此操作可能消耗 LibTV 积分，费用与耗时以 LibTV 提交时为准。
        </p>
        <div className="generation-confirmation__actions">
          <button ref={cancelRef} type="button" onClick={() => finish(onCancel)}>
            取消
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setSubmitting(true)
              finish(onConfirm)
            }}
          >
            确认并提交 LibTV
          </button>
        </div>
    </ConfirmDialog>
  )
}
