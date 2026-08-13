export type HomeSkillCategory = '专业影视' | '商业广告' | '音乐MV'
export type HomeContentKind = 'activity' | 'mode' | 'skill' | 'capability'

interface HomeContentBase {
  id: string
  kind: HomeContentKind
  title: string
  description: string
  order: number
  category?: string
  imageUrl?: string
  author?: string
  usageCount?: number
  targetPath?: '/models' | '/workflows' | '/agents'
  prompt?: string
  ctaLabel?: string
  durationSeconds?: number
}

export interface HomeActivityContent extends HomeContentBase {
  kind: 'activity'
  ctaLabel: string
  durationSeconds: number
}

export interface HomeModeContent extends HomeContentBase {
  kind: 'mode'
  prompt: string
}

export interface HomeSkillContent extends HomeContentBase {
  kind: 'skill'
  category: HomeSkillCategory
  imageUrl: string
  author: string
  usageCount: number
  prompt: string
}

export interface HomeCapabilityContent extends HomeContentBase {
  kind: 'capability'
  targetPath: '/models' | '/workflows' | '/agents'
  ctaLabel: string
}

export type HomeContentRecord =
  | HomeActivityContent
  | HomeModeContent
  | HomeSkillContent
  | HomeCapabilityContent

const homeContentSeed: HomeContentRecord[] = [
  {
    id: 'home-activity-summer-story',
    kind: 'activity',
    title: '灵感开拍季：完成第一张故事画布',
    description: '限时体验本地创作工作流，所有内容只保存在当前设备。',
    ctaLabel: '立即创作',
    durationSeconds: 72 * 60 * 60,
    order: 10,
  },
  {
    id: 'home-mode-long-video',
    kind: 'mode',
    title: '直出超长视频',
    description: '从完整故事梗概拆解章节、场景与连续镜头。',
    prompt: '超长视频模式：请先规划章节节奏、角色连续性与长叙事镜头结构。',
    order: 20,
  },
  {
    id: 'home-mode-reshoot',
    kind: 'mode',
    title: '片段重拍',
    description: '锁定人物与场景，只重做需要调整的镜头片段。',
    prompt: '片段重拍模式：请标记需要重拍的片段，并保留人物、场景和前后镜头连续性。',
    order: 21,
  },
  {
    id: 'home-mode-smart-reference',
    kind: 'mode',
    title: '智能引用',
    description: '把画布素材作为角色、构图与风格参考。',
    prompt: '智能引用模式：请在画布中添加参考素材，并说明需要继承的角色、构图或风格。',
    order: 22,
  },
  {
    id: 'home-mode-explainer',
    kind: 'mode',
    title: '讲解视频',
    description: '组织知识要点、旁白和配套视觉说明。',
    prompt: '讲解视频模式：请按知识要点规划旁白、画面例证、字幕与章节结构。',
    order: 23,
  },
  {
    id: 'home-mode-remix',
    kind: 'mode',
    title: '素材混剪',
    description: '按节奏重组多段素材，快速形成成片结构。',
    prompt: '素材混剪模式：请导入素材并按主题、情绪和节奏规划剪辑顺序。',
    order: 24,
  },
  {
    id: 'home-mode-frame-analysis',
    kind: 'mode',
    title: '逐帧拉片',
    description: '拆解镜头时长、构图、运动与声音设计。',
    prompt: '逐帧拉片模式：请从镜头时长、景别、构图、运动、表演与声音逐项分析。',
    order: 25,
  },
  {
    id: 'home-skill-cinematic-story',
    kind: 'skill',
    category: '专业影视',
    title: '电影叙事分镜师',
    description: '把故事梗概拆成角色动机、场景调度与镜头组。',
    imageUrl: '/demo/shot-river.png',
    author: '无线画布实验室',
    usageCount: 2840,
    prompt: '使用“电影叙事分镜师”Skill：从人物动机开始，输出场景节拍和可拍摄的镜头组。',
    order: 30,
  },
  {
    id: 'home-skill-continuity',
    kind: 'skill',
    category: '专业影视',
    title: '连续性导演',
    description: '检查服装、光线、轴线与动作衔接的一致性。',
    imageUrl: '/demo/scene-rain-street.png',
    author: '林野',
    usageCount: 1926,
    prompt: '使用“连续性导演”Skill：建立人物、服装、场景、光线和动作连续性清单。',
    order: 31,
  },
  {
    id: 'home-skill-brand-film',
    kind: 'skill',
    category: '商业广告',
    title: '品牌氛围片',
    description: '从品牌关键词生成统一视觉母题与产品镜头。',
    imageUrl: '/demo/shot-rooftop.png',
    author: '栖光创意',
    usageCount: 3612,
    prompt: '使用“品牌氛围片”Skill：提炼品牌关键词，规划视觉母题、产品英雄镜头与收束文案。',
    order: 40,
  },
  {
    id: 'home-skill-product-demo',
    kind: 'skill',
    category: '商业广告',
    title: '产品功能导演',
    description: '用问题、功能和结果三段式组织产品演示。',
    imageUrl: '/demo/shot-river.png',
    author: '一帧商业',
    usageCount: 2155,
    prompt: '使用“产品功能导演”Skill：按用户问题、功能演示、结果证明三段式规划商业短片。',
    order: 41,
  },
  {
    id: 'home-skill-mv-rhythm',
    kind: 'skill',
    category: '音乐MV',
    title: '节拍镜头编舞',
    description: '围绕段落和重拍设计镜头运动与转场。',
    imageUrl: '/demo/scene-rain-street.png',
    author: '拍点工作室',
    usageCount: 1748,
    prompt: '使用“节拍镜头编舞”Skill：按前奏、主歌、副歌和间奏标注节拍镜头与转场。',
    order: 50,
  },
  {
    id: 'home-skill-mv-visual',
    kind: 'skill',
    category: '音乐MV',
    title: '音乐视觉概念师',
    description: '把歌词意象转译成色彩、场景和表演概念。',
    imageUrl: '/demo/shot-rooftop.png',
    author: '回声制造',
    usageCount: 1329,
    prompt: '使用“音乐视觉概念师”Skill：提取歌词意象，建立色彩、场景、造型与表演概念。',
    order: 51,
  },
  {
    id: 'home-capability-video-draft',
    kind: 'capability',
    title: '本地视频草稿能力',
    description: '用演示帧验证镜头生成、版本选择与时间线流转。',
    targetPath: '/models',
    ctaLabel: '查看模型能力',
    order: 60,
  },
  {
    id: 'home-capability-director',
    kind: 'capability',
    title: 'AI 导演台',
    description: '通过本地指令编排角色、场景与镜头任务。',
    targetPath: '/agents',
    ctaLabel: '进入导演台',
    order: 61,
  },
  {
    id: 'home-capability-workflow',
    kind: 'capability',
    title: '三维预演工作流',
    description: '用节点模板规划场景、机位和制作步骤。',
    targetPath: '/workflows',
    ctaLabel: '浏览工作流',
    order: 62,
  },
  {
    id: 'home-capability-agent',
    kind: 'capability',
    title: '本地创作 Agent',
    description: '装载 Skill，在不离开设备的前提下拆解创意。',
    targetPath: '/agents',
    ctaLabel: '查看 Agent',
    order: 63,
  },
]

export function buildHomeContentSeed(): HomeContentRecord[] {
  return homeContentSeed.map((record) => ({ ...record }))
}
