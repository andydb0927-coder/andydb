import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Sparkles,
  Trophy,
  UsersRound,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { buildDemoWorks } from '../community/demo-works'
import { getCreatorChallenge, type ChallengeStatus } from './challenge-catalog'

const statusLabels: Record<ChallengeStatus, string> = {
  ongoing: '进行中',
  awarded: '已颁奖',
}

export function ChallengeDetailPage() {
  const { challengeId } = useParams<{ challengeId: string }>()
  const challenge = getCreatorChallenge(challengeId)

  if (!challenge) {
    return (
      <main className="platform-page challenge-detail-page">
        <p className="platform-page__eyebrow">CREATOR CHALLENGE</p>
        <h1>挑战赛暂不可用</h1>
        <p>该本地演示挑战赛不存在或已移除。</p>
        <Link className="challenge-detail-page__back focus-visible" to="/challenges">
          <ArrowLeft aria-hidden="true" />返回挑战赛
        </Link>
      </main>
    )
  }

  const exampleWorks = buildDemoWorks().slice(0, 3)

  return (
    <main className="platform-page challenge-detail-page">
      <Link className="challenge-detail-page__back focus-visible" to="/challenges">
        <ArrowLeft aria-hidden="true" />返回挑战赛
      </Link>

      <article className="challenge-detail-page__document">
        <header className="challenge-detail-page__header">
          <div className="challenge-detail-page__heading">
            <p className="platform-page__eyebrow">{challenge.theme} · {challenge.coverLabel.replace('\n', ' ')}</p>
            <h1>{challenge.title}</h1>
            <p className="challenge-detail-page__lead">{challenge.summary}</p>
          </div>
          <Link className="challenge-detail-page__create focus-visible" to={`/projects/new?challenge=${challenge.id}`}>
            <Sparkles aria-hidden="true" />去创作
          </Link>
          <dl className="challenge-detail-page__meta" aria-label="活动状态与日期">
            <div>
              <dt>活动状态</dt>
              <dd><span data-status={challenge.status}>{statusLabels[challenge.status]}</span></dd>
            </div>
            <div>
              <dt><CalendarDays aria-hidden="true" />活动日期</dt>
              <dd>{challenge.period}</dd>
            </div>
            <div>
              <dt><UsersRound aria-hidden="true" />目录参与数</dt>
              <dd>{challenge.participants.toLocaleString('zh-CN')} 人参与</dd>
            </div>
          </dl>
          <aside className="challenge-detail-page__boundary" aria-label="本地演示边界">
            本页使用本地演示目录，不代表真实报名、评审或线上提交。
          </aside>
        </header>

        <div className="challenge-detail-page__sections">
          <section className="challenge-detail-section" aria-labelledby="activity-calendar-heading" role="region">
            <p className="platform-page__eyebrow">ACTIVITY CALENDAR</p>
            <h2 id="activity-calendar-heading">赛事时间线</h2>
            <ol className="challenge-calendar">
              {challenge.timeline.map((entry) => (
                <li key={entry.title}>
                  <strong>{entry.title}</strong>
                  <span>{entry.date}</span>
                  <p>{entry.description}</p>
                </li>
              ))}
            </ol>
          </section>

          <hr className="challenge-detail-section__divider" />
          <section className="challenge-detail-section" aria-labelledby="activity-track-heading" role="region">
            <p className="platform-page__eyebrow">CREATIVE TRACKS</p>
            <h2 id="activity-track-heading">活动赛道</h2>
            <div className="challenge-track-grid">
              {challenge.tracks.map((track, index) => (
                <article key={track.title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <h3>{track.title}</h3><p>{track.description}</p>
                </article>
              ))}
            </div>
          </section>

          <hr className="challenge-detail-section__divider" />
          <section className="challenge-detail-section" aria-labelledby="activity-rules-heading" role="region">
            <p className="platform-page__eyebrow">RULES</p>
            <h2 id="activity-rules-heading">赛制规则</h2>
            <ol className="challenge-rule-list">
              {challenge.rules.map((rule, index) => (
                <li key={rule}><span>{String(index + 1).padStart(2, '0')}</span><p>{rule}</p></li>
              ))}
            </ol>
          </section>

          <hr className="challenge-detail-section__divider" />
          <section className="challenge-detail-section" aria-labelledby="activity-guide-heading" role="region">
            <p className="platform-page__eyebrow">HOW TO ENTER</p>
            <h2 id="activity-guide-heading">参赛指引</h2>
            <ol className="challenge-guide">
              {[
                '创建本地项目并完成原创内容',
                '在时间线预览中检查画面与节奏',
                '导出作品并保留创作过程',
                '将作品整理为待提交材料；本演示不会代为报名或提交',
              ].map((step, index) => (
                <li key={step}>
                  <CheckCircle2 aria-hidden="true" />
                  <span><strong>步骤 {index + 1}</strong>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <hr className="challenge-detail-section__divider" />
          <section className="challenge-detail-section" aria-labelledby="activity-awards-heading" role="region">
            <p className="platform-page__eyebrow">AWARD NOTES</p>
            <h2 id="activity-awards-heading">奖项说明</h2>
            <p className="challenge-detail-section__lead">
              本地目录记录的演示奖项为 {challenge.prize}；以下分级仅用于呈现页面结构。
            </p>
            <div className="challenge-award-grid">
              {challenge.awards.map((award, index) => (
                <article key={award.title} data-tier={['gold', 'silver', 'bronze'][index] ?? 'bronze'}>
                  <Trophy aria-hidden="true" /><h3>{award.title}</h3><p>{award.description}</p>
                </article>
              ))}
            </div>
          </section>

          <hr className="challenge-detail-section__divider" />
          <section className="challenge-detail-section" aria-labelledby="activity-review-heading" role="region">
            <p className="platform-page__eyebrow">REVIEW NOTES</p>
            <h2 id="activity-review-heading">评审说明</h2>
            <ul className="challenge-review-list">
              <li><strong>原创性</strong><span>作品应来自创作者自己的概念与素材组织。</span></li>
              <li><strong>表达完整</strong><span>主题、画面、声音和节奏共同服务于创作意图。</span></li>
              <li><strong>过程可读</strong><span>保留关键节点与版本，便于复盘本地创作工作流。</span></li>
            </ul>
            <p className="challenge-detail-page__disclaimer">
              评审条目是本地产品演示说明，不构成真实赛事规则或评选承诺。
            </p>
          </section>

          <hr className="challenge-detail-section__divider" />
          <section className="challenge-detail-section" aria-labelledby="activity-examples-heading" role="region">
            <p className="platform-page__eyebrow">EXAMPLE WORKS</p>
            <h2 id="activity-examples-heading">示例作品</h2>
            <p className="challenge-detail-section__lead">以下使用本地已发布作品演示赛事作品卡片，不代表真实参赛结果。</p>
            <div className="challenge-example-grid">
              {exampleWorks.map((work) => (
                <article key={work.id}>
                  <img src={work.coverUrl} alt="" />
                  <div><strong>{work.title}</strong><span>{work.author}</span></div>
                  <Link to={`/detail/${work.id}`} aria-label={`查看示例作品：${work.title}`}>查看作品</Link>
                </article>
              ))}
            </div>
          </section>
        </div>
      </article>
    </main>
  )
}
