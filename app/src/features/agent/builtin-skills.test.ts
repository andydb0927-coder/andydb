import { describe, expect, test } from 'vitest'

import type { Project } from '../project/model'
import { createTimelineProject } from '../timeline/timeline-project'
import { builtinAgentSkills, builtinSkillRegistry } from './builtin-skills'

const project: Project = {
  id: 'project-1',
  title: '雨夜追寻',
  intent: '主角在雨夜寻找失踪同伴',
  createdAt: '2026-08-13T08:00:00.000Z',
  updatedAt: '2026-08-13T09:00:00.000Z',
  assets: [
    { id: 'image-1', kind: 'image', url: '/a.png', mimeType: 'image/png' },
    { id: 'video-1', kind: 'video', url: '/b.mp4', mimeType: 'video/mp4', durationSeconds: 8 },
    { id: 'audio-orphan', kind: 'audio', url: '/c.mp3', mimeType: 'audio/mpeg', durationSeconds: 12 },
  ],
  nodes: [
    {
      id: 'shot-1', kind: 'storyboard', title: '屋顶重逢', position: { x: 0, y: 0 },
      versions: [{ id: 'v1', createdAt: '2026-08-13T08:10:00.000Z', prompt: '雨幕中的屋顶', assetId: 'image-1' }],
      activeVersionId: 'v1', sourceChanged: false,
    },
    {
      id: 'video-node', kind: 'video', title: '奔跑片段', position: { x: 300, y: 0 },
      versions: [{ id: 'v2', createdAt: '2026-08-13T08:20:00.000Z', prompt: '主角奔跑', assetId: 'video-1' }],
      activeVersionId: 'v2', sourceChanged: true,
    },
  ],
  edges: [],
  timeline: [{ id: 'legacy-1', nodeId: 'video-node', order: 0, durationSeconds: 8, track: 'video' }],
  jobs: [{ id: 'failed-1', nodeId: 'video-node', status: 'failed', prompt: 'x', createdAt: '2026-08-13T08:00:00.000Z', updatedAt: '2026-08-13T08:00:00.000Z' }],
  exportJobs: [],
}

describe('built-in local Agent skills', () => {
  test('exposes five unique deterministic skills', () => {
    expect(builtinAgentSkills).toHaveLength(5)
    expect(new Set(builtinAgentSkills.map(({ id }) => id)).size).toBe(5)
    expect(builtinAgentSkills.every(({ version }) => version === 1)).toBe(true)
  })

  test('builds a requested batch of storyboard prompts', async () => {
    const result = await builtinSkillRegistry.execute(
      'storyboard.prompt-batch',
      { count: 3, style: '克制写实' },
      { project },
    )
    expect(result.summary).toContain('3 条')
    expect(result.content).toContain('镜头 01')
    expect(result.content).toContain('克制写实')
    expect(result.content).toContain(project.intent)
  })

  test('reports assets by kind and identifies orphan assets', async () => {
    const result = await builtinSkillRegistry.execute('assets.organize-report', {}, { project })
    expect(result.content).toContain('图片 1 · 视频 1 · 音频 1')
    expect(result.content).toContain('未被画布引用：1')
    expect(result.content).toContain('audio-orphan')
  })

  test('calculates duration from the professional timeline when supplied', async () => {
    const timeline = createTimelineProject(project, {
      now: () => '2026-08-13T10:00:00.000Z',
      randomId: () => 'fixed',
    })
    const result = await builtinSkillRegistry.execute(
      'timeline.duration-stats',
      {},
      { project, timeline },
    )
    expect(result.content).toContain('成片时长：8.00 秒')
    expect(result.content).toContain('视频轨道：1 个片段 / 8.00 秒')
  })

  test('generates local publishing copy from explicit tone and highlights', async () => {
    const result = await builtinSkillRegistry.execute(
      'publishing.copywriter',
      { tone: '幕后手记', highlights: '雨夜、追寻、重逢' },
      { project },
    )
    expect(result.content).toContain('《雨夜追寻》')
    expect(result.content).toContain('幕后手记')
    expect(result.content).toContain('#雨夜')
  })

  test('checks backup risks without accessing files or cloud state', async () => {
    const result = await builtinSkillRegistry.execute('project.backup-check', {}, { project })
    expect(result.summary).toContain('3 项需关注')
    expect(result.content).toContain('存在 1 个未被引用素材')
    expect(result.content).toContain('存在 1 个失败任务')
    expect(result.content).toContain('存在 1 个来源已变化节点')
  })
})
