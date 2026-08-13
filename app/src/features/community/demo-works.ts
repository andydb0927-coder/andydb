import { buildExampleProject } from '../project/example-project'
import type { Project } from '../project/model'
import { createTimelineProject } from '../timeline/timeline-project'
import {
  createPublishedWork,
  type PublishedWork,
} from './community-model'

interface DemoDefinition {
  id: string
  projectId: string
  title: string
  author: string
  tags: string[]
  coverUrl: string
  publishedAt: string
  metrics: PublishedWork['metrics']
}

const definitions: DemoDefinition[] = [
  {
    id: 'demo-work-frost-river',
    projectId: 'demo-project-frost-river',
    title: '霜河渡',
    author: '无线画布',
    tags: ['Seedance2.5', '精选画布', '专业影视', '国风', '雨夜'],
    coverUrl: '/demo/shot-river.png',
    publishedAt: '2026-08-12T09:00:00.000Z',
    metrics: { views: 328, likes: 46, favorites: 31 },
  },
  {
    id: 'demo-work-rooftop-letter',
    projectId: 'demo-project-rooftop-letter',
    title: '屋顶来信',
    author: '林野',
    tags: ['Seedance2.5', '精选画布', '专业影视', '城市', '电影感'],
    coverUrl: '/demo/shot-rooftop.png',
    publishedAt: '2026-08-10T14:30:00.000Z',
    metrics: { views: 512, likes: 88, favorites: 54 },
  },
  {
    id: 'demo-work-rain-street',
    projectId: 'demo-project-rain-street',
    title: '雨巷回声',
    author: '阿遥',
    tags: ['短剧漫剧', '雨夜', '氛围', '短片'],
    coverUrl: '/demo/scene-rain-street.png',
    publishedAt: '2026-08-08T06:15:00.000Z',
    metrics: { views: 214, likes: 39, favorites: 27 },
  },
  {
    id: 'demo-work-soda-summer',
    projectId: 'demo-project-soda-summer',
    title: '汽水盛夏',
    author: '栖光创意',
    tags: ['商业广告', '产品', '夏日'],
    coverUrl: '/demo/shot-rooftop.png',
    publishedAt: '2026-08-06T11:20:00.000Z',
    metrics: { views: 706, likes: 126, favorites: 83 },
  },
  {
    id: 'demo-work-mecha-awakening',
    projectId: 'demo-project-mecha-awakening',
    title: '机甲苏醒时',
    author: '像素引擎',
    tags: ['动漫游戏', '机甲', '概念片'],
    coverUrl: '/demo/shot-river.png',
    publishedAt: '2026-08-04T03:40:00.000Z',
    metrics: { views: 894, likes: 167, favorites: 112 },
  },
  {
    id: 'demo-work-one-minute-light',
    projectId: 'demo-project-one-minute-light',
    title: '一分钟读懂光影',
    author: '镜头课代表',
    tags: ['教育生活', '讲解', '摄影'],
    coverUrl: '/demo/scene-rain-street.png',
    publishedAt: '2026-08-02T08:10:00.000Z',
    metrics: { views: 441, likes: 72, favorites: 96 },
  },
  {
    id: 'demo-work-paper-moon',
    projectId: 'demo-project-paper-moon',
    title: '纸月亮便利店',
    author: '漫游叙事社',
    tags: ['短剧漫剧', '奇幻', '城市'],
    coverUrl: '/demo/shot-rooftop.png',
    publishedAt: '2026-07-30T15:00:00.000Z',
    metrics: { views: 638, likes: 104, favorites: 69 },
  },
  {
    id: 'demo-work-tea-mountain',
    projectId: 'demo-project-tea-mountain',
    title: '山岚入茶',
    author: '一帧商业',
    tags: ['商业广告', '东方美学', '产品'],
    coverUrl: '/demo/shot-river.png',
    publishedAt: '2026-07-28T05:30:00.000Z',
    metrics: { views: 752, likes: 139, favorites: 101 },
  },
]

function demoProject(definition: DemoDefinition): Project {
  const base = buildExampleProject()
  const assetId = 'asset-storyboard-01'
  return {
    ...base,
    id: definition.projectId,
    title: definition.title,
    assets: base.assets.map((asset) =>
      asset.id === assetId ? { ...asset, url: definition.coverUrl } : asset,
    ),
    timeline: [
      {
        id: `${definition.projectId}:timeline:visual`,
        nodeId: 'storyboard-01',
        order: 0,
        durationSeconds: 8,
        track: 'video',
      },
    ],
  }
}

export function buildDemoWorks(): PublishedWork[] {
  return definitions.map((definition) => {
    const project = demoProject(definition)
    const work = createPublishedWork(
      project,
      createTimelineProject(project, {
        now: () => definition.publishedAt,
        randomId: () => `${definition.id}:timeline`,
      }),
      {
        title: definition.title,
        author: definition.author,
        tags: definition.tags,
      },
      undefined,
      {
        now: () => definition.publishedAt,
        randomId: () => definition.id,
      },
    )
    return {
      ...work,
      authorVerified: true,
      metrics: { ...definition.metrics },
    }
  })
}
