import { describe, expect, test, vi } from 'vitest'

import {
  EXAMPLE_PROJECT_ID,
  ensureExampleProject,
} from './example-project'
import { makeProjectFixture } from '../../test/fixtures'

describe('example project', () => {
  test('persists the example project when it is not already present', async () => {
    const repository = {
      load: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
    }

    const project = await ensureExampleProject(repository)

    expect(project.id).toBe(EXAMPLE_PROJECT_ID)
    expect(repository.save).toHaveBeenCalledWith(project)
  })

  test('returns an existing example without writing another copy', async () => {
    const existing = { ...makeProjectFixture(), id: EXAMPLE_PROJECT_ID }
    const repository = {
      load: vi.fn().mockResolvedValue(existing),
      save: vi.fn(),
    }

    await expect(ensureExampleProject(repository)).resolves.toBe(existing)
    expect(repository.save).not.toHaveBeenCalled()
  })
})
