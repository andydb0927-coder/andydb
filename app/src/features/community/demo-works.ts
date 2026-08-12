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
    tags: ['国风', '剧情', '雨夜'],
    coverUrl: '/demo/shot-river.png',
    publishedAt: '2026-08-12T09:00:00.000Z',
    metrics: { views: 328, likes: 46, favorites: 31 },
  },
  {
    id: 'demo-work-rooftop-letter',
    projectId: 'demo-project-rooftop-letter',
    title: '屋顶来信',
    author: '林野',
    tags: ['城市', '电影感', '夜景'],
    coverUrl: '/demo/shot-rooftop.png',
    publishedAt: '2026-08-10T14:30:00.000Z',
    metrics: { views: 512, likes: 88, favorites: 54 },
  },
  {
    id: 'demo-work-rain-street',
    projectId: 'demo-project-rain-street',
    title: '雨巷回声',
    author: '阿遥',
    tags: ['雨夜', '氛围', '短片'],
    coverUrl: '/demo/scene-rain-street.png',
    publishedAt: '2026-08-08T06:15:00.000Z',
    metrics: { views: 214, likes: 39, favorites: 27 },
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
    return { ...work, metrics: { ...definition.metrics } }
  })
}
