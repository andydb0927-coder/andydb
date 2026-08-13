import { ArrowUpRight, CalendarDays, Trophy, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { creatorChallenges, type ChallengeStatus } from './challenge-catalog'

type ChallengeFilter = 'all' | ChallengeStatus

const challengeFilters: Array<{ id: ChallengeFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'ongoing', label: '进行中' },
  { id: 'awarded', label: '已颁奖' },
]

const statusLabels: Record<ChallengeStatus, string> = {
  ongoing: '进行中',
  awarded: '已颁奖',
}

function participantCount(count: number) {
  return new Intl.NumberFormat('zh-CN').format(count)
}

export function ChallengesPage() {
  const [filter, setFilter] = useState<ChallengeFilter>('all')
  const visibleChallenges = creatorChallenges.filter(
    (challenge) => filter === 'all' || challenge.status === filter,
  )

  return (
    <main className="platform-page challenges-page">
      <header className="challenges-page__header">
        <div>
          <p className="platform-page__eyebrow">CREATOR CHALLENGES</p>
          <h1>创作者挑战赛</h1>
          <p>从主题命题出发，用本地 AI 工作流完成一次影像实验。</p>
        </div>
        <div className="challenges-page__boundary">
          <Trophy aria-hidden="true" />
          <span>本地演示数据，不会发起真实报名或作品提交。</span>
        </div>
      </header>

      <div className="challenge-filters" aria-label="挑战赛状态">
        {challengeFilters.map((item) => (
          <button
            key={item.id}
            aria-pressed={filter === item.id}
            className="focus-visible"
            type="button"
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="challenge-grid" aria-label="挑战赛列表">
        {visibleChallenges.map((challenge) => (
          <article key={challenge.id} className="challenge-card">
            <div
              aria-label={`${challenge.title} 封面`}
              className={`challenge-card__cover challenge-card__cover--${challenge.coverTone}`}
              role="img"
            >
              <span>{challenge.coverLabel}</span>
              <span>LOCAL EDITION / 2026</span>
            </div>
            <div className="challenge-card__body">
              <div className="challenge-card__status-row">
                <span data-status={challenge.status}>{statusLabels[challenge.status]}</span>
                <span>{challenge.theme}</span>
              </div>
              <h2>{challenge.title}</h2>
              <p>{challenge.summary}</p>
              <dl className="challenge-card__facts">
                <div>
                  <dt><CalendarDays aria-hidden="true" />活动时间</dt>
                  <dd>{challenge.period}</dd>
                </div>
                <div>
                  <dt><Trophy aria-hidden="true" />奖金</dt>
                  <dd>{challenge.prize}</dd>
                </div>
                <div>
                  <dt><UsersRound aria-hidden="true" />参与人数</dt>
                  <dd>{participantCount(challenge.participants)} 人参与</dd>
                </div>
              </dl>
              <Link
                aria-label={`查看 ${challenge.title}`}
                className="challenge-card__link focus-visible"
                to={`/challenges/${challenge.id}`}
              >
                查看详情 <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}
