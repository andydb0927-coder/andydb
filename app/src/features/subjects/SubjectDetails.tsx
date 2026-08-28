import { useEffect, useRef, useState } from 'react'
import { withAppBase } from '../../app/public-url'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { useProjectStore } from '../project/project-store'
import type { SubjectRepository } from './subject-repository'
import type { SubjectAsset } from './subject-model'
import type { SubjectUsage } from './subject-consistency'
import './subject-details.css'

export type SubjectLibraryRepository = Pick<SubjectRepository, 'list' | 'update' | 'delete'> & Partial<Pick<SubjectRepository, 'usage'>>
type UsageRepository = Partial<Pick<SubjectRepository, 'usage'>>

function useSubjectUsage(id: string, repository: UsageRepository) {
  const [usage, setUsage] = useState<SubjectUsage>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true; setError(''); setUsage(undefined)
    const project = useProjectStore.getState().activeProject
    const reading = repository.usage ? repository.usage(id, project ? [project] : []) : Promise.reject(new Error('统计服务不可用'))
    void reading.then(result => { if (active) setUsage(result) }, () => { if (active) setError('引用统计读取失败，无法确认影响范围。请重试。') })
    return () => { active = false }
  }, [id, repository, attempt])
  return { usage, error, retry: () => setAttempt(value => value + 1) }
}
function UsageSummary({ usage }: { usage: SubjectUsage }) {
  return <section aria-label="主体引用统计">
    <p>画布节点引用：{usage.nodeReferences} · 角色引用：{usage.characterReferences} · 分镜引用：{usage.shotReferences}</p>
    <p>生成使用次数：{usage.generationCount}</p><small>按保存的任务计数（含失败/取消），同一任务重试不重复计数；旧任务没有主体快照时不推测。</small>
    <h3>引用项目</h3>{usage.projects.length ? <ul>{usage.projects.map(project => <li key={project.projectId}><a href={withAppBase(`/project/${encodeURIComponent(project.projectId)}`)}>{project.title}</a> · 节点{project.nodeReferences} / 角色{project.characterReferences} / 分镜{project.shotReferences} / 任务{project.generationCount}</li>)}</ul> : <p>暂无引用项目</p>}
  </section>
}

export function SubjectDetailsContent({ subject, repository, onUpdated }: {
  subject: SubjectAsset
  repository: Pick<SubjectRepository, 'update'> & UsageRepository
  onUpdated(subject: SubjectAsset): void
}) {
  const [description, setDescription] = useState(subject.description)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const { usage, error, retry } = useSubjectUsage(subject.id, repository)
  return <div className="subject-details-content">
    <h2>主体详情 · {subject.name}</h2>
    <div className="subject-details-images">{[...new Set([subject.coverUrl, ...subject.sampleImages])].map((url, index) => <img key={url} src={url} alt={`${subject.name}来源图 ${index + 1}`} />)}</div>
    {subject.sourceProjectId ? <a href={withAppBase(`/project/${encodeURIComponent(subject.sourceProjectId)}`)}>查看来源项目</a> : <p>来源项目未记录</p>}
    <p>{subject.width && subject.height ? `${subject.width} × ${subject.height}` : '来源尺寸未记录'} · 标签：{subject.tags.join(' / ') || '无'}</p>
    <form onSubmit={event => {
      event.preventDefault(); if (pending.current) return
      pending.current = true; setSaving(true); setMessage('')
      void repository.update(subject.id, { name: subject.name, description, tags: subject.tags }).then(updated => {
        onUpdated(updated); setMessage('特征描述已保存，下次生成将使用最新描述；历史任务保持原快照。')
      }, () => setMessage('主体描述保存失败，请重试。')).finally(() => { pending.current = false; setSaving(false) })
    }}><label>特征描述<textarea aria-label="主体特征描述" maxLength={400} rows={4} value={description} onChange={event => setDescription(event.currentTarget.value)} /></label>
      <button disabled={saving} type="submit">保存特征描述</button>
    </form>
    {message ? <p role="status">{message}</p> : null}
    {usage ? <UsageSummary usage={usage} /> : error ? <><p role="alert">{error}</p><button type="button" onClick={retry}>重试引用统计</button></> : <p role="status">正在读取引用统计…</p>}
  </div>
}

export function SubjectDetailsDialog({ subject, repository, onUpdated, onClose }: {
  subject: SubjectAsset; repository: SubjectLibraryRepository; onUpdated(subject: SubjectAsset): void; onClose(): void
}) {
  return <ConfirmDialog portal label={`主体详情 ${subject.name}`} className="subject-details-dialog" overlayClassName="subject-details-backdrop nodrag nowheel" initialFocus="button" focusableSelector="button:not(:disabled),textarea,a" restoreFocus onClose={onClose}>
    <button type="button" aria-label="关闭主体详情" onClick={onClose}>关闭</button>
    <a href={withAppBase(`/subjects/${encodeURIComponent(subject.id)}`)}>打开主体详情页</a>
    <SubjectDetailsContent subject={subject} repository={repository} onUpdated={onUpdated} />
  </ConfirmDialog>
}

export function SubjectDeleteDialog({ subject, repository, onCancel, onDeleted }: {
  subject: SubjectAsset; repository: Pick<SubjectRepository, 'delete'> & UsageRepository; onCancel(): void; onDeleted(): void
}) {
  const { usage, error, retry } = useSubjectUsage(subject.id, repository)
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('')
  const pending = useRef(false)
  return <ConfirmDialog portal label={`删除主体 ${subject.name}`} className="subject-details-dialog" overlayClassName="subject-details-backdrop nodrag nowheel" restoreFocus initialFocus="button" focusableSelector="button:not(:disabled),a" onClose={() => { if (!busy) onCancel() }}>
    <h2>删除“{subject.name}”？</h2>
    <p>只移除主体库记录；已放入画布的参考图、特征快照、分镜和历史任务均保留，不删除生成资产。原引用不再随库内编辑更新。</p>
    {usage ? <UsageSummary usage={usage} /> : error ? <><p role="alert">{error}</p><button type="button" onClick={retry}>重试引用统计</button></> : <p role="status">正在核对引用影响…</p>}
    {failure ? <p role="alert">{failure}</p> : null}
    <footer><button type="button" disabled={busy} onClick={onCancel}>取消</button><button type="button" className="subject-delete-confirm" aria-label="确认删除主体" disabled={!usage || busy} onClick={() => {
      if (pending.current || !usage) return
      pending.current = true; setBusy(true); setFailure('')
      void repository.delete(subject.id).then(onDeleted, () => setFailure('主体删除失败，引用与数据未作界面移除，请重试。')).finally(() => { pending.current = false; setBusy(false) })
    }}>确认删除</button></footer>
  </ConfirmDialog>
}
