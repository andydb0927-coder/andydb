import Dexie from 'dexie'
import { afterEach, describe, expect, test } from 'vitest'

import { WirelessCanvasDatabase } from '../project/project-repository'
import { SubjectRepository } from './subject-repository'

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

  test('persists reviewed structured extraction and token usage across repository instances', async () => {
    const database = new WirelessCanvasDatabase(`subjects-ai-${crypto.randomUUID()}`)
    databaseNames.push(database.name)
    const repository = new SubjectRepository(database)
    const subject = await repository.create({ name: '蓝衣旅人', description: '短发，蓝色外套', tags: ['人物'], coverUrl: 'data:image/png;base64,YQ==', sampleImages: [],
      aiExtraction: { appearance: '短发', clothing: '蓝色外套', providerId: 'ai-subject-extraction', modelName: '豆包', extractedAt: '2026-08-27T08:00:00Z', usage: { providerId: 'ai-subject-extraction', providerName: '火山方舟', modelName: '豆包', cost: 1, currency: 'credits', inputTokens: 2000, outputTokens: 300, estimatedCostCny: 0.021 } },
    })
    const reopened = new SubjectRepository(new WirelessCanvasDatabase(database.name))
    expect((await reopened.get(subject.id))?.aiExtraction).toEqual(subject.aiExtraction)
    await reopened.update(subject.id, { name: '新名', description: '新描述', tags: [] })
    expect((await reopened.get(subject.id))?.aiExtraction?.usage?.estimatedCostCny).toBe(0.021)
    expect(await database.projects.count()).toBe(0)
    expect(await database.libraryAssets.count()).toBe(0)
  })
})
