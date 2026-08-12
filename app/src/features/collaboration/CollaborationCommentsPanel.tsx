import { ChevronDown, ChevronUp, MessageSquareText } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { CollaborationRepository } from './collaboration-repository'
import type { ChangeComment, CommentTargetType } from './collaboration-model'

type CommentStore = Pick<CollaborationRepository, 'listComments' | 'addComment' | 'resolveComment'>

export interface CollaborationCommentsPanelProps {
  projectId: string
  targetType: CommentTargetType
  targetId: string
  targetLabel: string
  repository: CommentStore
  variant?: 'floating' | 'inline'
}

export function CollaborationCommentsPanel({
  projectId,
  targetType,
  targetId,
  targetLabel,
  repository,
  variant = 'inline',
}: CollaborationCommentsPanelProps) {
  const [comments, setComments] = useState<ChangeComment[]>([])
  const [body, setBody] = useState('')
  const [feedback, setFeedback] = useState<string>()
  const [collapsed, setCollapsed] = useState(
    () => variant === 'floating' && typeof window !== 'undefined' && window.innerWidth <= 800,
  )
  const narrowFloating = variant === 'floating'
  useEffect(() => {
    if (!narrowFloating) return
    const media = window.matchMedia('(max-width: 800px)')
    const update = () => setCollapsed(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [narrowFloating])

  useEffect(() => {
    let active = true
    setComments([])
    void repository.listComments(projectId, targetType, targetId).then(
      (records) => { if (active) setComments(records) },
      () => { if (active) setFeedback('无法读取本地评论') },
    )
    return () => { active = false }
  }, [projectId, repository, targetId, targetType])

  const add = async () => {
    try {
      const created = await repository.addComment(projectId, targetType, targetId, body)
      setComments((current) => [...current, created])
      setBody('')
      setFeedback('评论已保存到本地')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '无法保存评论')
    }
  }

  const resolve = async (id: string) => {
    try {
      const next = await repository.resolveComment(id)
      setComments((current) => current.map((item) => item.id === id ? next : item))
    } catch {
      setFeedback('无法更新评论')
    }
  }

  const openCount = comments.filter(({ status }) => status === 'open').length
  const asideClass = collapsed
    ? `collaboration-comments collaboration-comments--${variant} collaboration-comments--collapsed`
    : `collaboration-comments collaboration-comments--${variant}`
  return (
    <aside className={asideClass} aria-label={`${targetLabel}评论`}>
      <header>
        <span><MessageSquareText aria-hidden="true" /><strong>变更注释</strong></span>
        <span className="collaboration-comments__header-meta">
          <span>{openCount} 条待处理</span>
          <button
            type="button"
            className="collaboration-comments__toggle"
            aria-label={collapsed ? '展开评论面板' : '折叠评论面板'}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
          </button>
        </span>
      </header>
      <p className="collaboration-comments__target">{targetLabel} · 本地模拟</p>
      <ol>
        {comments.map((comment) => (
          <li key={comment.id} data-status={comment.status}>
            <span>{comment.body}</span>
            {comment.status === 'open' ? (
              <button type="button" onClick={() => void resolve(comment.id)}>标记已解决</button>
            ) : <small>已解决</small>}
          </li>
        ))}
      </ol>
      <label>
        <span>评论内容</span>
        <textarea aria-label="评论内容" value={body} onChange={(event) => setBody(event.currentTarget.value)} placeholder="记录节点或片段的修改意见" />
      </label>
      <button type="button" disabled={!body.trim()} onClick={() => void add()}>添加评论</button>
      {feedback ? <p role="status">{feedback}</p> : null}
    </aside>
  )
}
