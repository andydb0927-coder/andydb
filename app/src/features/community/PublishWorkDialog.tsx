import { Image, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { PublishCoverOption } from './publication'

export interface PublishWorkFormValue {
  title: string
  description: string
  coverUrl: string
  coverNodeId: string
  tags: string[]
}

interface PublishWorkDialogProps {
  projectTitle: string
  coverOptions: PublishCoverOption[]
  busy?: boolean
  error?: string
  onClose(): void
  onSubmit(value: PublishWorkFormValue): void
}

function parseTags(value: string) {
  return [...new Set(value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 5)
}

export function PublishWorkDialog({
  projectTitle,
  coverOptions,
  busy = false,
  error,
  onClose,
  onSubmit,
}: PublishWorkDialogProps) {
  const [title, setTitle] = useState(projectTitle)
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [coverId, setCoverId] = useState(coverOptions[0]?.id ?? '')
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const cover = coverOptions.find(({ id }) => id === coverId)
    if (!title.trim() || !cover || busy) return
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      coverUrl: cover.url,
      coverNodeId: cover.nodeId,
      tags: parseTags(tags),
    })
  }

  return (
    <div className="publish-work-dialog__backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section className="publish-work-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-work-title">
        <header>
          <div>
            <p>LOCAL PUBLISH</p>
            <h2 id="publish-work-title">发布作品</h2>
          </div>
          <button ref={closeButtonRef} type="button" aria-label="关闭发布作品" disabled={busy} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            <span>作品标题</span>
            <input aria-label="作品标题" value={title} maxLength={60} required onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            <span>作品简介</span>
            <textarea aria-label="作品简介" value={description} maxLength={500} rows={4} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <fieldset className="publish-work-dialog__covers">
            <legend>选择封面节点结果图</legend>
            {coverOptions.length > 0 ? (
              <div>
                {coverOptions.map((cover) => (
                  <label key={cover.id}>
                    <input type="radio" name="publish-cover" value={cover.id} checked={coverId === cover.id} aria-label={cover.label} onChange={() => setCoverId(cover.id)} />
                    <img src={cover.url} alt="" />
                    <span>{cover.label}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p role="alert"><Image aria-hidden="true" />请先在画布生成或导入一张图片结果，再选择为作品封面。</p>
            )}
          </fieldset>
          <label>
            <span>作品标签</span>
            <input aria-label="作品标签" value={tags} placeholder="雨夜，电影，氛围（最多 5 个）" onChange={(event) => setTags(event.target.value)} />
          </label>
          <p className="publish-work-dialog__note">仅写入当前浏览器 IndexedDB，不会发布到 LibTV 或任何云端。</p>
          {error ? <p className="publish-work-dialog__error" role="alert">{error}</p> : null}
          <footer>
            <button type="button" disabled={busy} onClick={onClose}>取消</button>
            <button type="submit" disabled={busy || coverOptions.length === 0 || !title.trim()}>
              {busy ? '正在发布…' : '发布到本地作品'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
