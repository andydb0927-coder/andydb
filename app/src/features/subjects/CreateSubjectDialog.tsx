import { Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import { subjectExtractionUnavailable } from '../generation/ark-subject-extraction-provider'
import type { SubjectExtractionDraft, SubjectExtractionMetadata } from './subject-model'

export interface CreateSubjectFormValue {
  name: string
  description: string
  tags: string[]
  aiExtraction?: SubjectExtractionMetadata
}

interface CreateSubjectDialogProps {
  sourceTitle: string
  coverUrl: string
  busy?: boolean
  error?: string
  extractionDisabledReason?: string
  extractionNotice?: string
  onExtract?(signal: AbortSignal): Promise<SubjectExtractionDraft>
  onCancel(): void
  onSubmit(value: CreateSubjectFormValue): void
}

export function CreateSubjectDialog({
  sourceTitle,
  coverUrl,
  busy = false,
  error,
  extractionDisabledReason,
  extractionNotice,
  onExtract,
  onCancel,
  onSubmit,
}: CreateSubjectDialogProps) {
  const [name, setName] = useState(`${sourceTitle} 主体`)
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [appearance, setAppearance] = useState('')
  const [clothing, setClothing] = useState('')
  const [extracted, setExtracted] = useState<SubjectExtractionDraft>()
  const [extracting, setExtracting] = useState(false)
  const [extractionError, setExtractionError] = useState('')
  const dirtyFields = useRef(new Set<string>())
  const extractionController = useRef<AbortController | undefined>(undefined)
  const nameRef = useRef<HTMLInputElement>(null)
  const unavailable = extractionDisabledReason ?? (!onExtract ? subjectExtractionUnavailable : undefined)

  const extract = useCallback(async () => {
    if (!onExtract || unavailable || extractionController.current) return
    const controller = new AbortController()
    extractionController.current = controller
    setExtracting(true)
    setExtractionError('')
    try {
      const result = await onExtract(controller.signal)
      if (controller.signal.aborted) return
      setExtracted(result)
      if (!dirtyFields.current.has('name')) setName(result.name)
      if (!dirtyFields.current.has('description')) setDescription(`外貌：${result.appearance}\n服装：${result.clothing}`)
      if (!dirtyFields.current.has('tags')) setTags(result.tags.join(', '))
      if (!dirtyFields.current.has('appearance')) setAppearance(result.appearance)
      if (!dirtyFields.current.has('clothing')) setClothing(result.clothing)
    } catch (error) {
      if (controller.signal.aborted) return
      const message = error instanceof Error ? error.message : ''
      setExtractionError(/^主体(?:提取|图片)/.test(message) ? message : '主体提取失败，可手动填写或重试。')
    } finally {
      if (extractionController.current === controller) {
        extractionController.current = undefined
        if (!controller.signal.aborted) setExtracting(false)
      }
    }
  }, [onExtract, unavailable])

  // Delay dispatch past StrictMode's setup/cleanup replay; never submit twice.
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void extract() })
    return () => { active = false; extractionController.current?.abort(); extractionController.current = undefined }
  }, [extract])

  const cancel = useCallback(() => {
    extractionController.current?.abort()
    extractionController.current = undefined
    setExtracting(false)
    onCancel()
  }, [onCancel])

  useEffect(() => {
    nameRef.current?.focus()
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { event.stopPropagation(); cancel() }
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [busy, cancel])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || busy) return
    extractionController.current?.abort()
    extractionController.current = undefined
    setExtracting(false)
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
      ...(extracted ? { aiExtraction: {
        appearance: appearance.trim(), clothing: clothing.trim(), providerId: extracted.providerId,
        modelName: extracted.modelName, extractedAt: extracted.extractedAt, usage: extracted.usage,
      } } : {}),
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
          <button type="button" aria-label="关闭创建主体" disabled={busy} onClick={cancel}>
            <X aria-hidden="true" />
          </button>
        </header>
        {onExtract && !unavailable ? <p className="create-subject-dialog__notice">{extractionNotice ?? '已启用豆包视觉提取：自动发送图片，按实际token计费。仅生成草稿，保存前请核对。'}</p> : null}
        <img className="create-subject-dialog__cover" src={coverUrl} alt={`${sourceTitle}主体封面`} />
        <label>主体名称
          <input ref={nameRef} aria-label="主体名称" value={name} maxLength={80} onChange={(event) => { dirtyFields.current.add('name'); setName(event.target.value) }} />
        </label>
        <label>描述
          <textarea aria-label="主体描述" value={description} maxLength={400} onChange={(event) => { dirtyFields.current.add('description'); setDescription(event.target.value) }} />
        </label>
        <label>标签
          <input aria-label="主体标签" value={tags} placeholder="用逗号分隔，最多 8 个" onChange={(event) => { dirtyFields.current.add('tags'); setTags(event.target.value) }} />
        </label>
        {extracted ? <>
          <label>外貌<input aria-label="主体外貌" maxLength={180} value={appearance} onChange={event => { dirtyFields.current.add('appearance'); setAppearance(event.target.value) }} /></label>
          <label>服装<input aria-label="主体服装" maxLength={180} value={clothing} onChange={event => { dirtyFields.current.add('clothing'); setClothing(event.target.value) }} /></label>
        </> : null}
        <div className="create-subject-dialog__provider">
          <button type="button" disabled={busy || extracting || Boolean(unavailable)} aria-label="AI 身份提取" title={unavailable ?? '重新提取会再次计费，仅补充未手动修改的字段。'} onClick={() => void extract()}>
            <Sparkles aria-hidden="true" />{extracting ? '提取中…' : extracted ? '重新提取' : 'AI 身份提取'}
          </button>
          <span>{unavailable ?? '视觉描述，不识别真实身份；只补未编辑字段。'}</span>
        </div>
        {extracting ? <p role="status">正在提取主体描述，可继续编辑或取消。</p> : extracted ? <p role="status">已填写视觉草稿，请核对。来源：{extracted.modelName}{extracted.usage?.estimatedCostCny !== undefined ? ` · 估算费用 ¥${extracted.usage.estimatedCostCny.toFixed(6)}` : ''}</p> : null}
        {extractionError ? <p role="alert">{extractionError}</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        <footer>
          <button type="button" disabled={busy} onClick={cancel}>取消</button>
          <button type="submit" disabled={busy || !name.trim()}>{busy ? '保存中…' : '保存到主体库'}</button>
        </footer>
      </form>
    </div>
  )
}
