import { afterEach, expect, test, vi } from 'vitest'
import { WirelessCanvasDatabase } from '../project/project-repository'
import { SubjectRepository } from './subject-repository'
import { findSimilarSubjects, subjectUsage, subjectSnapshot, resolveSubjectRequest, prepareSubjectRequest, collectNodeSubjects, restoreTaskSubjects } from './subject-consistency'
import { makeProjectFixture } from '../../test/fixtures'
import type { CreateSubjectInput, SubjectAsset } from './subject-model'
import type { GenerationRequest } from '../generation/generation-adapter'

const databases: WirelessCanvasDatabase[] = []
afterEach(async () => { for (const db of databases.splice(0)) await db.delete() })
function repository() { const db = new WirelessCanvasDatabase(`subject-consistency-${crypto.randomUUID()}`); databases.push(db); return { db, repo: new SubjectRepository(db) } }
const draft: CreateSubjectInput = { name: '雨夜旅人', description: '黑色风衣，短发青年，冷色轮廓光', tags: ['短发', '主角'], coverUrl: 'https://fixture.invalid/subject.png', sampleImages: [], width: 960, height: 1200, mimeType: 'image/png' }
const subject = (): SubjectAsset => ({ ...draft, id: 'subject-1', createdAt: '2026-08-28', updatedAt: '2026-08-28' })
const request = (): GenerationRequest => ({ projectId: 'p', nodeId: 'n', operation: 'regenerate', targetKind: 'image', prompt: '清晨古桥', referenceAssets: [], subjects: [subjectSnapshot(subject())] })

test('similarity uses description and aspect without claiming face identity, supports legacy records', () => {
  const near = { ...draft, coverUrl: 'https://fixture.invalid/other.png' }
  expect(findSimilarSubjects(near, [subject()])[0].score).toBeGreaterThan(0.72)
  expect(findSimilarSubjects({ ...near, description: '红色跑车停在沙漠公路', tags: ['汽车'] }, [subject()])).toEqual([])
  expect(findSimilarSubjects({ ...near, width: undefined, height: undefined }, [subject()])).toHaveLength(1)
  expect(findSimilarSubjects({ ...near, description: '', tags: [] }, [subject()])).toEqual([])
})
test('merge requires an explicit target, preserves existing identity and references, adds unique samples', async () => {
  const { repo, db } = repository()
  const existing = await repo.create(draft)
  const project = makeProjectFixture(); project.nodes[0].subjectId = existing.id; await db.projects.put(project)
  const merged = await repo.merge(existing.id, { ...draft, name: '新的提取名称', coverUrl: 'https://fixture.invalid/new.png', description: '黑色风衣，短发青年，蓝色围巾' })
  expect(merged.id).toBe(existing.id); expect(merged.name).toBe(existing.name)
  expect(merged.sampleImages).toEqual([draft.coverUrl, 'https://fixture.invalid/new.png'])
  expect(merged.description).toContain('蓝色围巾'); expect(await repo.list()).toHaveLength(1)
  expect((await db.projects.get(project.id))!.nodes[0].subjectId).toBe(existing.id)
  await expect(repo.merge('missing', draft)).rejects.toThrow('不存在')
})
test('usage counts active canvas once, inactive canvases, script characters/shots and historical jobs separately', () => {
  const project = makeProjectFixture(); project.nodes[0].subjectId = 'subject-1'
  project.activeCanvasId = 'one'; project.canvases = [{ id: 'one', title: '画布1', nodes: project.nodes, edges: [], groups: [], viewport: { x: 0, y: 0, zoom: 1 }, createdAt: '', updatedAt: '' }, { id: 'two', title: '画布2', nodes: [{ ...project.nodes[0], id: 'other' }], edges: [], groups: [], viewport: { x: 0, y: 0, zoom: 1 }, createdAt: '', updatedAt: '' }]
  project.nodes.push({ ...project.nodes[0], id: 'script', subjectId: undefined, kind: 'script', details: { type: 'script', chapters: [], characters: [{ id: 'char', name: '旅人', description: '黑衣', subjectId: 'subject-1' }], shots: [{ id: 'shot', title: '桥', sceneId: 'scene', prompt: '古桥', shotSize: '全景', cameraAngle: '正面', cameraMovement: '静止', characterIds: ['char'] }] } })
  project.jobs.push({ id: 'job', nodeId: 'script', prompt: '古桥', status: 'succeeded', createdAt: '', updatedAt: '', generationConfig: { targetKind: 'image', referenceAssets: [], subjects: [subjectSnapshot(subject())] } })
  const usage = subjectUsage('subject-1', [project])
  expect(usage).toMatchObject({ nodeReferences: 2, characterReferences: 1, shotReferences: 1, generationCount: 1 })
  expect(usage.projects).toHaveLength(1)
})
test('new generation reads latest subject metadata, sends image once and preserves raw prompt', async () => {
  const { repo } = repository(); const saved = await repo.create(draft)
  const input = { ...request(), subjects: [subjectSnapshot(saved)], referenceAssets: [{ kind: 'image' as const, url: saved.coverUrl, mimeType: 'image/png' }] }
  await repo.update(saved.id, { name: saved.name, description: '白色外套，长发', tags: [] })
  const resolved = await resolveSubjectRequest(input, repo)
  expect(resolved.subjects![0].description).toBe('白色外套，长发')
  const prepared = prepareSubjectRequest(resolved)
  expect(prepared.prompt).toContain('白色外套，长发'); expect(prepared.prompt).toContain('清晨古桥')
  expect(prepared.referenceAssets).toHaveLength(1); expect(input.prompt).toBe('清晨古桥')
  expect(input.subjects![0].description).toBe(draft.description)
})
test('deleted subjects keep reference snapshots, repository failures block instead of silently dropping identity', async () => {
  const { repo } = repository(); const saved = await repo.create(draft)
  const input = { ...request(), subjects: [subjectSnapshot(saved)] }
  await repo.delete(saved.id)
  expect(prepareSubjectRequest(await resolveSubjectRequest(input, repo)).referenceAssets[0].url).toBe(saved.coverUrl)
  await expect(resolveSubjectRequest(input, { get: vi.fn().mockRejectedValue(new Error('indexeddb failed')) })).rejects.toThrow('主体资料读取失败')
})
test('collects only selected node and incoming subject references, legacy prompts become snapshots', () => {
  const project = makeProjectFixture()
  project.nodes[0].subjectId = 'subject-1'; project.nodes[0].versions[0].prompt = '旧描述'
  const target = { ...project.nodes[0], id: 'target', subjectId: undefined }
  project.nodes.push(target); project.edges = [{ id: 'edge', sourceNodeId: project.nodes[0].id, targetNodeId: target.id }]
  expect(collectNodeSubjects(project, target)[0]).toMatchObject({ id: 'subject-1', description: '旧描述' })
  expect(collectNodeSubjects({ ...project, edges: [] }, target)).toEqual([])
})

test('retry restores the confirmed subject snapshots, including no-subject jobs, without mutating originals', () => {
  const original = request(), confirmed = [{ ...subjectSnapshot(subject()), description: '任务确认时的特征' }]
  const restored = restoreTaskSubjects(original, confirmed)
  expect(restored.subjects).toEqual(confirmed)
  confirmed[0].description = '外部更改'
  expect(restored.subjects![0].description).toBe('任务确认时的特征')
  expect(restoreTaskSubjects(original).subjects).toBeUndefined()
  expect(original.subjects).toHaveLength(1)
})
