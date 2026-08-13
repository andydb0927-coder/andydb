export type ChallengeStatus = 'ongoing' | 'awarded'

export interface CreatorChallenge {
  id: string
  title: string
  theme: string
  summary: string
  period: string
  prize: string
  participants: number
  status: ChallengeStatus
  coverLabel: string
  coverTone: 'violet' | 'amber' | 'cyan'
}

export const creatorChallenges: CreatorChallenge[] = [
  {
    id: 'director-master',
    title: 'LibTV Skill 导演大师赛',
    theme: 'Skill 影像创作',
    summary: '用一套可复用的创作 Skill，完成从概念到成片的导演实验。',
    period: '2026.08.01 — 2026.09.30',
    prize: '13 万元现金 + 70 万积分',
    participants: 1286,
    status: 'ongoing',
    coverLabel: 'DIRECTOR\nMASTER',
    coverTone: 'violet',
  },
  {
    id: 'city-stories',
    title: '走，我们扫街去',
    theme: '城市漫游短片',
    summary: '从熟悉的街区里收集灵感，用 AI 记录一次具有城市气味的漫游。',
    period: '2026.08.08 — 2026.10.08',
    prize: '15 万元创作奖池',
    participants: 834,
    status: 'ongoing',
    coverLabel: 'CITY\nWALK',
    coverTone: 'cyan',
  },
  {
    id: 'story-seed',
    title: '「故事的种子」AI 短片征集',
    theme: '原创故事短片',
    summary: '从一句话出发，让微小的故事种子长成完整的影像。',
    period: '2026.04.12 — 2026.06.20',
    prize: '6 万元现金奖池',
    participants: 2156,
    status: 'awarded',
    coverLabel: 'STORY\nSEED',
    coverTone: 'amber',
  },
]

export function getCreatorChallenge(challengeId: string | undefined) {
  return creatorChallenges.find((challenge) => challenge.id === challengeId)
}
