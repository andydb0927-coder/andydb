import { describe, expect, test, vi } from 'vitest'

import type { Project } from '../project/model'
import { createQuickProjectRedirect } from './quick-create-project'

describe('quick project creation', () => {
  test('persists an automatically named cinematic project and redirects to its canvas', async () => {
    const repository = {
      save: vi.fn(async (_project: Project) => undefined),
    }

    const response = await createQuickProjectRedirect(
      'http://wireless-canvas.local/projects/new',
      repository,
      new Date('2026-08-13T10:08:00.000Z'),
    )

    expect(repository.save).toHaveBeenCalledTimes(1)
    const savedProject = repository.save.mock.calls[0][0]
    expect(savedProject).toMatchObject({
      title: '未命名项目 · 2026-08-13 18:08',
      intent: '从电影感叙事开始自由创作',
    })
    expect(savedProject.nodes.map((node) => node.kind)).toEqual([
      'character',
      'scene',
      'storyboard',
    ])
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(`/project/${savedProject.id}`)
  })

  test('honors a valid recipe query and falls back safely for an unknown recipe', async () => {
    const projects: Project[] = []
    const repository = {
      save: vi.fn(async (project: Project) => {
        projects.push(project)
      }),
    }

    await createQuickProjectRedirect(
      'http://wireless-canvas.local/projects/new?recipe=brand-atmosphere',
      repository,
      new Date('2026-08-13T10:08:00.000Z'),
    )
    await createQuickProjectRedirect(
      'http://wireless-canvas.local/projects/new?recipe=unknown',
      repository,
      new Date('2026-08-13T10:09:00.000Z'),
    )

    expect(projects[0].intent).toBe('从品牌氛围片开始自由创作')
    expect(projects[1].intent).toBe('从电影感叙事开始自由创作')
  })
})
