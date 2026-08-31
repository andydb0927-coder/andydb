import type { Project } from '../features/project/model'

export function makeProjectFixture(): Project {
  return {
    id: 'project-frost-river',
    title: '霜河渡',
    intent: '雨夜寻找失踪的弟弟',
    createdAt: '2026-08-06T08:00:00.000Z',
    updatedAt: '2026-08-06T08:00:00.000Z',
    assets: [
      {
        id: 'asset-shot-river-v1',
        kind: 'image',
        url: '/demo/shot-river.png',
        mimeType: 'image/png',
        width: 1920,
        height: 1080,
      },
      {
        id: 'asset-rain-audio',
        kind: 'audio',
        url: 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==',
        mimeType: 'audio/wav',
        durationSeconds: 12,
      },
    ],
    nodes: [
      {
        id: 'shot-1',
        kind: 'storyboard',
        title: '河岸寻人',
        position: { x: 120, y: 240 },
        versions: [
          {
            id: 'version-shot-river-v1',
            createdAt: '2026-08-06T08:00:00.000Z',
            prompt: '远景，雨夜河岸',
            assetId: 'asset-shot-river-v1',
          },
        ],
        activeVersionId: 'version-shot-river-v1',
        sourceChanged: false,
      },
      {
        id: 'rain-audio',
        kind: 'preview',
        title: '雨声音轨',
        position: { x: 520, y: 240 },
        versions: [
          {
            id: 'version-rain-audio-v1',
            createdAt: '2026-08-06T08:01:00.000Z',
            prompt: '持续的雨声与远处水流',
            assetId: 'asset-rain-audio',
          },
        ],
        activeVersionId: 'version-rain-audio-v1',
        sourceChanged: false,
      },
    ],
    edges: [
      {
        id: 'edge-shot-to-audio',
        sourceNodeId: 'shot-1',
        targetNodeId: 'rain-audio',
      },
    ],
    timeline: [
      {
        id: 'timeline-shot-1',
        nodeId: 'shot-1',
        order: 0,
        durationSeconds: 8,
        track: 'video',
      },
      {
        id: 'timeline-rain-audio',
        nodeId: 'rain-audio',
        order: 1,
        durationSeconds: 12,
        track: 'audio',
      },
    ],
    jobs: [
      {
        id: 'generation-job-shot-1',
        nodeId: 'shot-1',
        status: 'succeeded',
        prompt: '远景，雨夜河岸',
        createdAt: '2026-08-06T07:59:00.000Z',
        updatedAt: '2026-08-06T08:00:00.000Z',
        assetId: 'asset-shot-river-v1',
      },
    ],
    exportJobs: [],
  }
}
