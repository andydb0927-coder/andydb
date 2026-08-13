import { ArrowLeft, CalendarDays, Trophy, UsersRound } from 'lucide-react'
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
      </div>
      <section className="challenge-detail-page__summary" aria-label="挑战赛概要">
        <p>{challenge.summary}</p>
        <dl>
          <div><dt><CalendarDays aria-hidden="true" />活动时间</dt><dd>{challenge.period}</dd></div>
          <div><dt><Trophy aria-hidden="true" />奖金</dt><dd>{challenge.prize}</dd></div>
          <div><dt><UsersRound aria-hidden="true" />参与数</dt><dd>{challenge.participants.toLocaleString('zh-CN')} 人参与</dd></div>
        </dl>
      </section>
      <section className="challenge-detail-page__placeholder" aria-labelledby="challenge-detail-heading">
        <p className="platform-page__eyebrow">LOCAL DETAIL</p>
        <h2 id="challenge-detail-heading">详情占位</h2>
        <p>活动规则、作品提交、排名与报名能力将在后续功能域实现。</p>
        <button disabled type="button">本地演示不可报名</button>
      </section>
    </main>
  )
}
