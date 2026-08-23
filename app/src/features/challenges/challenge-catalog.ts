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
    title: '光影接力导演挑战',
    theme: '多镜头叙事工作流',
    summary: '让三个独立镜头共享一束光、一段动作和同一个情绪落点。',
    period: '2026.08.01 — 2026.09.30',
    prize: '本地荣誉徽章与专题推荐',
    participants: 1286,
    status: 'ongoing',
    coverLabel: 'LIGHT\nRELAY',
    coverTone: 'violet',
  },
  {
    id: 'city-stories',
    title: '一公里的城市声景',
    theme: '城市声音短片',
    summary: '从一公里步行路径中收集声音、招牌和行人片段，组成城市肖像。',
    period: '2026.08.08 — 2026.10.08',
    prize: '城市影像专题推荐',
    participants: 834,
    status: 'ongoing',
    coverLabel: 'CITY\nSOUND',
    coverTone: 'cyan',
  },
  {
    id: 'story-seed',
    title: '旧物醒来时',
    theme: '物件叙事短片',
    summary: '选择一件旧物，用画面和声音讲清它被再次发现的那一分钟。',
    period: '2026.04.12 — 2026.06.20',
    prize: '年度作品集入选',
    participants: 2156,
    status: 'awarded',
    coverLabel: 'OBJECT\nSTORY',
    coverTone: 'amber',
  },
]

export function getCreatorChallenge(challengeId: string | undefined) {
  return creatorChallenges.find((challenge) => challenge.id === challengeId)
}
