import { Copy, LockKeyhole, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { ModelProvider } from '../generation/model-provider-registry'

export function AiPlaceholderBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="ai-placeholder-badge" data-compact={compact || undefined} aria-hidden="true">
      <LockKeyhole aria-hidden="true" />待接入
    </span>
  )
}

export function AiPlaceholderNotice({
  provider,
  prompt,
  onCopy,
  onClose,
}: {
  provider: ModelProvider
  prompt: string
  onCopy(prompt: string): void
  onClose(): void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    closeRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  return createPortal(
    <div className="ai-placeholder-dialog-backdrop nodrag">
      <section
        className="ai-placeholder-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={`${provider.modelName}功能待接入`}
      >
        <header>
          <div>
            <AiPlaceholderBadge />
            <h2>{provider.modelName}</h2>
          </div>
          <button ref={closeRef} type="button" aria-label="关闭" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <p>{provider.disabledReason}</p>
        <p>预计成本 {provider.pricing.amount} 积分；接入真实服务前不会产生费用。</p>
        <div className="ai-placeholder-dialog__prompt">
          <strong>可先使用的提示词</strong>
          <p>{prompt}</p>
        </div>
        <footer>
          <button
            type="button"
            onClick={() => {
              onCopy(prompt)
              setCopied(true)
            }}
          >
            <Copy aria-hidden="true" />复制提示词到图片节点
          </button>
        </footer>
        {copied ? <p role="status">已复制提示词，可继续编辑或切换本地模型生成。</p> : null}
      </section>
    </div>,
    document.body,
  )
}
