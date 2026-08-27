import { describe, expect, test, vi } from 'vitest'

import type { Project } from '../project/model'
import { createQuickProjectRedirect } from './quick-create-project'

describe('quick project creation', () => {
  test('coalesces concurrent creation of the same intent but permits the next deliberate creation', async () => {
    let finishSave: () => void = () => { throw new Error('Save has not started') }
    const repository = { save: vi.fn(() => new Promise<void>((resolve) => { finishSave = resolve })) }
    const url = 'http://wireless-canvas.local/projects/new?recipe=cinematic-story'
    const first = createQuickProjectRedirect(url, repository)
    const second = createQuickProjectRedirect(url, repository)
    expect(repository.save).toHaveBeenCalledTimes(1)
    finishSave()
    expect((await first).headers.get('Location')).toBe((await second).headers.get('Location'))
    const third = createQuickProjectRedirect(url, repository)
    expect(repository.save).toHaveBeenCalledTimes(2)
    finishSave()
    expect((await third).headers.get('Location')).not.toBe((await first).headers.get('Location'))
  })

  test('clears a rejected pending creation and keeps distinct recipe intents independent', async () => {
    const repository = { save: vi.fn(async (_project: Project) => undefined) }
    repository.save.mockRejectedValueOnce(new Error('Storage is unavailable'))
    const url = 'http://wireless-canvas.local/projects/new'
    await expect(createQuickProjectRedirect(url, repository)).rejects.toThrow('Storage is unavailable')
    await expect(createQuickProjectRedirect(url, repository)).resolves.toHaveProperty('status', 302)
    await Promise.all([
      createQuickProjectRedirect(`${url}?recipe=cinematic-story`, repository),
      createQuickProjectRedirect(`${url}?challenge=director-master`, repository),
    ])
    expect(repository.save).toHaveBeenCalledTimes(4)
  })

  test('persists an automatically named empty project and redirects to its starter canvas', async () => {
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
    expect(savedProject.nodes).toEqual([])
    expect(savedProject.edges).toEqual([])
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(`/project/${savedProject.id}`)
  })

  test('honors a valid recipe query and falls back to an empty canvas for an unknown recipe', async () => {
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
    expect(projects[0].nodes.map((node) => node.kind)).toEqual([
      'character',
      'scene',
      'storyboard',
    ])
    expect(projects[1].intent).toBe('从电影感叙事开始自由创作')
    expect(projects[1].nodes).toEqual([])
  })

  test('persists challenge identity and tags when creation starts from an activity', async () => {
    const repository = {
      save: vi.fn(async (_project: Project) => undefined),
    }

    await createQuickProjectRedirect(
      'http://wireless-canvas.local/projects/new?challenge=director-master',
      repository,
      new Date('2026-08-27T08:00:00.000Z'),
    )

    expect(repository.save.mock.calls[0][0]).toMatchObject({
      challengeId: 'director-master',
      challengeTags: ['光影接力导演挑战', '多镜头叙事工作流'],
    })
  })
})
