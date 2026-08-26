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
  tags: string[]
  tracks: Array<{ title: string; description: string }>
  rules: string[]
  timeline: Array<{ title: string; date: string; description: string }>
  awards: Array<{ title: string; description: string }>
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
    tags: ['光影接力导演挑战', '多镜头叙事工作流'],
    tracks: [
      { title: '叙事短片', description: '用完整镜头语言呈现原创故事。' },
      { title: '视觉实验', description: '探索生成影像、风格与声音的边界。' },
      { title: 'Skill 工作流', description: '整理可复用的创作方法与作品结果。' },
    ],
    rules: [
      '作品需围绕同一束光、同一动作或同一情绪落点完成多镜头呼应。',
      '至少包含三个可辨识镜头，并保留画布节点与创作过程。',
      '示例素材仅供结构参考，成片内容与叙事须由创作者独立完成。',
      '本地演示不会自动报名；导出作品后仍需按真实活动要求提交。',
    ],
    timeline: [
      { title: '作品准备', date: '2026.08.01 起', description: '建立项目、角色与镜头结构。' },
      { title: '创作与整理', date: '2026.08.01 — 2026.09.24', description: '完成作品并整理创作过程。' },
      { title: '本地检查', date: '2026.09.25 — 2026.09.30', description: '检查导出文件、标签与项目快照。' },
    ],
    awards: [
      { title: '最佳导演奖', description: '关注叙事调度、镜头设计与整体完成度。' },
      { title: '最佳视觉奖', description: '关注视觉语言、风格一致性与技术表达。' },
      { title: '新锐创作者奖', description: '关注原创思路、成长潜力与创作过程。' },
    ],
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
    tags: ['一公里的城市声景', '城市声音短片'],
    tracks: [
      { title: '声音地图', description: '用环境声串联一公里步行路径。' },
      { title: '城市肖像', description: '以人物与招牌构成城市观察。' },
      { title: '实验混剪', description: '探索声音与生成影像的非线性组合。' },
    ],
    rules: ['作品以一公里内采集或创作的声景为线索。', '需包含可识别的空间变化。', '保留声音与画面节点来源。'],
    timeline: [
      { title: '路线选择', date: '2026.08.08 起', description: '确定步行路径和声音主题。' },
      { title: '采集创作', date: '2026.08.08 — 2026.10.01', description: '整理素材并完成短片。' },
      { title: '作品归档', date: '2026.10.02 — 2026.10.08', description: '完成标签与导出检查。' },
    ],
    awards: [
      { title: '最佳声景奖', description: '关注声音叙事与空间层次。' },
      { title: '城市观察奖', description: '关注真实细节与个人视角。' },
      { title: '实验表达奖', description: '关注声音和影像的新颖组合。' },
    ],
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
    tags: ['旧物醒来时', '物件叙事短片'],
    tracks: [
      { title: '旧物独白', description: '以物件第一视角讲述一段记忆。' },
      { title: '一分钟发现', description: '在一分钟内完成发现与转折。' },
      { title: '材质实验', description: '用视觉质感表现时间痕迹。' },
    ],
    rules: ['作品需围绕一件旧物展开。', '成片应包含清晰的发现或唤醒时刻。', '保留关键创作节点。'],
    timeline: [
      { title: '主题征集', date: '2026.04.12 起', description: '选择旧物并记录背景。' },
      { title: '作品创作', date: '2026.04.12 — 2026.06.12', description: '完成画面、声音与剪辑。' },
      { title: '结果归档', date: '2026.06.20', description: '本地目录记录已颁奖状态。' },
    ],
    awards: [
      { title: '年度故事奖', description: '关注物件与人物关系。' },
      { title: '最佳质感奖', description: '关注材质、光线与时间感。' },
      { title: '新锐叙事奖', description: '关注简洁有力的叙事方法。' },
    ],
  },
]

export function getCreatorChallenge(challengeId: string | undefined) {
  return creatorChallenges.find((challenge) => challenge.id === challengeId)
}
