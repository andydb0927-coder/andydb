import { Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { aiSubjectExtractionProvider } from './subject-repository'

export interface CreateSubjectFormValue {
  name: string
  description: string
  tags: string[]
}

interface CreateSubjectDialogProps {
  sourceTitle: string
  coverUrl: string
  busy?: boolean
  error?: string
  onCancel(): void
  onSubmit(value: CreateSubjectFormValue): void
}

export function CreateSubjectDialog({
  sourceTitle,
  coverUrl,
  busy = false,
  error,
  onCancel,
  onSubmit,
}: CreateSubjectDialogProps) {
  const [name, setName] = useState(`${sourceTitle} 主体`)
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [busy, onCancel])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || busy) return
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
    })
  }

  return (
    <div className="canvas-dialog-backdrop" role="presentation">
      <form
        className="create-subject-dialog floating-panel"
        role="dialog"
        aria-modal="true"
        aria-label="创建本地主体"
        onSubmit={submit}
      >
        <header>
          <div><span>LOCAL SUBJECT</span><h2>创建主体</h2></div>
          <button type="button" aria-label="关闭创建主体" disabled={busy} onClick={onCancel}>
            <X aria-hidden="true" />
          </button>
        </header>
        <img className="create-subject-dialog__cover" src={coverUrl} alt={`${sourceTitle}主体封面`} />
        <label>主体名称
          <input ref={nameRef} aria-label="主体名称" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>描述
          <textarea aria-label="主体描述" value={description} maxLength={400} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label>标签
          <input aria-label="主体标签" value={tags} placeholder="用逗号分隔，最多 8 个" onChange={(event) => setTags(event.target.value)} />
        </label>
        <div className="create-subject-dialog__provider">
          <button type="button" disabled aria-label="AI 身份提取" title={aiSubjectExtractionProvider.disabledReason}>
            <Sparkles aria-hidden="true" />AI 身份提取
          </button>
          <span>{aiSubjectExtractionProvider.disabledReason}</span>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        <footer>
          <button type="button" disabled={busy} onClick={onCancel}>取消</button>
          <button type="submit" disabled={busy || !name.trim()}>{busy ? '保存中…' : '保存到主体库'}</button>
        </footer>
      </form>
    </div>
  )
}
