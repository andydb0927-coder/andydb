import { describe, expect, test } from 'vitest'

import {
  defaultPlatformTaskStatuses,
  platformTasks,
} from './platform-tasks'

describe('platform task catalogue', () => {
  test('keeps all thirteen LibTV feature domains in execution order', () => {
    expect(platformTasks).toHaveLength(13)
    expect(platformTasks.map((task) => task.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ])
    expect(platformTasks.map((task) => task.title)).toEqual([
      '平台骨架',
      '账号与空间',
      '项目首页',
      '画布与工作流',
      '模型与真实生成',
      '素材与历史',
      '剧本、角色与世界观',
      '工作流与模板',
      '时间线与专业编辑',
      '导出、发布与分享',
      '发现、作品与社区',
      '协作与会员',
      'Agent、Skill 与 CLI',
    ])
  })

  test('advances to structured creative cards after asset lifecycle history', () => {
    expect(defaultPlatformTaskStatuses['platform-shell']).toBe('completed')
    expect(defaultPlatformTaskStatuses['account-space']).toBe('completed')
    expect(defaultPlatformTaskStatuses['project-home']).toBe('completed')
    expect(defaultPlatformTaskStatuses['canvas-workflow']).toBe('completed')
    expect(defaultPlatformTaskStatuses['models-generation']).toBe('completed')
    expect(defaultPlatformTaskStatuses['assets-history']).toBe('completed')
    expect(defaultPlatformTaskStatuses['creative-cards']).toBe('in-progress')
    expect(Object.keys(defaultPlatformTaskStatuses)).toHaveLength(13)
  })
})
