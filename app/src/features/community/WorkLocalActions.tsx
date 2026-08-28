import { Bookmark } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PublishedWork, WorkVisibility } from './community-model'
import type { CommunityWorkRepository } from './community-repository'
import { getWorkVisibility } from './work-portfolio'

export type WorkSettingsRepository = Pick<CommunityWorkRepository, 'toggleFavorite' | 'setVisibility'>

export function WorkLocalActions({ work, repository, onChange }: {
  work: PublishedWork
  repository: WorkSettingsRepository
  onChange(work: PublishedWork): void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const change = async (visibility?: WorkVisibility) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const next = visibility ? await repository.setVisibility(work.id, visibility) : await repository.toggleFavorite(work.id)
      if (!next) throw new Error('work missing')
      if (mounted.current) onChange(next)
    } catch {
      if (mounted.current) setError('作品设置保存失败，请重试。')
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <div className="work-local-actions">
      <button type="button" disabled={busy} aria-pressed={work.viewer.favorited} onClick={() => void change()}>
        <Bookmark aria-hidden="true" />{work.viewer.favorited ? '取消收藏' : '收藏'}
      </button>
      <label>公开标记
        <select aria-label="公开标记" disabled={busy} value={getWorkVisibility(work)} onChange={(event) => void change(event.target.value === 'public' ? 'public' : 'private')}>
          <option value="private">私密 · 本地</option>
          <option value="public">公开 · 本地</option>
        </select>
      </label>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  )
}
