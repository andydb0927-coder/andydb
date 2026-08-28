import Dexie from 'dexie'
import { afterEach, describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import { createTimelineProject } from './timeline-project'
import { TimelineRepository } from './timeline-repository'
import { addClip, addSubtitleClip } from './timeline-project'
import { addAudioTrack, editSubtitle, setAudioEnvelope, setClipPlacement, setTransition } from './timeline-editing'

const databaseNames: string[] = []

function createRepository() {
  const name = `wireless-canvas-timeline-${crypto.randomUUID()}`
  databaseNames.push(name)
  return new TimelineRepository(new WirelessCanvasDatabase(name))
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('timeline repository', () => {
  test('persists new transition subtitle and multi-audio fields without changing schema or project data', async () => {
    const repository = createRepository()
    let timeline = createTimelineProject({ ...makeProjectFixture(), timeline: [] })
    const source = { id: 'p', name: 'p', kind: 'image' as const, durationSeconds: 3, source: { type: 'library-asset' as const, url: '/p.png', mimeType: 'image/png' } }
    timeline = addClip(addClip(timeline, source), source)
    timeline = setTransition(timeline, timeline.tracks.find(t => t.kind === 'image')!.clips[1].id, { kind: 'black', durationSeconds: 1 })
    timeline = addSubtitleClip(timeline, '字幕', 1, 2)
    timeline = editSubtitle(timeline, timeline.tracks.find(t => t.kind === 'subtitle')!.clips[0].id, { text: '字幕', startSeconds: 1, endSeconds: 3, style: { fontSize: 80, bold: true } })
    timeline = addClip(timeline, { ...source, kind: 'audio' })
    timeline = addAudioTrack(timeline)
    const audio = timeline.tracks.find(t => t.kind === 'audio')!.clips[0]
    timeline = setClipPlacement(timeline, audio.id, timeline.tracks.at(-1)!.id, 1)
    timeline = setAudioEnvelope(timeline, audio.id, [{ timeSeconds: 0, value: 0 }, { timeSeconds: 3, value: 1 }])
    await repository.save(timeline)
    expect(await repository.load(timeline.projectId)).toEqual(timeline)
    expect(timeline.schemaVersion).toBe(1)
  })
  test('round-trips and overwrites a complete timeline project', async () => {
    const repository = createRepository()
    const timeline = createTimelineProject(makeProjectFixture())
    await repository.save(timeline)

    expect(await repository.load(timeline.projectId)).toEqual(timeline)

    const updated = { ...timeline, title: '剪辑版 B' }
    await repository.save(updated)
    expect(await repository.load(timeline.projectId)).toEqual(updated)
  })

  test('isolates timeline aggregates by owning project', async () => {
    const repository = createRepository()
    const first = createTimelineProject(makeProjectFixture())
    const second = { ...first, id: 'other', projectId: 'other', title: '其它项目' }
    await Promise.all([repository.save(first), repository.save(second)])

    expect(await repository.load(first.projectId)).toEqual(first)
    expect(await repository.load('other')).toEqual(second)
    expect(await repository.load('missing')).toBeUndefined()
  })

  test('opens a version 4 database without losing projects or workflow schema', async () => {
    const name = `wireless-canvas-timeline-legacy-${crypto.randomUUID()}`
    databaseNames.push(name)
    const legacy = new Dexie(name)
    legacy.version(4).stores({
      projects: 'id, updatedAt',
      libraryAssets: 'id, createdAt, kind, source, name, &fingerprint',
      workflowRuns: 'id, projectId, updatedAt, status',
    })
    await legacy.open()
    const project = makeProjectFixture()
    await legacy.table('projects').put(project)
    legacy.close()

    const database = new WirelessCanvasDatabase(name)
    const repository = new TimelineRepository(database)

    expect(await new ProjectRepository(database).load(project.id)).toEqual(project)
    expect(await repository.load(project.id)).toBeUndefined()

    const timeline = createTimelineProject(project)
    await repository.save(timeline)
    expect(await repository.load(project.id)).toEqual(timeline)
  })
})
