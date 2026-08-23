import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Sparkles,
  Trophy,
  UsersRound,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

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

  const [startsAt] = challenge.period.split(' — ')

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
          <Link className="challenge-detail-page__create focus-visible" to="/projects/new">
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
            <h2 id="activity-calendar-heading">活动日历</h2>
            <ol className="challenge-calendar">
              <li><strong>作品准备</strong><span>{startsAt} 起</span></li>
              <li><strong>本地整理</strong><span>在活动周期内整理作品与创作过程</span></li>
              <li><strong>结果记录</strong><span>演示目录中的状态仅用于页面预览</span></li>
            </ol>
          </section>

          <hr className="challenge-detail-section__divider" />
          <section className="challenge-detail-section" aria-labelledby="activity-track-heading" role="region">
            <p className="platform-page__eyebrow">CREATIVE TRACKS</p>
            <h2 id="activity-track-heading">活动赛道</h2>
            <div className="challenge-track-grid">
              <article><span>01</span><h3>叙事短片</h3><p>用完整镜头语言呈现原创故事。</p></article>
              <article><span>02</span><h3>视觉实验</h3><p>探索生成影像、风格与声音的边界。</p></article>
              <article><span>03</span><h3>Skill 工作流</h3><p>整理可复用的创作方法与作品结果。</p></article>
            </div>
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
              <article data-tier="gold"><Trophy aria-hidden="true" /><h3>最佳导演奖</h3><p>关注叙事调度、镜头设计与整体完成度。</p></article>
              <article data-tier="silver"><Trophy aria-hidden="true" /><h3>最佳视觉奖</h3><p>关注视觉语言、风格一致性与技术表达。</p></article>
              <article data-tier="bronze"><Trophy aria-hidden="true" /><h3>新锐创作者奖</h3><p>关注原创思路、成长潜力与创作过程。</p></article>
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
        </div>
      </article>
    </main>
  )
}
