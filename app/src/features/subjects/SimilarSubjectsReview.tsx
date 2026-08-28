import type { SimilarSubject } from './subject-consistency'
import './subject-details.css'

export function SimilarSubjectsReview({ candidates, busy, onMerge, onCreate, onCancel }: {
  candidates: SimilarSubject[]; busy?: boolean; onMerge(id: string): void; onCreate(): void; onCancel(): void
}) {
  return <section className="subject-similarity-list" aria-label="相似主体提示">
    <h3>发现相似主体，是否合并？</h3><p>仅按描述词重叠与来源图宽高比比较，不是人脸识别。合并保留已有主体ID与引用，并补充样本、描述和标签；不会再次调用AI。</p>
    {candidates.map(candidate => <article key={candidate.subject.id}><img src={candidate.subject.coverUrl} alt={`${candidate.subject.name}相似样本`} /><span>{candidate.subject.name} · {Math.round(candidate.score * 100)}%{candidate.sameSource ? ' · 同一来源图' : ''}</span><button type="button" disabled={busy} onClick={() => onMerge(candidate.subject.id)}>合并到{candidate.subject.name}</button></article>)}
    <div><button type="button" disabled={busy} onClick={onCancel}>返回修改</button><button type="button" disabled={busy} onClick={onCreate}>仍新建主体</button></div>
  </section>
}
