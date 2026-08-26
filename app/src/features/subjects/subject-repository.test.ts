import Dexie from 'dexie'
import { afterEach, describe, expect, test } from 'vitest'

import { WirelessCanvasDatabase } from '../project/project-repository'
import {
  aiSubjectExtractionProvider,
  SubjectRepository,
} from './subject-repository'

const databaseNames: string[] = []

function createRepository() {
  const name = `wireless-canvas-subjects-${crypto.randomUUID()}`
  databaseNames.push(name)
  return new SubjectRepository(new WirelessCanvasDatabase(name), {
    now: () => '2026-08-27T08:00:00.000Z',
    randomId: () => 'subject-local-1',
  })
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('subject repository', () => {
  test('persists a subject from an image result and keeps it globally reusable', async () => {
    const repository = createRepository()

    const subject = await repository.create({
      name: '雨夜旅人',
      description: '黑色风衣与冷色轮廓光',
      tags: ['主角', '雨夜', '主角'],
      coverUrl: 'data:image/png;base64,subject-cover',
      sampleImages: ['data:image/png;base64,subject-cover'],
      sourceAssetId: 'asset-image-1',
      sourceProjectId: 'project-source',
    })

    expect(subject).toMatchObject({
      id: 'subject-local-1',
      tags: ['主角', '雨夜'],
      sourceProjectId: 'project-source',
    })
    expect(await repository.list()).toEqual([subject])
    expect(await repository.get(subject.id)).toEqual(subject)
  })

  test('edits and deletes a subject without project scoping', async () => {
    const repository = createRepository()
    const subject = await repository.create({
      name: '旧名称',
      description: '',
      tags: [],
      coverUrl: 'data:image/png;base64,cover',
      sampleImages: ['data:image/png;base64,cover'],
      sourceProjectId: 'project-a',
    })

    const updated = await repository.update(subject.id, {
      name: '跨项目角色',
      description: '可在任意项目复用',
      tags: ['角色', '可复用'],
    })

    expect(updated).toMatchObject({
      name: '跨项目角色',
      description: '可在任意项目复用',
      tags: ['角色', '可复用'],
    })
    await expect(repository.delete(subject.id)).resolves.toBe(true)
    await expect(repository.list()).resolves.toEqual([])
  })

  test('keeps AI identity extraction as an explicit disabled provider', () => {
    expect(aiSubjectExtractionProvider).toMatchObject({
      kind: 'placeholder',
      enabled: false,
      disabledReason: '待接入 AI 身份提取',
    })
  })
})
