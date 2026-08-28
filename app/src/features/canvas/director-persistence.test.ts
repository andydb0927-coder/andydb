import { expect, test } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { ProjectRepository, WirelessCanvasDatabase } from '../project/project-repository'
import { addDirectorSceneObject, applyDirectorCameraPreset, applyDirectorLightingPreset, createDefaultDirectorScene } from './director-3d-scene'

test('IndexedDB saves new light/camera/trajectory fields and leaves legacy scenes untouched', async () => {
  const db = new WirelessCanvasDatabase(`director-scene-${crypto.randomUUID()}`)
  const repository = new ProjectRepository(db)
  try {
    const project = makeProjectFixture()
    const legacy = createDefaultDirectorScene()
    const scene = { ...applyDirectorCameraPreset(applyDirectorLightingPreset(addDirectorSceneObject(legacy, 'tree'), 'rim'), 'low'),
      trajectory: { points: [[0, 1, 5], [4, 3, 8]] as [number, number, number][], durationSeconds: 6 } }
    project.nodes[0].details = { type: 'director', shots: [], scene3d: scene }
    project.nodes[1].details = { type: 'director', shots: [], scene3d: legacy, trajectory: { points: [] } }
    await repository.save(project)
    await repository.save(project)
    const loaded = await repository.load(project.id)
    expect(loaded?.nodes[0].details).toEqual(project.nodes[0].details)
    expect(loaded?.nodes[1].details).toEqual(project.nodes[1].details)
    expect((await repository.load(project.id))?.assets).toEqual(project.assets)
  } finally { await db.delete() }
})
