export type PlatformTaskStatus = 'pending' | 'in-progress' | 'completed'

export const platformTasks = [
  {
    id: 'platform-shell',
    order: 1,
    title: '平台骨架',
    description: '全局导航、任务编排与平台级路由',
    targetPath: '/',
  },
  {
    id: 'account-space',
    order: 2,
    title: '账号与空间',
    description: '身份、个人空间、团队入口与权限边界',
    targetPath: '/account',
  },
  {
    id: 'project-home',
    order: 3,
    title: '项目首页',
    description: '最近项目、模板启动、恢复与项目管理',
    targetPath: '/projects',
  },
  {
    id: 'canvas-workflow',
    order: 4,
    title: '画布与工作流',
    description: '节点、连线、依赖关系、撤销与性能',
    targetPath: '/workflows',
  },
  {
    id: 'models-generation',
    order: 5,
    title: '模型与真实生成',
    description: '模型能力、写入门禁、确认与生成队列',
    targetPath: '/models',
  },
  {
    id: 'assets-history',
    order: 6,
    title: '素材与历史',
    description: '上传、复用、版本、生成与导出记录',
    targetPath: '/assets',
  },
  {
    id: 'creative-cards',
    order: 7,
    title: '剧本、角色与世界观',
    description: '结构化创作卡与画布编辑',
    targetPath: '/workflows',
  },
  {
    id: 'workflow-templates',
    order: 8,
    title: '工作流与模板',
    description: '模板目录、任务图、运行、重试与恢复',
    targetPath: '/workflows',
  },
  {
    id: 'professional-timeline',
    order: 9,
    title: '时间线与专业编辑',
    description: '多轨时间线、预览、帧控制与工程状态',
    targetPath: '/',
  },
  {
    id: 'export-publish-share',
    order: 10,
    title: '导出、发布与分享',
    description: '导出任务、项目包、分享与发布边界',
    targetPath: '/assets',
  },
  {
    id: 'community-works',
    order: 11,
    title: '发现、作品与社区',
    description: '作品流、详情、我的作品、搜索与筛选',
    targetPath: '/discover',
  },
  {
    id: 'collaboration-membership',
    order: 12,
    title: '协作与会员',
    description: '评论、成员、权限与权益门禁',
    targetPath: '/account',
  },
  {
    id: 'agent-skill-cli',
    order: 13,
    title: 'Agent、Skill 与 CLI',
    description: '技能目录、执行结果与工作区命令契约',
    targetPath: '/agents',
  },
] as const

export type PlatformTask = (typeof platformTasks)[number]
export type PlatformTaskId = PlatformTask['id']
export type PlatformTaskStatuses = Record<PlatformTaskId, PlatformTaskStatus>

export const defaultPlatformTaskStatuses: PlatformTaskStatuses = {
  'platform-shell': 'completed',
  'account-space': 'completed',
  'project-home': 'completed',
  'canvas-workflow': 'in-progress',
  'models-generation': 'pending',
  'assets-history': 'pending',
  'creative-cards': 'pending',
  'workflow-templates': 'pending',
  'professional-timeline': 'pending',
  'export-publish-share': 'pending',
  'community-works': 'pending',
  'collaboration-membership': 'pending',
  'agent-skill-cli': 'pending',
}

export function isPlatformTaskId(value: string): value is PlatformTaskId {
  return platformTasks.some((task) => task.id === value)
}

export function isPlatformTaskStatus(value: unknown): value is PlatformTaskStatus {
  return value === 'pending' || value === 'in-progress' || value === 'completed'
}
