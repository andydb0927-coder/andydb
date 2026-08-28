import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { WirelessCanvasDatabase } from '../project/project-repository'
import { SubjectRepository } from './subject-repository'
import type { SubjectAsset } from './subject-model'
import { SubjectDetailsContent } from './SubjectDetails'

const repository = new SubjectRepository(new WirelessCanvasDatabase())
export function SubjectDetailsPage() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const [subject, setSubject] = useState<SubjectAsset>(), [state, setState] = useState('loading'), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true; setState('loading'); setSubject(undefined)
    void repository.get(subjectId ?? '').then(value => { if (active) { setSubject(value); setState(value ? 'ready' : 'missing') } }, () => { if (active) setState('error') })
    return () => { active = false }
  }, [subjectId, attempt])
  return <main className="subject-details-page">{subject ? <SubjectDetailsContent key={subject.id} subject={subject} repository={repository} onUpdated={setSubject} /> : state === 'loading' ? <p role="status">正在读取主体…</p> : <><h1>{state === 'missing' ? '主体不存在或已删除' : '主体读取失败'}</h1><p>主体库保存在当前浏览器，不会跨浏览器同步。</p>{state === 'error' ? <button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button> : null}</>}</main>
}
