import { ArrowLeft, CalendarDays, CheckCircle2, Sparkles, Trophy, UsersRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { getCreatorChallenge } from './challenge-catalog'

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

  return (
    <main className="platform-page challenge-detail-page">
      <Link className="challenge-detail-page__back focus-visible" to="/challenges">
        <ArrowLeft aria-hidden="true" />返回挑战赛
      </Link>
      <div
        aria-label={`${challenge.title} 封面`}
        className={`challenge-detail-page__hero challenge-card__cover--${challenge.coverTone}`}
        role="img"
      >
        <p>{challenge.theme}</p>
        <h1>{challenge.title}</h1>
        <span>{challenge.coverLabel}</span>
        <Link className="challenge-detail-page__create focus-visible" to="/projects/new">
          <Sparkles aria-hidden="true" />去创作
        </Link>
      </div>
      <section className="challenge-detail-page__summary" aria-label="挑战赛概要">
        <p>{challenge.summary}</p>
        <dl>
          <div><dt><CalendarDays aria-hidden="true" />活动时间</dt><dd>{challenge.period}</dd></div>
          <div><dt><Trophy aria-hidden="true" />奖金</dt><dd>{challenge.prize}</dd></div>
          <div><dt><UsersRound aria-hidden="true" />参与数</dt><dd>{challenge.participants.toLocaleString('zh-CN')} 人参与</dd></div>
        </dl>
      </section>
      <div className="challenge-detail-page__sections">
        <section className="challenge-detail-section" aria-labelledby="activity-calendar-heading" role="region">
          <p className="platform-page__eyebrow">ACTIVITY CALENDAR</p>
          <h2 id="activity-calendar-heading">活动日历</h2>
          <ol className="challenge-calendar">
            <li><strong>作品征集</strong><span>{challenge.period.split(' — ')[0]} 起</span></li>
            <li><strong>评审与公示</strong><span>征集结束后 7 个工作日</span></li>
            <li><strong>获奖发布</strong><span>评审完成后于活动页公示</span></li>
          </ol>
        </section>
        <section className="challenge-detail-section" aria-labelledby="activity-track-heading" role="region">
          <p className="platform-page__eyebrow">CREATIVE TRACKS</p>
          <h2 id="activity-track-heading">活动赛道</h2>
          <div className="challenge-track-grid">
            <article><span>01</span><h3>叙事短片</h3><p>用完整镜头语言呈现原创故事。</p></article>
            <article><span>02</span><h3>视觉实验</h3><p>探索生成影像、风格与声音的边界。</p></article>
            <article><span>03</span><h3>Skill 工作流</h3><p>提交可复用的创作方法与作品结果。</p></article>
          </div>
        </section>
        <section className="challenge-detail-section" aria-labelledby="activity-guide-heading" role="region">
          <p className="platform-page__eyebrow">HOW TO ENTER</p>
          <h2 id="activity-guide-heading">参赛指引</h2>
          <ol className="challenge-guide">
            {['创建本地项目并完成原创内容', '在时间线预览中检查画面与节奏', '导出作品并保留创作过程', '活动期内按规则提交作品'].map((step, index) => (
              <li key={step}><CheckCircle2 aria-hidden="true" /><span><strong>步骤 {index + 1}</strong>{step}</span></li>
            ))}
          </ol>
        </section>
        <section className="challenge-detail-section" aria-labelledby="activity-awards-heading" role="region">
          <p className="platform-page__eyebrow">TIERED AWARDS</p>
          <h2 id="activity-awards-heading">分级奖项</h2>
          <div className="challenge-award-grid">
            <article data-tier="gold"><Trophy aria-hidden="true" /><h3>最佳导演奖</h3><p>现金、创作积分与首页推荐位</p></article>
            <article data-tier="silver"><Trophy aria-hidden="true" /><h3>最佳视觉奖</h3><p>创作积分与活动专题推荐</p></article>
            <article data-tier="bronze"><Trophy aria-hidden="true" /><h3>新锐创作者奖</h3><p>创作积分与认证徽章</p></article>
          </div>
        </section>
      </div>
    </main>
  )
}
